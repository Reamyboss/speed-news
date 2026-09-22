import { prisma, safeQuery } from "./db";
import { CATEGORIES, type Category, isCategory } from "./taxonomy";
import { sanitizeSearchTerm } from "./validation";
import { isNonPhotoImage } from "./feed";

/**
 * Every database read used by a page lives here.
 *
 * Two rules:
 *  1. Public reads go through `safeQuery`, so a database blip renders an empty
 *     section instead of a 500. A news site that half-loads beats one that
 *     errors.
 *  2. Rows are mapped to explicit view models — pages never receive raw Prisma
 *     objects, so JSON-in-text columns are decoded exactly once, here.
 */

const STORY_SELECT = {
  id: true,
  headline: true,
  slug: true,
  dek: true,
  summary: true,
  excerpt: true,
  canonicalUrl: true,
  author: true,
  publishedAt: true,
  updatedAt: true,
  category: true,
  region: true,
  imageUrl: true,
  imageCredit: true,
  importance: true,
  clusterId: true,
  aiSummary: true,
  aiWhyItMatters: true,
  aiBullets: true,
  aiEntities: true,
  aiProvider: true,
  aiModel: true,
  aiStatus: true,
  aiEnrichedAt: true,
  source: {
    select: {
      name: true,
      slug: true,
      url: true,
      type: true,
      trustTier: true,
      country: true,
    },
  },
} as const;

export interface StoryEntity {
  name: string;
  type: string;
}

/** Drops logos already stored by earlier ingests, without rewriting the rows. */
function usableImage(url: string | null): string | null {
  return url && !isNonPhotoImage(url) ? url : null;
}

export interface StoryView {
  id: string;
  headline: string;
  slug: string;
  dek: string | null;
  summary: string;
  excerpt: string | null;
  canonicalUrl: string;
  author: string | null;
  publishedAt: Date;
  updatedAt: Date;
  category: string;
  region: string;
  imageUrl: string | null;
  imageCredit: string | null;
  importance: number;
  clusterId: string | null;
  ai: {
    summary: string | null;
    whyItMatters: string | null;
    bullets: string[];
    entities: StoryEntity[];
    provider: string | null;
    model: string | null;
    status: string;
    enrichedAt: Date | null;
    /** True only when a real model produced usable output. */
    isEnriched: boolean;
  };
  source: {
    name: string;
    slug: string;
    url: string;
    type: string;
    trustTier: number;
    country: string;
  };
}

type StoryRow = {
  [K in keyof typeof STORY_SELECT]: unknown;
};

/** Decodes JSON-in-text columns defensively — bad data must not crash a page. */
function parseJsonArray<T>(value: unknown, guard: (item: unknown) => item is T): T[] {
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(guard) : [];
  } catch {
    return [];
  }
}

const isString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isEntity = (value: unknown): value is StoryEntity =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as StoryEntity).name === "string";

function toStoryView(row: Record<string, unknown>): StoryView {
  const aiStatus = String(row.aiStatus ?? "PENDING");
  const aiSummary = (row.aiSummary as string | null) ?? null;
  const aiWhy = (row.aiWhyItMatters as string | null) ?? null;

  return {
    id: row.id as string,
    headline: row.headline as string,
    slug: row.slug as string,
    dek: (row.dek as string | null) ?? null,
    summary: row.summary as string,
    excerpt: (row.excerpt as string | null) ?? null,
    canonicalUrl: row.canonicalUrl as string,
    author: (row.author as string | null) ?? null,
    publishedAt: row.publishedAt as Date,
    updatedAt: row.updatedAt as Date,
    category: row.category as string,
    region: row.region as string,
    imageUrl: usableImage(row.imageUrl as string | null),
    imageCredit: (row.imageCredit as string | null) ?? null,
    importance: (row.importance as number) ?? 50,
    clusterId: (row.clusterId as string | null) ?? null,
    ai: {
      summary: aiSummary,
      whyItMatters: aiWhy,
      bullets: parseJsonArray(row.aiBullets, isString),
      entities: parseJsonArray(row.aiEntities, isEntity),
      provider: (row.aiProvider as string | null) ?? null,
      model: (row.aiModel as string | null) ?? null,
      status: aiStatus,
      enrichedAt: (row.aiEnrichedAt as Date | null) ?? null,
      isEnriched: aiStatus === "OK" && Boolean(aiSummary),
    },
    source: row.source as StoryView["source"],
  };
}

// ---------------------------------------------------------------------------
// Homepage
// ---------------------------------------------------------------------------

export interface HomepageData {
  lead: StoryView | null;
  topStories: StoryView[];
  latest: StoryView[];
  byCategory: Array<{ category: Category; stories: StoryView[] }>;
  totalStories: number;
}

/**
 * Collapses a ranked list so each event appears once.
 *
 * Stories in the same cluster are several newsrooms covering ONE event. Left
 * alone they each compete for their own slot and the front page repeats
 * itself — a real example from production had "Ododo inaugurates APC peace
 * committee" filling three of the top ten slots from three papers, and the
 * same government announcement appearing twice.
 *
 * The highest-ranked member survives and carries the corroboration count, so
 * the page shows the story once and says how many newsrooms have it. That is
 * the point of clustering: breadth of coverage is a fact ABOUT a story, not a
 * reason to print it again.
 *
 * Order is preserved, so callers keep whatever ranking they asked for.
 */
export function collapseByCluster<T extends { id: string; clusterId: string | null }>(
  stories: T[],
): T[] {
  const seenClusters = new Set<string>();
  const result: T[] = [];
  for (const story of stories) {
    // An unclustered story is its own event and always survives.
    if (story.clusterId) {
      if (seenClusters.has(story.clusterId)) continue;
      seenClusters.add(story.clusterId);
    }
    result.push(story);
  }
  return result;
}

/**
 * Homepage ranking blends importance with freshness.
 *
 * Importance alone would let a strong story from yesterday outrank live news;
 * recency alone would surface trivia. Sorting by importance within a recent
 * window, then by time, keeps the front page both serious and current.
 */
export async function getHomepage(): Promise<HomepageData> {
  const since = new Date(Date.now() - 48 * 3_600_000);

  const [ranked, latest, totalStories] = await Promise.all([
    safeQuery(
      () =>
        prisma.story.findMany({
          where: { status: "PUBLISHED", publishedAt: { gte: since } },
          orderBy: [{ importance: "desc" }, { publishedAt: "desc" }],
          // Over-fetch: collapsing clusters removes rows, and the page still
          // needs a lead plus six top stories after that.
          take: 60,
          select: STORY_SELECT,
        }),
      [],
      "homepage.ranked",
    ),
    safeQuery(
      () =>
        prisma.story.findMany({
          where: { status: "PUBLISHED" },
          orderBy: { publishedAt: "desc" },
          take: 40,
          select: STORY_SELECT,
        }),
      [],
      "homepage.latest",
    ),
    safeQuery(
      () => prisma.story.count({ where: { status: "PUBLISHED" } }),
      0,
      "homepage.count",
    ),
  ]);

  // If nothing was published in the last 48h (a quiet period, or a first run
  // against a stale feed), fall back to the newest stories we do have.
  const pool = ranked.length > 0 ? ranked : latest;
  const views = collapseByCluster(
    pool.map((row) => toStoryView(row as Record<string, unknown>)),
  ).slice(0, 13);

  // The "latest" rail must not repeat what the ranked block already shows —
  // neither the same story, nor another newsroom's copy of the same event.
  const seen = new Set(views.map((story) => story.id));
  const seenClusters = new Set(
    views.map((story) => story.clusterId).filter((id): id is string => Boolean(id)),
  );

  const byCategory = await Promise.all(
    CATEGORIES.map(async (category) => ({
      category,
      stories: collapseByCluster(
        (
          await safeQuery(
            () =>
              prisma.story.findMany({
                where: { status: "PUBLISHED", category },
                orderBy: [{ publishedAt: "desc" }],
                take: 20,
                select: STORY_SELECT,
              }),
            [],
            `homepage.category.${category}`,
          )
        ).map((row) => toStoryView(row as Record<string, unknown>)),
      ).slice(0, 5),
    })),
  );

  return {
    lead: views[0] ?? null,
    topStories: views.slice(1, 7),
    latest: collapseByCluster(
      latest
        .map((row) => toStoryView(row as Record<string, unknown>))
        .filter(
          (story) =>
            !seen.has(story.id) && !(story.clusterId && seenClusters.has(story.clusterId)),
        ),
    ).slice(0, 8),
    byCategory: byCategory.filter((group) => group.stories.length > 0),
    totalStories,
  };
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const CATEGORY_PAGE_SIZE = 18;

export interface CategoryPageData {
  stories: StoryView[];
  total: number;
  page: number;
  totalPages: number;
}

export async function getCategoryPage(
  category: string,
  page = 1,
): Promise<CategoryPageData> {
  if (!isCategory(category)) {
    return { stories: [], total: 0, page: 1, totalPages: 0 };
  }

  const currentPage = Math.max(1, page);
  const where = { status: "PUBLISHED", category } as const;

  const [rows, total] = await Promise.all([
    safeQuery(
      () =>
        prisma.story.findMany({
          where,
          orderBy: [{ publishedAt: "desc" }],
          skip: (currentPage - 1) * CATEGORY_PAGE_SIZE,
          take: CATEGORY_PAGE_SIZE,
          select: STORY_SELECT,
        }),
      [],
      `category.${category}`,
    ),
    safeQuery(() => prisma.story.count({ where }), 0, `category.${category}.count`),
  ]);

  // Collapse repeated coverage WITHIN the page. Pagination offsets stay based
  // on stories, so paging remains correct and stable; a page that contained
  // several newsrooms' copies of one event simply renders fewer rows rather
  // than the same headline three times. `total` remains a story count, which
  // is what it says it is.

  return {
    stories: collapseByCluster(rows.map((row) => toStoryView(row as Record<string, unknown>))),
    total,
    page: currentPage,
    totalPages: Math.max(1, Math.ceil(total / CATEGORY_PAGE_SIZE)),
  };
}

// ---------------------------------------------------------------------------
// Single story
// ---------------------------------------------------------------------------

export async function getStoryBySlug(slug: string): Promise<StoryView | null> {
  const row = await safeQuery(
    () =>
      prisma.story.findFirst({
        where: { slug, status: "PUBLISHED" },
        select: STORY_SELECT,
      }),
    null,
    "story.bySlug",
  );
  return row ? toStoryView(row as Record<string, unknown>) : null;
}

export interface RelatedStories {
  /** Other sources covering the same event — the corroboration signal. */
  sameEvent: StoryView[];
  /** Recent stories from the same category. */
  moreLikeThis: StoryView[];
}

export async function getRelatedStories(story: StoryView): Promise<RelatedStories> {
  const sameEvent = story.clusterId
    ? await safeQuery(
        () =>
          prisma.story.findMany({
            where: {
              clusterId: story.clusterId,
              id: { not: story.id },
              status: "PUBLISHED",
            },
            orderBy: [{ publishedAt: "desc" }],
            take: 6,
            select: STORY_SELECT,
          }),
        [],
        "related.sameEvent",
      )
    : [];

  const excludeIds = [story.id, ...sameEvent.map((s) => s.id as string)];

  const moreLikeThis = await safeQuery(
    () =>
      prisma.story.findMany({
        where: {
          category: story.category,
          status: "PUBLISHED",
          id: { notIn: excludeIds },
        },
        orderBy: [{ publishedAt: "desc" }],
        take: 6,
        select: STORY_SELECT,
      }),
    [],
    "related.moreLikeThis",
  );

  return {
    sameEvent: sameEvent.map((row) => toStoryView(row as Record<string, unknown>)),
    moreLikeThis: moreLikeThis.map((row) => toStoryView(row as Record<string, unknown>)),
  };
}

/** Slugs for static generation and the sitemap. */
export async function getRecentStorySlugs(limit = 2000) {
  return safeQuery(
    () =>
      prisma.story.findMany({
        where: { status: "PUBLISHED" },
        orderBy: { publishedAt: "desc" },
        take: limit,
        select: { slug: true, updatedAt: true, publishedAt: true },
      }),
    [],
    "story.slugs",
  );
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export const SEARCH_PAGE_SIZE = 15;

export interface SearchResults {
  stories: StoryView[];
  total: number;
  page: number;
  totalPages: number;
  term: string;
}

/**
 * Search over the denormalised `searchText` column.
 *
 * Every term must match (AND), which is what users expect from a news search.
 * `contains` maps to LIKE on both SQLite and Postgres, keeping the portability
 * contract intact; upgrading to Postgres full-text search is in the backlog.
 */
export async function searchStories(
  rawTerm: string,
  page = 1,
  category?: string,
): Promise<SearchResults> {
  const term = sanitizeSearchTerm(rawTerm);
  const currentPage = Math.max(1, page);

  if (term.length < 2) {
    return { stories: [], total: 0, page: 1, totalPages: 0, term };
  }

  const words = term.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);

  const where = {
    status: "PUBLISHED",
    ...(category && isCategory(category) ? { category } : {}),
    AND: words.map((word) => ({ searchText: { contains: word } })),
  };

  const [rows, total] = await Promise.all([
    safeQuery(
      () =>
        prisma.story.findMany({
          where,
          orderBy: [{ publishedAt: "desc" }],
          skip: (currentPage - 1) * SEARCH_PAGE_SIZE,
          take: SEARCH_PAGE_SIZE,
          select: STORY_SELECT,
        }),
      [],
      "search",
    ),
    safeQuery(() => prisma.story.count({ where }), 0, "search.count"),
  ]);

  return {
    stories: rows.map((row) => toStoryView(row as Record<string, unknown>)),
    total,
    page: currentPage,
    totalPages: Math.max(1, Math.ceil(total / SEARCH_PAGE_SIZE)),
    term,
  };
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export interface SourceView {
  name: string;
  slug: string;
  url: string;
  type: string;
  trustTier: number;
  country: string;
  categories: string;
  status: string;
  storyCount: number;
}

export async function getSourceDirectory(): Promise<SourceView[]> {
  const sources = await safeQuery(
    () =>
      prisma.source.findMany({
        orderBy: [{ trustTier: "asc" }, { weight: "desc" }, { name: "asc" }],
        select: {
          name: true,
          slug: true,
          url: true,
          type: true,
          trustTier: true,
          country: true,
          categories: true,
          status: true,
          _count: { select: { stories: true } },
        },
      }),
    [],
    "sources.directory",
  );

  return sources.map((source) => ({
    name: source.name,
    slug: source.slug,
    url: source.url,
    type: source.type,
    trustTier: source.trustTier,
    country: source.country,
    categories: source.categories,
    status: source.status,
    storyCount: source._count.stories,
  }));
}

// ---------------------------------------------------------------------------
// Ads
// ---------------------------------------------------------------------------

export interface AdSlotView {
  key: string;
  name: string;
  placement: string;
  provider: string;
  headline: string | null;
  body: string | null;
  imageUrl: string | null;
  clickUrl: string | null;
  label: string;
  config: string | null;
  widthPx: number | null;
  heightPx: number | null;
}

/**
 * Resolves the highest-priority live creative for a slot key.
 *
 * Flight dates are honoured here so an expired campaign stops rendering
 * without anyone editing code.
 */
export async function getAdSlot(key: string): Promise<AdSlotView | null> {
  const now = new Date();
  const slot = await safeQuery(
    () =>
      prisma.adSlot.findFirst({
        where: {
          key,
          enabled: true,
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          ],
        },
        orderBy: { priority: "desc" },
      }),
    null,
    `ads.${key}`,
  );

  if (!slot || slot.provider === "NONE") return null;

  return {
    key: slot.key,
    name: slot.name,
    placement: slot.placement,
    provider: slot.provider,
    headline: slot.headline,
    body: slot.body,
    imageUrl: slot.imageUrl,
    clickUrl: slot.clickUrl,
    label: slot.label,
    config: slot.config,
    widthPx: slot.widthPx,
    heightPx: slot.heightPx,
  };
}

// ---------------------------------------------------------------------------
// Health / observability
// ---------------------------------------------------------------------------

export async function getPlatformHealth() {
  const [stories, sources, activeSources, brokenSources, clusters, lastRun, enriched] =
    await Promise.all([
      safeQuery(() => prisma.story.count({ where: { status: "PUBLISHED" } }), 0, "h.stories"),
      safeQuery(() => prisma.source.count(), 0, "h.sources"),
      safeQuery(() => prisma.source.count({ where: { status: "ACTIVE" } }), 0, "h.active"),
      safeQuery(() => prisma.source.count({ where: { status: "BROKEN" } }), 0, "h.broken"),
      safeQuery(() => prisma.storyCluster.count(), 0, "h.clusters"),
      safeQuery(
        () => prisma.ingestRun.findFirst({ orderBy: { startedAt: "desc" } }),
        null,
        "h.lastRun",
      ),
      safeQuery(
        () => prisma.story.count({ where: { aiStatus: "OK" } }),
        0,
        "h.enriched",
      ),
    ]);

  const newest = await safeQuery(
    () =>
      prisma.story.findFirst({
        where: { status: "PUBLISHED" },
        orderBy: { publishedAt: "desc" },
        select: { publishedAt: true },
      }),
    null,
    "h.newest",
  );

  return {
    stories,
    sources,
    activeSources,
    brokenSources,
    clusters,
    enrichedStories: enriched,
    newestStoryAt: newest?.publishedAt ?? null,
    lastRun,
  };
}
