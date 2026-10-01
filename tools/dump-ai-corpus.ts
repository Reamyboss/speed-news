/** Dumps every AI-enriched story to JSON for grounding evaluation work. */
import { writeFileSync } from "node:fs";
import { prisma } from "../src/lib/db";

async function main() {
  const stories = await prisma.story.findMany({
    where: { aiStatus: "OK" },
    orderBy: { aiEnrichedAt: "asc" },
    select: {
      id: true, headline: true, summary: true, excerpt: true, category: true,
      publishedAt: true,
      source: { select: { name: true, type: true } },
      aiProvider: true, aiModel: true,
      aiSummary: true, aiWhyItMatters: true, aiBullets: true, aiEntities: true,
      clusterId: true,
    },
  });

  // Sibling-cluster headlines, exactly what buildEnrichmentPrompt supplies as
  // "OTHER HEADLINES COVERING THE SAME EVENT" — current cluster membership,
  // which may have shifted slightly since the story was actually enriched.
  const rows = await Promise.all(
    stories.map(async (s) => {
      const relatedHeadlines = s.clusterId
        ? (
            await prisma.story.findMany({
              where: { clusterId: s.clusterId, id: { not: s.id } },
              select: { headline: true },
              take: 5,
            })
          ).map((r) => r.headline)
        : [];
      return { ...s, relatedHeadlines };
    }),
  );

  writeFileSync("tools/ai-corpus.json", JSON.stringify(rows, null, 1));
  console.log("wrote tools/ai-corpus.json:", rows.length, "enriched stories");
}

main().finally(() => prisma.$disconnect());
