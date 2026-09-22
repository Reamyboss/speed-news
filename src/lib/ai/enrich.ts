import { prisma } from "../db";
import { AI_CONFIG } from "../env";
import { getAiProvider } from "./index";
import type { AiProvider } from "./types";

/**
 * The AI enrichment stage.
 *
 * Runs AFTER publishing, never before. A story is live and readable the
 * moment it is stored; enrichment only adds to it. Every failure mode here is
 * non-fatal by design — the worst case is a story that shows its extractive
 * summary and no AI blocks, which is a complete, honest page.
 */

export interface EnrichSummary {
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: number;
  provider: string;
  model: string | null;
  durationMs: number;
}

export interface EnrichOptions {
  limit?: number;
  provider?: AiProvider;
  /** Re-enrich stories that previously failed, not just PENDING ones. */
  includeFailed?: boolean;
  /** Sequential by default; raise carefully to respect rate limits. */
  concurrency?: number;
}

const MAX_ATTEMPTS = 3;
const MAX_WAIT_MS = 20_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Providers say "try again in 11.09s" on a 429; honour it, within reason. */
function retryDelayMs(error: string, attempt: number): number {
  const hinted = /try again in ([\d.]+)\s*(ms|s)/i.exec(error);
  if (hinted) {
    const value = Number(hinted[1]) * (hinted[2].toLowerCase() === "ms" ? 1 : 1000);
    return Math.min(value + 500, MAX_WAIT_MS);
  }
  return Math.min(1500 * 2 ** attempt, MAX_WAIT_MS);
}

export async function enrichPendingStories(
  options: EnrichOptions = {},
): Promise<EnrichSummary> {
  const started = Date.now();
  const provider = options.provider ?? getAiProvider();
  const limit = options.limit ?? AI_CONFIG.batchSize;

  const summary: EnrichSummary = {
    attempted: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    provider: provider.name,
    model: provider.model,
    durationMs: 0,
  };

  // No provider: mark the batch SKIPPED so the queue does not grow without
  // bound, and return cleanly. This is a normal operating mode.
  if (!provider.isAvailable) {
    const skipped = await prisma.story.updateMany({
      where: { aiStatus: "PENDING" },
      data: {
        aiStatus: "SKIPPED",
        aiError: `provider unavailable: ${provider.name}`,
        aiProvider: provider.name,
      },
    });
    summary.skipped = skipped.count;
    summary.durationMs = Date.now() - started;
    return summary;
  }

  const statuses = options.includeFailed ? ["PENDING", "FAILED"] : ["PENDING"];

  const stories = await prisma.story.findMany({
    where: { aiStatus: { in: statuses }, status: "PUBLISHED" },
    // Enrich what readers are most likely to see first.
    orderBy: [{ importance: "desc" }, { publishedAt: "desc" }],
    take: limit,
    select: {
      id: true,
      headline: true,
      summary: true,
      excerpt: true,
      category: true,
      publishedAt: true,
      clusterId: true,
      source: { select: { name: true, type: true } },
    },
  });

  summary.attempted = stories.length;
  if (stories.length === 0) {
    summary.durationMs = Date.now() - started;
    return summary;
  }

  const concurrency = Math.max(1, Math.min(options.concurrency ?? 2, 8));
  const queue = [...stories];

  async function worker() {
    for (;;) {
      const story = queue.shift();
      if (!story) return;

      // Sibling coverage gives the model corroboration context without
      // handing it any claim it could mistake for a fact of its own.
      const relatedHeadlines = story.clusterId
        ? (
            await prisma.story.findMany({
              where: { clusterId: story.clusterId, id: { not: story.id } },
              select: { headline: true },
              take: 5,
            })
          ).map((s) => s.headline)
        : [];

      const request = {
        headline: story.headline,
        summary: story.summary,
        excerpt: story.excerpt,
        sourceName: story.source.name,
        sourceType: story.source.type,
        category: story.category,
        publishedAt: story.publishedAt,
        relatedHeadlines,
      };

      // Rate limits and provider load spikes are transient. Retry those with
      // backoff; terminal failures (bad key, schema rejection) never loop.
      let result = await provider.enrich(request);
      for (
        let attempt = 1;
        !result.ok && result.retryable && attempt < MAX_ATTEMPTS;
        attempt++
      ) {
        await sleep(retryDelayMs(result.error, attempt));
        result = await provider.enrich(request);
      }

      if (result.ok) {
        await prisma.story
          .update({
            where: { id: story.id },
            data: {
              aiSummary: result.data.summary,
              aiWhyItMatters: result.data.whyItMatters,
              aiBullets: result.data.bullets.length
                ? JSON.stringify(result.data.bullets)
                : null,
              aiEntities: result.data.entities.length
                ? JSON.stringify(result.data.entities)
                : null,
              aiProvider: result.provider,
              aiModel: result.model,
              aiStatus: "OK",
              aiError: null,
              aiEnrichedAt: new Date(),
            },
          })
          .then(() => {
            summary.succeeded += 1;
          })
          .catch((error) => {
            summary.failed += 1;
            console.error("[ai] failed to persist enrichment:", error);
          });
      } else {
        summary.failed += 1;
        // A retryable failure stays FAILED so `--include-failed` can pick it
        // up; a terminal one is SKIPPED so it never blocks the queue again.
        await prisma.story
          .update({
            where: { id: story.id },
            data: {
              aiStatus: result.retryable ? "FAILED" : "SKIPPED",
              aiError: result.error.slice(0, 400),
              aiProvider: result.provider,
              aiModel: result.model,
            },
          })
          .catch(() => undefined);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));

  summary.durationMs = Date.now() - started;
  return summary;
}
