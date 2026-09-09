import type { Source } from "@prisma/client";
import { prisma } from "./db";
import { INGEST_CONFIG } from "./env";
import { fetchFeed, normalizeItem, parseFeed, type NormalizedItem } from "./feed";
import { classifyStory, scoreImportance } from "./classify";
import {
  CLUSTER_WINDOW_HOURS,
  clusterKey,
  fingerprint,
  findCluster,
  findDuplicate,
  type CandidateStory,
} from "./dedupe";
import { toSingleLine, uniqueSlug } from "./text";
import { isSourceType, type SourceType } from "./taxonomy";
import { storyDraftSchema } from "./validation";

/**
 * The ingest pipeline:
 *
 *   SOURCE -> FETCH -> NORMALIZE -> DEDUPE -> STORE -> CLUSTER
 *
 * AI enrichment runs afterwards as a separate, optional stage (see ai/enrich)
 * so that a provider outage can never block publishing.
 *
 * Failure policy: one bad source must never fail the run. Every source is
 * isolated, its error recorded on the registry row, and the run continues.
 */

/** A source is marked BROKEN after this many consecutive failed pulls. */
const BROKEN_AFTER_FAILURES = 5;

/**
 * How long to wait before re-testing a BROKEN source.
 *
 * BROKEN must never be a one-way door: publishers have outages, change feed
 * paths back, and lift blocks. Excluding them permanently would mean the
 * auto-reinstate path in `recordSourceSuccess` could never fire, so the
 * registry would decay with every transient failure and never recover.
 */
const BROKEN_RETRY_HOURS = 6;

export interface SourceIngestResult {
  sourceSlug: string;
  ok: boolean;
  itemsSeen: number;
  itemsCreated: number;
  itemsDuplicate: number;
  /** Items normalisation could not use at all (no headline, bad URL). */
  itemsRejected: number;
  /** Items left for a later run because of the per-source cap. */
  itemsCapped: number;
  error?: string;
  durationMs: number;
}

export interface IngestSummary {
  runId: string | null;
  sourcesAttempted: number;
  sourcesSucceeded: number;
  sourcesFailed: number;
  itemsSeen: number;
  itemsCreated: number;
  itemsDuplicate: number;
  itemsRejected: number;
  itemsCapped: number;
  clustersTouched: number;
  results: SourceIngestResult[];
  durationMs: number;
}

export interface IngestOptions {
  /** Restrict the run to these source slugs. */
  slugs?: string[];
  maxItemsPerSource?: number;
  concurrency?: number;
  /** Skip writing an IngestRun row (used by tests). */
  skipRunRecord?: boolean;
  now?: Date;
}

// ---------------------------------------------------------------------------
// Candidate loading — one query per run, reused for dedupe + clustering
// ---------------------------------------------------------------------------

/**
 * Loads recent stories once per source batch. Comparing in memory against a
 * bounded recent window is far cheaper than a query per incoming item, and the
 * window is exactly the period in which duplicates and clusters can occur.
 */
async function loadCandidates(now: Date): Promise<CandidateStory[]> {
  const since = new Date(now.getTime() - CLUSTER_WINDOW_HOURS * 3_600_000);
  const rows = await prisma.story.findMany({
    where: { publishedAt: { gte: since } },
    select: {
      id: true,
      sourceId: true,
      headline: true,
      urlHash: true,
      titleKey: true,
      simhash: true,
      publishedAt: true,
      clusterId: true,
    },
    orderBy: { publishedAt: "desc" },
    take: 2000,
  });
  return rows;
}

// ---------------------------------------------------------------------------
// Single source
// ---------------------------------------------------------------------------

export async function ingestSource(
  source: Source,
  candidates: CandidateStory[],
  options: IngestOptions = {},
): Promise<{ result: SourceIngestResult; created: CandidateStory[]; clusters: Set<string> }> {
  const started = Date.now();
  const now = options.now ?? new Date();
  const maxItems = options.maxItemsPerSource ?? INGEST_CONFIG.maxItemsPerSource;

  const result: SourceIngestResult = {
    sourceSlug: source.slug,
    ok: false,
    itemsSeen: 0,
    itemsCreated: 0,
    itemsDuplicate: 0,
    itemsRejected: 0,
    itemsCapped: 0,
    durationMs: 0,
  };
  const created: CandidateStory[] = [];
  const clusters = new Set<string>();

  if (!source.rssUrl) {
    result.error = "no feed url configured";
    result.durationMs = Date.now() - started;
    return { result, created, clusters };
  }

  let items: NormalizedItem[];
  try {
    const xml = await fetchFeed(source.rssUrl);
    const parsed = parseFeed(xml, source.rssUrl);
    result.itemsSeen = parsed.items.length;

    const normalized = parsed.items
      .map((raw) => normalizeItem(raw, { now }))
      .filter((item): item is NormalizedItem => item !== null);

    // Items dropped by normalisation are genuinely unusable; items beyond the
    // per-source cap are simply deferred to a later run. Conflating the two
    // makes a healthy feed look broken in the run report.
    result.itemsRejected = Math.max(0, parsed.items.length - normalized.length);
    items = normalized.slice(0, maxItems);
    result.itemsCapped = Math.max(0, normalized.length - items.length);
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    result.durationMs = Date.now() - started;
    await recordSourceFailure(source, result.error, now);
    return { result, created, clusters };
  }

  // The feed responded and parsed — that alone counts as a successful pull,
  // even if every item turns out to be one we already have.
  result.ok = true;

  const sourceType: SourceType = isSourceType(source.type) ? source.type : "UNVERIFIED";
  const working = [...candidates];

  for (const item of items) {
    try {
      const stored = await storeItem(item, source, sourceType, working, now);
      if (stored.status === "created") {
        result.itemsCreated += 1;
        created.push(stored.candidate);
        working.push(stored.candidate);
        if (stored.candidate.clusterId) clusters.add(stored.candidate.clusterId);
      } else if (stored.status === "duplicate") {
        result.itemsDuplicate += 1;
      } else {
        result.itemsRejected += 1;
      }
    } catch (error) {
      // A single malformed item must not abort the source.
      result.itemsRejected += 1;
      console.error(
        `[ingest] ${source.slug} item failed:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  await recordSourceSuccess(source, now);
  result.durationMs = Date.now() - started;
  return { result, created, clusters };
}

type StoreOutcome =
  | { status: "created"; candidate: CandidateStory }
  | { status: "duplicate" }
  | { status: "rejected"; reason: string };

async function storeItem(
  item: NormalizedItem,
  source: Source,
  sourceType: SourceType,
  candidates: CandidateStory[],
  now: Date,
): Promise<StoreOutcome> {
  const print = fingerprint(item.headline, item.summary, item.url);

  // ---- DEDUPE ------------------------------------------------------------
  const duplicate = findDuplicate(
    {
      sourceId: source.id,
      headline: item.headline,
      publishedAt: item.publishedAt,
      fingerprint: print,
    },
    candidates,
  );
  if (duplicate.isDuplicate) return { status: "duplicate" };

  // The in-memory candidate set only covers a recent window, so an item still
  // sitting in a feed after that window has passed will not be found above.
  // One indexed lookup on the unique column settles it, rather than letting
  // the insert fail and driving control flow from the exception.
  const alreadyStored = await prisma.story.findUnique({
    where: { urlHash: print.urlHash },
    select: { id: true },
  });
  if (alreadyStored) return { status: "duplicate" };

  // ---- CLASSIFY ----------------------------------------------------------
  const classification = classifyStory({
    headline: item.headline,
    summary: item.summary,
    feedCategories: item.categories,
    url: item.url,
    sourceCategories: source.categories,
    sourceType,
    sourceCountry: source.country,
  });

  // ---- CLUSTER -----------------------------------------------------------
  const clusterMatch = findCluster(
    { headline: item.headline, publishedAt: item.publishedAt, fingerprint: print },
    candidates,
  );

  let clusterId: string;
  let corroboratingSources = 1;

  if (clusterMatch) {
    clusterId = clusterMatch.clusterId;
    const cluster = await prisma.storyCluster.update({
      where: { id: clusterId },
      data: {
        storyCount: { increment: 1 },
        lastStoryAt: item.publishedAt > now ? now : item.publishedAt,
      },
      select: { sourceCount: true },
    });
    corroboratingSources = cluster.sourceCount + 1;
  } else {
    const key = clusterKey(item.headline);
    // Two sources can race onto the same key, so upsert rather than create.
    const cluster = await prisma.storyCluster.upsert({
      where: { key },
      create: {
        key,
        title: item.headline,
        category: classification.category,
        storyCount: 1,
        sourceCount: 1,
        firstSeenAt: item.publishedAt,
        lastStoryAt: item.publishedAt,
      },
      update: { storyCount: { increment: 1 }, lastStoryAt: item.publishedAt },
      select: { id: true, sourceCount: true },
    });
    clusterId = cluster.id;
    corroboratingSources = cluster.sourceCount;
  }

  // ---- SCORE -------------------------------------------------------------
  const importance = scoreImportance({
    headline: item.headline,
    summary: item.summary,
    trustTier: source.trustTier,
    sourceType,
    sourceWeight: source.weight,
    publishedAt: item.publishedAt,
    hasImage: Boolean(item.imageUrl),
    corroboratingSources,
    region: classification.region,
    url: item.url,
    now,
  });

  // ---- VALIDATE ----------------------------------------------------------
  const draft = storyDraftSchema.safeParse({
    headline: item.headline,
    summary: item.summary,
    excerpt: item.excerpt,
    canonicalUrl: item.url,
    sourceId: source.id,
    author: item.author,
    publishedAt: item.publishedAt,
    category: classification.category,
    region: classification.region,
    imageUrl: item.imageUrl,
    importance,
    language: source.language || "en",
  });

  if (!draft.success) {
    return { status: "rejected", reason: draft.error.issues[0]?.message ?? "invalid draft" };
  }

  const searchText = toSingleLine(
    `${draft.data.headline} ${draft.data.summary} ${source.name} ${draft.data.category}`,
  )
    .toLowerCase()
    .slice(0, 2000);

  // ---- STORE -------------------------------------------------------------
  try {
    const story = await prisma.story.create({
      data: {
        headline: draft.data.headline,
        slug: uniqueSlug(draft.data.headline, print.urlHash),
        summary: draft.data.summary,
        excerpt: draft.data.excerpt,
        canonicalUrl: draft.data.canonicalUrl,
        sourceId: draft.data.sourceId,
        author: draft.data.author,
        publishedAt: draft.data.publishedAt,
        fetchedAt: now,
        category: draft.data.category,
        region: draft.data.region,
        language: draft.data.language,
        imageUrl: draft.data.imageUrl,
        imageCredit: draft.data.imageUrl ? source.name : null,
        importance: draft.data.importance,
        status: "PUBLISHED",
        urlHash: print.urlHash,
        titleKey: print.titleKey,
        simhash: print.simhash,
        clusterId,
        aiStatus: "PENDING",
        searchText,
      },
      select: { id: true },
    });

    // Keep the cluster's distinct-source count accurate — it drives the
    // "corroborated by N sources" signal shown to readers.
    await refreshClusterSourceCount(clusterId);

    return {
      status: "created",
      candidate: {
        id: story.id,
        sourceId: source.id,
        headline: draft.data.headline,
        urlHash: print.urlHash,
        titleKey: print.titleKey,
        simhash: print.simhash,
        publishedAt: draft.data.publishedAt,
        clusterId,
      },
    };
  } catch (error) {
    // A unique-constraint violation means a concurrent worker won the race —
    // that is a duplicate, not an error.
    if (isUniqueConstraintError(error)) return { status: "duplicate" };
    throw error;
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

async function refreshClusterSourceCount(clusterId: string): Promise<void> {
  const groups = await prisma.story.groupBy({
    by: ["sourceId"],
    where: { clusterId },
  });
  await prisma.storyCluster.update({
    where: { id: clusterId },
    data: { sourceCount: groups.length },
  });
}

// ---------------------------------------------------------------------------
// Registry health tracking
// ---------------------------------------------------------------------------

async function recordSourceSuccess(source: Source, now: Date): Promise<void> {
  await prisma.source
    .update({
      where: { id: source.id },
      data: {
        lastCheckedAt: now,
        lastSuccessAt: now,
        consecutiveFailures: 0,
        lastError: null,
        // A source that starts working again is automatically reinstated.
        status: source.status === "BROKEN" || source.status === "PENDING" ? "ACTIVE" : source.status,
      },
    })
    .catch(() => undefined);
}

async function recordSourceFailure(source: Source, error: string, now: Date): Promise<void> {
  const failures = source.consecutiveFailures + 1;
  await prisma.source
    .update({
      where: { id: source.id },
      data: {
        lastCheckedAt: now,
        lastErrorAt: now,
        lastError: error.slice(0, 500),
        consecutiveFailures: failures,
        status: failures >= BROKEN_AFTER_FAILURES ? "BROKEN" : source.status,
      },
    })
    .catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Full run
// ---------------------------------------------------------------------------

export async function runIngest(options: IngestOptions = {}): Promise<IngestSummary> {
  const started = Date.now();
  const now = options.now ?? new Date();
  const concurrency = Math.max(1, options.concurrency ?? INGEST_CONFIG.concurrency);

  const retryBrokenBefore = new Date(now.getTime() - BROKEN_RETRY_HOURS * 3_600_000);

  const sources = await prisma.source.findMany({
    where: {
      rssUrl: { not: null },
      ...(options.slugs?.length
        ? { slug: { in: options.slugs } }
        : {
            OR: [
              { status: { in: ["ACTIVE", "PENDING"] } },
              // Give BROKEN sources a periodic second chance.
              {
                AND: [
                  { status: "BROKEN" },
                  {
                    OR: [
                      { lastCheckedAt: null },
                      { lastCheckedAt: { lt: retryBrokenBefore } },
                    ],
                  },
                ],
              },
            ],
          }),
    },
    orderBy: [{ weight: "desc" }, { trustTier: "asc" }],
  });

  let runId: string | null = null;
  if (!options.skipRunRecord) {
    const run = await prisma.ingestRun
      .create({ data: { startedAt: now, status: "RUNNING" }, select: { id: true } })
      .catch(() => null);
    runId = run?.id ?? null;
  }

  const candidates = await loadCandidates(now);
  const queue = [...sources];
  const results: SourceIngestResult[] = [];
  const allClusters = new Set<string>();
  const errors: Array<{ source: string; error: string }> = [];

  async function worker() {
    for (;;) {
      const source = queue.shift();
      if (!source) return;
      const { result, created, clusters } = await ingestSource(source, candidates, {
        ...options,
        now,
      });
      // Newly created stories become candidates for sources processed later,
      // so cross-source clustering works within a single run.
      candidates.push(...created);
      for (const id of clusters) allClusters.add(id);
      results.push(result);
      if (!result.ok && result.error) {
        errors.push({ source: source.slug, error: result.error.slice(0, 200) });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length || 1) }, worker));

  const summary: IngestSummary = {
    runId,
    sourcesAttempted: results.length,
    sourcesSucceeded: results.filter((r) => r.ok).length,
    sourcesFailed: results.filter((r) => !r.ok).length,
    itemsSeen: results.reduce((sum, r) => sum + r.itemsSeen, 0),
    itemsCreated: results.reduce((sum, r) => sum + r.itemsCreated, 0),
    itemsDuplicate: results.reduce((sum, r) => sum + r.itemsDuplicate, 0),
    itemsRejected: results.reduce((sum, r) => sum + r.itemsRejected, 0),
    itemsCapped: results.reduce((sum, r) => sum + r.itemsCapped, 0),
    clustersTouched: allClusters.size,
    results,
    durationMs: Date.now() - started,
  };

  if (runId) {
    const status =
      summary.sourcesSucceeded === 0
        ? "FAILED"
        : summary.sourcesFailed > 0
          ? "PARTIAL"
          : "OK";
    await prisma.ingestRun
      .update({
        where: { id: runId },
        data: {
          finishedAt: new Date(),
          status,
          sourcesAttempted: summary.sourcesAttempted,
          sourcesSucceeded: summary.sourcesSucceeded,
          sourcesFailed: summary.sourcesFailed,
          itemsSeen: summary.itemsSeen,
          itemsCreated: summary.itemsCreated,
          itemsDuplicate: summary.itemsDuplicate,
          itemsRejected: summary.itemsRejected,
          clustersTouched: summary.clustersTouched,
          errors: errors.length ? JSON.stringify(errors.slice(0, 60)) : null,
        },
      })
      .catch(() => undefined);
  }

  return summary;
}
