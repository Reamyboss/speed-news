/**
 * The full pipeline: INGEST -> ENRICH.
 *
 * Enrichment failure never fails the run — publishing has already happened by
 * the time it starts.
 *   npx tsx scripts/pipeline.ts
 */
import { prisma } from "../src/lib/db";
import { runIngest } from "../src/lib/ingest";
import { enrichPendingStories } from "../src/lib/ai/enrich";

async function main() {
  console.log("[1/2] Ingesting sources...");
  const ingest = await runIngest();
  console.log(
    `      ${ingest.itemsCreated} new stories from ${ingest.sourcesSucceeded}/${ingest.sourcesAttempted} sources ` +
      `(${ingest.itemsDuplicate} duplicates filtered) in ${(ingest.durationMs / 1000).toFixed(1)}s`,
  );

  console.log("[2/2] Enriching stories...");
  try {
    const enrich = await enrichPendingStories();
    console.log(
      `      provider=${enrich.provider} ok=${enrich.succeeded} failed=${enrich.failed} skipped=${enrich.skipped}`,
    );
  } catch (error) {
    console.error("      enrichment stage failed (site is unaffected):", error);
  }

  const [stories, clusters, sources] = await Promise.all([
    prisma.story.count({ where: { status: "PUBLISHED" } }),
    prisma.storyCluster.count(),
    prisma.source.count({ where: { status: "ACTIVE" } }),
  ]);
  console.log(`\nDatabase now holds ${stories} published stories across ${clusters} clusters from ${sources} active sources.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
