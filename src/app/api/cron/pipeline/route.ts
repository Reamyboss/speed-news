import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runIngest } from "@/lib/ingest";
import { enrichPendingStories } from "@/lib/ai/enrich";
import { CRON_SECRET, IS_PRODUCTION } from "@/lib/env";

/**
 * Scheduled pipeline trigger (ingest -> enrich).
 *
 * Designed for Vercel Cron, GitHub Actions, or any scheduler that can send a
 * bearer token. Authentication is mandatory in production: an unauthenticated
 * trigger would let anyone force outbound fetches and AI spend on our account.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Authorises a pipeline trigger.
 *
 * The only accepted credential is the bearer token, because it is the only one
 * a caller cannot simply assert. An earlier version short-circuited on the
 * presence of an `x-vercel-cron` header, which any client can set with a
 * single curl flag — that made the secret decorative for anyone who read the
 * source. Vercel adds `Authorization: Bearer $CRON_SECRET` to its cron
 * invocations automatically when the variable is set, so requiring the token
 * costs nothing operationally and closes the hole.
 *
 * With no secret configured the endpoint runs only outside production. In
 * production a missing secret is a refusal, not a default-open: an open
 * trigger lets anyone force outbound fetches and AI spend on our account.
 */
function isAuthorised(request: NextRequest): boolean {
  if (!CRON_SECRET) return !IS_PRODUCTION;

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!provided) return false;

  // Constant-time compare; length is checked first because timingSafeEqual
  // throws on a length mismatch (and length alone is not a useful secret).
  const a = Buffer.from(provided);
  const b = Buffer.from(CRON_SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json(
      { error: "unauthorised" },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  const started = Date.now();

  try {
    const ingest = await runIngest();

    // Enrichment is best-effort and must never fail the run — stories are
    // already published and readable by this point.
    let enrich: Awaited<ReturnType<typeof enrichPendingStories>> | null = null;
    let enrichError: string | null = null;
    try {
      enrich = await enrichPendingStories();
    } catch (error) {
      enrichError = error instanceof Error ? error.message : String(error);
      console.error("[cron] enrichment failed:", error);
    }

    return NextResponse.json(
      {
        ok: true,
        durationMs: Date.now() - started,
        ingest: {
          sourcesAttempted: ingest.sourcesAttempted,
          sourcesSucceeded: ingest.sourcesSucceeded,
          sourcesFailed: ingest.sourcesFailed,
          itemsCreated: ingest.itemsCreated,
          itemsDuplicate: ingest.itemsDuplicate,
          itemsRejected: ingest.itemsRejected,
          clustersTouched: ingest.clustersTouched,
        },
        enrich: enrich
          ? {
              provider: enrich.provider,
              attempted: enrich.attempted,
              succeeded: enrich.succeeded,
              failed: enrich.failed,
              skipped: enrich.skipped,
            }
          : { error: enrichError },
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("[cron] pipeline failed:", error);
    return NextResponse.json(
      { ok: false, error: "pipeline failed" },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}

export const GET = handle;
export const POST = handle;
