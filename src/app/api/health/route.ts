import { NextResponse } from "next/server";
import { getPlatformHealth } from "@/lib/queries";
import { getAiProvider } from "@/lib/ai";
import { productionConfigIssues } from "@/lib/env";

/**
 * Operational health endpoint for uptime checks and deploy verification.
 *
 * Reports only aggregate counts and pipeline state — never secrets, never
 * connection strings, never the AI key.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();

  try {
    const health = await getPlatformHealth();
    const provider = getAiProvider();
    const configIssues = productionConfigIssues();
    const blockers = configIssues.filter((issue) => issue.level === "blocker");

    const staleAfterHours = 6;
    // Publisher clocks run slightly ahead of ours often enough that a raw
    // subtraction yields a confusing negative age; floor it at zero.
    const newestAgeHours = health.newestStoryAt
      ? Math.max(0, (Date.now() - health.newestStoryAt.getTime()) / 3_600_000)
      : null;

    const contentFresh = newestAgeHours !== null && newestAgeHours < staleAfterHours;
    const hasContent = health.stories > 0;

    return NextResponse.json(
      {
        // A misconfigured deployment is not healthy even when it is serving
        // cached content, so a blocker outranks the content signal.
        status: blockers.length
          ? "misconfigured"
          : hasContent
            ? contentFresh
              ? "ok"
              : "stale"
            : "empty",
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        content: {
          stories: health.stories,
          clusters: health.clusters,
          enrichedStories: health.enrichedStories,
          newestStoryAt: health.newestStoryAt?.toISOString() ?? null,
          newestStoryAgeHours:
            newestAgeHours === null ? null : Number(newestAgeHours.toFixed(2)),
        },
        sources: {
          total: health.sources,
          active: health.activeSources,
          broken: health.brokenSources,
        },
        ai: {
          provider: provider.name,
          model: provider.model,
          available: provider.isAvailable,
        },
        config: {
          ok: blockers.length === 0,
          issues: configIssues,
        },
        lastIngestRun: health.lastRun
          ? {
              status: health.lastRun.status,
              startedAt: health.lastRun.startedAt.toISOString(),
              finishedAt: health.lastRun.finishedAt?.toISOString() ?? null,
              sourcesSucceeded: health.lastRun.sourcesSucceeded,
              sourcesFailed: health.lastRun.sourcesFailed,
              itemsCreated: health.lastRun.itemsCreated,
            }
          : null,
      },
      {
        status: blockers.length || !hasContent ? 503 : 200,
        headers: { "cache-control": "no-store, max-age=0" },
      },
    );
  } catch (error) {
    console.error("[health] check failed:", error);
    return NextResponse.json(
      { status: "error", checkedAt: new Date().toISOString() },
      { status: 503, headers: { "cache-control": "no-store, max-age=0" } },
    );
  }
}
