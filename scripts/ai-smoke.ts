/**
 * Controlled live test of the AI enrichment path, against real stories.
 *
 *   npx tsx scripts/ai-smoke.ts            # 3 real stories from the database
 *   npx tsx scripts/ai-smoke.ts --n 8      # more
 *   npx tsx scripts/ai-smoke.ts --synthetic  # fixed fixture, no database
 *
 * Without ANTHROPIC_API_KEY this still proves the SDK loads, a request is
 * genuinely issued, and the 401 is classified as terminal rather than retried.
 * With a key it runs a small, bounded live batch and checks seven things:
 *
 *   1. summary generated
 *   2. why-it-matters generated
 *   3. Zod validation enforced (the provider rejects anything that fails)
 *   4. failure handling — a deliberately bad key must fail terminally
 *   5. token and cost discipline, including whether prompt caching is working
 *   6. GROUNDING — every figure and proper noun in the output must appear in
 *      the material supplied. This is the hallucination check.
 *   7. attribution — the model must not be inventing a different source
 *
 * Cost is bounded: it enriches `--n` stories (default 3) and prints what it
 * spent. Nothing is written to the database.
 */
import { prisma } from "../src/lib/db";
import { AnthropicProvider } from "../src/lib/ai/anthropic";
import { buildGroundingMaterial, checkGrounding, enrichmentOutputText } from "../src/lib/ai/grounding";
import type { EnrichmentRequest } from "../src/lib/ai/types";

const argN = process.argv.find((a) => a === "--n");
const count = argN ? Number(process.argv[process.argv.indexOf(argN) + 1]) || 3 : 3;
const synthetic = process.argv.includes("--synthetic");

const key = process.env.ANTHROPIC_API_KEY || "";
const isLive = Boolean(key);
const model = process.env.AI_MODEL || "claude-opus-5";

// Published per-MTok rates for claude-opus-5. Used only to turn token counts
// into a number a human can act on; it is not a billing source of truth.
const USD_PER_MTOK_IN = 5;
const USD_PER_MTOK_OUT = 25;
const USD_PER_MTOK_CACHE_READ = 0.5;

const SYNTHETIC: EnrichmentRequest = {
  headline: "CBN holds benchmark interest rate at 27.5 per cent",
  summary:
    "The Monetary Policy Committee of the Central Bank of Nigeria voted to leave the benchmark " +
    "rate unchanged after a two-day meeting in Abuja.",
  excerpt: null,
  sourceName: "Premium Times",
  sourceType: "SPECIALIST_MEDIA",
  category: "business",
  publishedAt: new Date(),
  relatedHeadlines: ["Central Bank leaves rates unchanged, citing inflation"],
};

async function loadRequests(): Promise<EnrichmentRequest[]> {
  if (synthetic) return [SYNTHETIC];

  const stories = await prisma.story.findMany({
    where: { status: "PUBLISHED" },
    orderBy: [{ importance: "desc" }, { publishedAt: "desc" }],
    take: count,
    select: {
      headline: true, summary: true, excerpt: true, category: true, publishedAt: true,
      source: { select: { name: true, type: true } },
      cluster: { select: { stories: { select: { headline: true }, take: 6 } } },
    },
  });

  return stories.map((story) => ({
    headline: story.headline,
    summary: story.summary,
    excerpt: story.excerpt,
    sourceName: story.source.name,
    sourceType: story.source.type,
    category: story.category,
    publishedAt: story.publishedAt,
    relatedHeadlines: story.cluster?.stories.map((s) => s.headline).filter((h) => h !== story.headline),
  }));
}

async function main() {
  console.log(`mode : ${isLive ? "LIVE" : "PATH CHECK (no ANTHROPIC_API_KEY — a terminal 401 is the expected pass)"}`);
  console.log(`model: ${model}`);

  // ---- 4. Failure handling, always exercised ------------------------------
  console.log("\n--- failure handling ---");
  const badProvider = new AnthropicProvider("sk-ant-deliberately-invalid", model);
  const badResult = await badProvider.enrich(SYNTHETIC);
  if (badResult.ok) {
    console.log("  FAIL   an invalid key produced a success. That should be impossible.");
  } else {
    const terminal = !badResult.retryable;
    console.log(`  ${terminal ? "PASS" : "FAIL"}   invalid key -> ${badResult.error.slice(0, 72)}`);
    console.log(`         classified ${terminal ? "terminal (will not retry)" : "RETRYABLE — wrong, would loop"}`);
  }

  const noKeyProvider = new AnthropicProvider("", model);
  console.log(`  ${noKeyProvider.isAvailable ? "FAIL" : "PASS"}   empty key -> isAvailable=false (pipeline uses extractive fallback)`);

  if (!isLive) {
    console.log("\nNo API key set, so no live enrichment was attempted.");
    console.log("Set ANTHROPIC_API_KEY and re-run to exercise generation, grounding and cost.");
    return;
  }

  // ---- Live batch ---------------------------------------------------------
  const requests = await loadRequests();
  console.log(`\n--- live enrichment of ${requests.length} real ${requests.length === 1 ? "story" : "stories"} ---`);

  const provider = new AnthropicProvider(key, model);
  let totals = { in: 0, out: 0, cacheRead: 0, cacheWrite: 0, ok: 0, failed: 0, ungrounded: 0 };
  const started = Date.now();

  for (const [index, request] of requests.entries()) {
    const material = buildGroundingMaterial(request);
    const result = await provider.enrich(request);

    console.log(`\n[${index + 1}] ${request.headline.slice(0, 76)}`);
    console.log(`    source: ${request.sourceName}`);

    if (!result.ok) {
      totals.failed += 1;
      console.log(`    FAILED: ${result.error.slice(0, 110)} (retryable=${result.retryable})`);
      continue;
    }

    totals.ok += 1;
    totals.in += result.usage?.inputTokens ?? 0;
    totals.out += result.usage?.outputTokens ?? 0;
    totals.cacheRead += result.usage?.cacheReadTokens ?? 0;
    totals.cacheWrite += result.usage?.cacheWriteTokens ?? 0;

    console.log(`    summary : ${result.data.summary}`);
    console.log(`    why     : ${result.data.whyItMatters}`);
    if (result.data.bullets.length) {
      for (const bullet of result.data.bullets) console.log(`      - ${bullet}`);
    }
    if (result.data.entities.length) {
      console.log(`    entities: ${result.data.entities.map((e) => `${e.name} (${e.type})`).join(", ")}`);
    }

    // ---- 6. Grounding ----------------------------------------------------
    const checkText = enrichmentOutputText(result.data);
    const { unsupportedNumbers, unsupportedNames } = checkGrounding(checkText, material);
    if (unsupportedNumbers.length || unsupportedNames.length) {
      totals.ungrounded += 1;
      console.log(`    GROUNDING REVIEW:`);
      if (unsupportedNumbers.length) console.log(`      figures not in source: ${unsupportedNumbers.join(", ")}`);
      if (unsupportedNames.length) console.log(`      names not in source:   ${unsupportedNames.join(", ")}`);
    } else {
      console.log(`    grounding: ok — no figures or names beyond the source material`);
    }

    // ---- 7. Attribution --------------------------------------------------
    const claimsOtherSource = /\b(reuters|associated press|\bbbc\b|cnn|bloomberg)\b/i.test(checkText) &&
      !new RegExp(request.sourceName.split(" ")[0], "i").test(material);
    if (claimsOtherSource) {
      console.log(`    ATTRIBUTION REVIEW: output names a newsroom absent from the material`);
    }
  }

  // ---- 5. Cost -------------------------------------------------------------
  const cost =
    (totals.in / 1e6) * USD_PER_MTOK_IN +
    (totals.out / 1e6) * USD_PER_MTOK_OUT +
    (totals.cacheRead / 1e6) * USD_PER_MTOK_CACHE_READ;

  console.log(`\n--- results ---`);
  console.log(`  enriched      : ${totals.ok} ok, ${totals.failed} failed, in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log(`  grounding     : ${totals.ok - totals.ungrounded}/${totals.ok} clean, ${totals.ungrounded} flagged for review`);
  console.log(`  tokens        : ${totals.in} in, ${totals.out} out`);
  console.log(`  prompt cache  : ${totals.cacheRead} read, ${totals.cacheWrite} written`);
  if (totals.ok > 1 && totals.cacheRead === 0) {
    console.log(`                  WARNING: no cache reads across ${totals.ok} calls — the shared`);
    console.log(`                  system prompt is being re-billed every time. Check cache_control.`);
  }
  console.log(`  cost this run : $${cost.toFixed(4)}  (~$${(cost / Math.max(1, totals.ok)).toFixed(5)}/story)`);
  console.log(`  projected     : $${((cost / Math.max(1, totals.ok)) * 500).toFixed(2)} per 500 stories`);
}

main()
  .catch((error) => {
    console.error("UNCAUGHT:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
