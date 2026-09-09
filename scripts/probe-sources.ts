/**
 * Probes every feed in the source registry against the live web and writes a
 * report. This keeps the registry honest: a source we cannot actually pull is
 * marked BROKEN rather than silently producing an empty section forever.
 *
 *   npx tsx scripts/probe-sources.ts [--json]
 */
import { SOURCE_SEED } from "../src/data/sources";
import { fetchFeed, parseFeed, normalizeItem } from "../src/lib/feed";

interface ProbeResult {
  slug: string;
  name: string;
  rssUrl: string | null;
  ok: boolean;
  items: number;
  usable: number;
  sampleHeadline?: string;
  withImages?: number;
  withDates?: number;
  error?: string;
  ms: number;
}

const CONCURRENCY = 10;

async function probe(seed: (typeof SOURCE_SEED)[number]): Promise<ProbeResult> {
  const started = Date.now();
  const base: ProbeResult = {
    slug: seed.slug,
    name: seed.name,
    rssUrl: seed.rssUrl ?? null,
    ok: false,
    items: 0,
    usable: 0,
    ms: 0,
  };

  if (!seed.rssUrl) {
    return { ...base, ms: 0, error: "no rss url declared" };
  }

  try {
    const xml = await fetchFeed(seed.rssUrl, { timeoutMs: 20_000 });
    const parsed = parseFeed(xml, seed.rssUrl);
    const normalized = parsed.items
      .map((item) => normalizeItem(item))
      .filter((item): item is NonNullable<typeof item> => item !== null);

    return {
      ...base,
      ok: normalized.length > 0,
      items: parsed.items.length,
      usable: normalized.length,
      sampleHeadline: normalized[0]?.headline,
      withImages: normalized.filter((i) => i.imageUrl).length,
      withDates: normalized.filter((i) => !i.publishedAtInferred).length,
      ms: Date.now() - started,
      error: normalized.length === 0 ? "parsed but produced 0 usable items" : undefined,
    };
  } catch (error) {
    return {
      ...base,
      ms: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const queue = [...SOURCE_SEED];
  const results: ProbeResult[] = [];

  async function worker() {
    for (;;) {
      const seed = queue.shift();
      if (!seed) return;
      const result = await probe(seed);
      results.push(result);
      const status = result.ok ? "OK  " : "FAIL";
      const detail = result.ok
        ? `${String(result.usable).padStart(3)} items  img:${result.withImages}  dated:${result.withDates}`
        : (result.error ?? "unknown").slice(0, 70);
      console.log(`${status} ${result.slug.padEnd(24)} ${detail}`);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  results.sort((a, b) => a.slug.localeCompare(b.slug));
  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  console.log("\n=========================================================");
  console.log(`WORKING : ${ok.length}/${results.length}`);
  console.log(`FAILED  : ${failed.length}/${results.length}`);
  console.log(`ITEMS   : ${ok.reduce((sum, r) => sum + r.usable, 0)} usable items available now`);
  console.log("=========================================================");

  if (failed.length) {
    console.log("\nFAILING SOURCES (will be marked BROKEN):");
    for (const r of failed) console.log(`  - ${r.slug}: ${(r.error ?? "").slice(0, 90)}`);
  }

  if (process.argv.includes("--json")) {
    const fs = await import("node:fs");
    fs.writeFileSync("probe-report.json", JSON.stringify(results, null, 2));
    console.log("\nWrote probe-report.json");
  }

  console.log("\nWORKING SLUGS:");
  console.log(ok.map((r) => r.slug).join(","));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
