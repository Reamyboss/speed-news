/**
 * Single source of truth for the platform's controlled vocabularies.
 *
 * The database schema is intentionally enum-free (so one schema file serves
 * both SQLite and PostgreSQL), which means these unions ARE the enum. Every
 * write path validates against them via `src/lib/validation.ts`.
 */

// ---------------------------------------------------------------------------
// Source types
// ---------------------------------------------------------------------------

export const SOURCE_TYPES = [
  "PRIMARY_OFFICIAL",
  "PROFESSIONAL_MEDIA",
  "SPECIALIST_MEDIA",
  "DIGITAL_PUBLISHER",
  "INTERNATIONAL_MEDIA",
  "BROADCAST",
  "RADIO",
  "HISTORICAL",
  "EXPERT",
  "CREATOR",
  "SOCIAL_SIGNAL",
  "UNVERIFIED",
] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];

export interface SourceTypeMeta {
  label: string;
  /** Shown on the story page so readers understand what kind of source this is. */
  description: string;
  /** Default trust tier (1 = strongest) applied when a source omits one. */
  defaultTrustTier: number;
  /**
   * Whether items from this source type may be presented as established
   * reporting. Signals (social, unverified, creator) must be labelled and are
   * never allowed to lead the homepage.
   */
  presentAsReporting: boolean;
}

export const SOURCE_TYPE_META: Record<SourceType, SourceTypeMeta> = {
  PRIMARY_OFFICIAL: {
    label: "Official / Primary",
    description:
      "A first-party statement, dataset or document published by the institution itself.",
    defaultTrustTier: 1,
    presentAsReporting: true,
  },
  PROFESSIONAL_MEDIA: {
    label: "Professional newsroom",
    description: "An established newsroom with editorial standards and a masthead.",
    defaultTrustTier: 2,
    presentAsReporting: true,
  },
  SPECIALIST_MEDIA: {
    label: "Specialist newsroom",
    description: "A newsroom focused on one beat, such as investigations, tech or markets.",
    defaultTrustTier: 2,
    presentAsReporting: true,
  },
  DIGITAL_PUBLISHER: {
    label: "Digital publisher",
    description: "A digital-first publisher. Speed is high; verification varies by item.",
    defaultTrustTier: 3,
    presentAsReporting: true,
  },
  INTERNATIONAL_MEDIA: {
    label: "International media",
    description: "A global newsroom or wire service reporting on Nigeria and the world.",
    defaultTrustTier: 1,
    presentAsReporting: true,
  },
  BROADCAST: {
    label: "Broadcast",
    description: "A television newsroom.",
    defaultTrustTier: 2,
    presentAsReporting: true,
  },
  RADIO: {
    label: "Radio",
    description: "A radio newsroom.",
    defaultTrustTier: 3,
    presentAsReporting: true,
  },
  HISTORICAL: {
    label: "Archive",
    description: "Archival or historical material providing background, not breaking news.",
    defaultTrustTier: 2,
    presentAsReporting: true,
  },
  EXPERT: {
    label: "Expert / Analyst",
    description: "Named subject-matter analysis. Interpretation, not primary reporting.",
    defaultTrustTier: 3,
    presentAsReporting: false,
  },
  CREATOR: {
    label: "Creator",
    description: "An independent creator or commentator. Treat as opinion.",
    defaultTrustTier: 4,
    presentAsReporting: false,
  },
  SOCIAL_SIGNAL: {
    label: "Social signal",
    description:
      "A public social post surfaced as an early signal. Not confirmed reporting.",
    defaultTrustTier: 5,
    presentAsReporting: false,
  },
  UNVERIFIED: {
    label: "Unverified",
    description: "Unverified claim retained for tracking. Treat with caution.",
    defaultTrustTier: 5,
    presentAsReporting: false,
  },
};

export function isSourceType(value: string): value is SourceType {
  return (SOURCE_TYPES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Trust tiers
// ---------------------------------------------------------------------------

export const TRUST_TIERS = [1, 2, 3, 4, 5] as const;
export type TrustTier = (typeof TRUST_TIERS)[number];

export const TRUST_TIER_META: Record<
  TrustTier,
  { label: string; description: string }
> = {
  1: {
    label: "Tier 1",
    description: "Primary source or wire service. Highest confidence.",
  },
  2: {
    label: "Tier 2",
    description: "Established newsroom with a track record of corrections.",
  },
  3: { label: "Tier 3", description: "Reliable but verify significant claims." },
  4: { label: "Tier 4", description: "Use with care. Corroborate before relying on it." },
  5: { label: "Tier 5", description: "Signal only. Not verified reporting." },
};

export function clampTrustTier(value: number): TrustTier {
  const rounded = Math.round(value);
  if (rounded <= 1) return 1;
  if (rounded >= 5) return 5;
  return rounded as TrustTier;
}

// ---------------------------------------------------------------------------
// Statuses
// ---------------------------------------------------------------------------

export const SOURCE_STATUSES = ["ACTIVE", "PAUSED", "BROKEN", "PENDING"] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];

export const STORY_STATUSES = ["PUBLISHED", "DRAFT", "HIDDEN"] as const;
export type StoryStatus = (typeof STORY_STATUSES)[number];

export const AI_STATUSES = ["PENDING", "OK", "FAILED", "SKIPPED"] as const;
export type AiStatus = (typeof AI_STATUSES)[number];

export const LICENSE_MODES = [
  "RSS_SUMMARY",
  "API_LICENSED",
  "PUBLIC_DOMAIN",
  "OFFICIAL_STATEMENT",
  "PERMITTED_SOCIAL",
] as const;
export type LicenseMode = (typeof LICENSE_MODES)[number];

// ---------------------------------------------------------------------------
// Regions
// ---------------------------------------------------------------------------

export const REGIONS = ["ng", "africa", "world"] as const;
export type Region = (typeof REGIONS)[number];

export const REGION_LABELS: Record<Region, string> = {
  ng: "Nigeria",
  africa: "Africa",
  world: "World",
};

export function isRegion(value: string): value is Region {
  return (REGIONS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Categories — these drive navigation, category pages and SEO metadata
// ---------------------------------------------------------------------------

export const CATEGORIES = [
  "nigeria",
  "politics",
  "business",
  "technology",
  "sports",
  "entertainment",
  "world",
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface CategoryMeta {
  slug: Category;
  name: string;
  /** Compact label for the nav bar on small screens. */
  shortName: string;
  tagline: string;
  seoTitle: string;
  seoDescription: string;
  /** Tailwind-compatible accent colour token used for rules and kickers. */
  accent: string;
  defaultRegion: Region;
  /** Order in the primary navigation. */
  order: number;
}

export const CATEGORY_META: Record<Category, CategoryMeta> = {
  nigeria: {
    slug: "nigeria",
    name: "Nigeria",
    shortName: "Nigeria",
    tagline: "The national story, as it develops",
    seoTitle: "Nigeria News — Latest Headlines Today",
    seoDescription:
      "Breaking Nigerian news from Punch, Premium Times, Channels, Vanguard, TheCable and official government sources, summarised and attributed.",
    accent: "#0B7A4B",
    defaultRegion: "ng",
    order: 1,
  },
  politics: {
    slug: "politics",
    name: "Politics",
    shortName: "Politics",
    tagline: "Power, policy and the people who hold it",
    seoTitle: "Nigerian Politics News — Government, Elections, Policy",
    seoDescription:
      "Nigerian politics: the presidency, National Assembly, INEC, state governments and party politics — reported across multiple sources.",
    accent: "#7C3AED",
    defaultRegion: "ng",
    order: 2,
  },
  business: {
    slug: "business",
    name: "Business & Economy",
    shortName: "Business",
    tagline: "Naira, markets, oil and the real economy",
    seoTitle: "Nigerian Business & Economy News — Naira, Markets, CBN",
    seoDescription:
      "Nigerian business and economy news: the naira, CBN policy, inflation, NBS data, oil, banking and markets.",
    accent: "#B45309",
    defaultRegion: "ng",
    order: 3,
  },
  technology: {
    slug: "technology",
    name: "Technology",
    shortName: "Tech",
    tagline: "Startups, infrastructure and the digital economy",
    seoTitle: "Nigerian Technology News — Startups, Fintech, Telecoms",
    seoDescription:
      "Nigerian and African technology news: startups, funding, fintech, telecoms, NCC policy and the digital economy.",
    accent: "#0369A1",
    defaultRegion: "ng",
    order: 4,
  },
  sports: {
    slug: "sports",
    name: "Sports",
    shortName: "Sports",
    tagline: "Super Eagles, the leagues and the continent",
    seoTitle: "Nigerian Sports News — Super Eagles, NPFL, Premier League",
    seoDescription:
      "Nigerian and world sports: the Super Eagles, NPFL, AFCON, the Premier League and major international competition.",
    accent: "#15803D",
    defaultRegion: "ng",
    order: 5,
  },
  entertainment: {
    slug: "entertainment",
    name: "Entertainment",
    shortName: "Ent",
    tagline: "Nollywood, Afrobeats and culture",
    seoTitle: "Nigerian Entertainment News — Nollywood, Afrobeats, Culture",
    seoDescription:
      "Nigerian entertainment: Nollywood, Afrobeats, music, film, celebrity and culture news.",
    accent: "#BE185D",
    defaultRegion: "ng",
    order: 6,
  },
  world: {
    slug: "world",
    name: "World",
    shortName: "World",
    tagline: "The global picture, from a Nigerian vantage point",
    seoTitle: "World News — Global Headlines for Nigerian Readers",
    seoDescription:
      "World news from Reuters, AP, AFP, BBC, Al Jazeera and DW — the global stories that matter to Nigeria.",
    accent: "#334155",
    defaultRegion: "world",
    order: 7,
  },
};

export const NAV_CATEGORIES: CategoryMeta[] = CATEGORIES.map(
  (slug) => CATEGORY_META[slug],
).sort((a, b) => a.order - b.order);

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}

export function getCategoryMeta(slug: string): CategoryMeta | null {
  return isCategory(slug) ? CATEGORY_META[slug] : null;
}

// ---------------------------------------------------------------------------
// Ads
// ---------------------------------------------------------------------------

export const AD_PLACEMENTS = [
  "TOP_BANNER",
  "IN_FEED",
  "ARTICLE",
  "SIDEBAR",
  "MOBILE_STICKY",
] as const;
export type AdPlacement = (typeof AD_PLACEMENTS)[number];

export const AD_PROVIDERS = ["HOUSE", "GAM", "ADSENSE", "CUSTOM_HTML", "NONE"] as const;
export type AdProvider = (typeof AD_PROVIDERS)[number];
