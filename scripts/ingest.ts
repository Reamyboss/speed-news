/**
 * Runs the ingest pipeline once.
 *   npx tsx scripts/ingest.ts [--slugs punch,premium-times] [--max 25]
 */
import { prisma } from "../src/lib/db";
import { runIngest } from "../src/lib/ingest";

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

async function main() {
  const slugs = flag("slugs")?.split(",").map((s) => s.trim()).filter(Boolean);
  const max = flag("max") ? Number(flag("max")) : undefined;

  console.log("Running ingest...");
  const summary = await runIngest({
    slugs,
    maxItemsPerSource: Number.isFinite(max) ? max : undefined,
  });

  console.log("\n--- INGEST SUMMARY ---");
  console.log(`sources : ${summary.sourcesSucceeded} ok / ${summary.sourcesFailed} failed`);
  console.log(`items   : ${summary.itemsCreated} created, ${summary.itemsDuplicate} duplicate, ${summary.itemsRejected} unusable, ${summary.itemsCapped} over cap (of ${summary.itemsSeen} seen)`);
  console.log(`clusters: ${summary.clustersTouched} touched`);
  console.log(`took    : ${(summary.durationMs / 1000).toFixed(1)}s`);

  const failures = summary.results.filter((r) => !r.ok);
  if (failures.length) {
    console.log("\nFailed sources:");
    for (const f of failures) console.log(`  ${f.sourceSlug}: ${(f.error ?? "").slice(0, 80)}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
