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

  // Anthropic
  apiKey: process.env.ANTHROPIC_API_KEY || "",
  model: process.env.AI_MODEL || "claude-opus-5",

  // Google Gemini
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.AI_GEMINI_MODEL || "gemini-3.6-flash",

  // Groq
  groqApiKey: process.env.GROQ_API_KEY || "",
  groqModel: process.env.AI_GROQ_MODEL || "openai/gpt-oss-20b",

  // Optional future automatic fallback
  fallbackProvider: (process.env.AI_FALLBACK_PROVIDER || "").toLowerCase(),

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

/**
 * Configuration problems that matter in production.
 *
 * Reported by `/api/health` so a deploy can be verified with one request
 * instead of discovering a missing variable when the first cron fires at 2am.
 * Returns messages, never values — this response is public.
 *
 * The split matters: a BLOCKER means something is broken or unsafe, a WARNING
 * means a feature is off. Running without AI is a supported mode, not a fault.
 */
export interface ConfigIssue {
  level: "blocker" | "warning";
  message: string;
}

export function productionConfigIssues(): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  if (!IS_PRODUCTION) return issues;

  if (!CRON_SECRET) {
    issues.push({
      level: "blocker",
      message:
        "CRON_SECRET is not set. The pipeline endpoint refuses to run, so no new " +
        "content will be ingested.",
    });
  } else if (CRON_SECRET.length < 16) {
    issues.push({
      level: "blocker",
      message: "CRON_SECRET is shorter than 16 characters and is guessable.",
    });
  }

  if (!process.env.DATABASE_URL) {
    issues.push({ level: "blocker", message: "DATABASE_URL is not set." });
  } else if (process.env.DATABASE_URL.startsWith("file:")) {
    issues.push({
      level: "blocker",
      message:
        "DATABASE_URL points at a SQLite file. Serverless instances do not share " +
        "a filesystem, so writes will be lost. Use PostgreSQL in production.",
    });
  }

  if (!process.env.NEXT_PUBLIC_SITE_URL) {
    issues.push({
      level: "warning",
      message:
        "NEXT_PUBLIC_SITE_URL is not set. Canonical URLs, sitemap and Open Graph " +
        "tags will fall back to the deployment URL.",
    });
  }

  const hasAiKey = !!(
    AI_CONFIG.apiKey ||
    AI_CONFIG.geminiApiKey ||
    AI_CONFIG.groqApiKey
  );
  if (!hasAiKey && AI_CONFIG.provider !== "none") {
    issues.push({
      level: "warning",
      message:
        "No AI provider key (GEMINI_API_KEY, GROQ_API_KEY or ANTHROPIC_API_KEY). Stories render with their extractive summaries and " +
        "no AI briefing — a supported mode, not a fault.",
    });
  }

  return issues;
}

/** Absolute URL helper used by metadata, sitemaps and structured data. */
export function absoluteUrl(path = "/"): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

