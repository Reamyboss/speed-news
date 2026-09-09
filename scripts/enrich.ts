/**
 * Runs the AI enrichment stage once.
 *   npx tsx scripts/enrich.ts [--limit 25] [--include-failed]
 */
import { prisma } from "../src/lib/db";
import { enrichPendingStories } from "../src/lib/ai/enrich";

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

async function main() {
  const limit = flag("limit") ? Number(flag("limit")) : undefined;

  const summary = await enrichPendingStories({
    limit: Number.isFinite(limit) ? limit : undefined,
    includeFailed: process.argv.includes("--include-failed"),
  });

  console.log("\n--- ENRICHMENT SUMMARY ---");
  console.log(`provider : ${summary.provider}${summary.model ? ` (${summary.model})` : ""}`);
  console.log(`attempted: ${summary.attempted}`);
  console.log(`succeeded: ${summary.succeeded}`);
  console.log(`failed   : ${summary.failed}`);
  console.log(`skipped  : ${summary.skipped}`);
  console.log(`took     : ${(summary.durationMs / 1000).toFixed(1)}s`);

  if (summary.provider === "none") {
    console.log("\nNo AI provider configured — stories will render with their");
    console.log("source-derived summaries. Set ANTHROPIC_API_KEY and");
    console.log('AI_PROVIDER="anthropic" in .env to enable AI enrichment.');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
