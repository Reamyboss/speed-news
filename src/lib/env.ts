/**
 * Centralised environment access.
 *
 * Rules:
 *  - Secrets are read on the server only and never re-exported to the client.
 *  - Every value has a safe default so a missing variable degrades the feature
 *    rather than crashing the site.
 *  - Anything the browser needs must be a literal `process.env.NEXT_PUBLIC_*`
 *    reference so Next can inline it at build time.
 */

function int(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return /^(1|true|yes|on)$/i.test(value.trim());
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

// --- Public (safe for the browser) -----------------------------------------

export const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || "NaijaPulse";

export const SITE_URL = stripTrailingSlash(
  process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:3000",
);

export const SITE_DESCRIPTION =
  "Nigerian news and intelligence. Every story attributed to its source, summarised clearly, with what it means and why it matters.";

export const SITE_LOCALE = "en_NG";

export const ADS_ENABLED = bool(process.env.NEXT_PUBLIC_ADS_ENABLED, true);

export const ANALYTICS = {
  provider: (process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER || "none").toLowerCase(),
  domain: process.env.NEXT_PUBLIC_ANALYTICS_DOMAIN || "",
  id: process.env.NEXT_PUBLIC_ANALYTICS_ID || "",
  scriptUrl: process.env.NEXT_PUBLIC_ANALYTICS_SCRIPT_URL || "",
} as const;

// --- Server only ------------------------------------------------------------

export const AI_CONFIG = {
  provider: (process.env.AI_PROVIDER || "").toLowerCase(),
  apiKey: process.env.ANTHROPIC_API_KEY || "",
  model: process.env.AI_MODEL || "claude-opus-5",
  batchSize: int(process.env.AI_ENRICH_BATCH_SIZE, 25),
} as const;

export const INGEST_CONFIG = {
  maxItemsPerSource: int(process.env.INGEST_MAX_ITEMS_PER_SOURCE, 25),
  concurrency: int(process.env.INGEST_CONCURRENCY, 8),
  timeoutMs: int(process.env.INGEST_TIMEOUT_MS, 15_000),
  userAgent:
    process.env.INGEST_USER_AGENT ||
    `${SITE_NAME}Bot/1.0 (+${SITE_URL}/about; news aggregation with attribution)`,
} as const;

export const CRON_SECRET = process.env.CRON_SECRET || "";

export const IS_PRODUCTION = process.env.NODE_ENV === "production";

/** Absolute URL helper used by metadata, sitemaps and structured data. */
export function absoluteUrl(path = "/"): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
