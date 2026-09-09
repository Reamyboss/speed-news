/**
 * Recomputes `importance` for stored stories.
 *
 * Ranking is tuning-sensitive and will change as the product is edited, so
 * this exists to reapply the current scoring rules to existing rows without a
 * re-ingest.
 *   npx tsx scripts/rescore.ts
 */
import { prisma } from "../src/lib/db";
import { scoreImportance } from "../src/lib/classify";
import { isSourceType, isRegion, type SourceType } from "../src/lib/taxonomy";

async function main() {
  const stories = await prisma.story.findMany({
    select: {
      id: true,
      headline: true,
      summary: true,
      publishedAt: true,
      imageUrl: true,
      region: true,
      importance: true,
      clusterId: true,
      source: { select: { trustTier: true, type: true, weight: true } },
    },
  });

  const clusterSourceCounts = new Map<string, number>();
  for (const cluster of await prisma.storyCluster.findMany({
    select: { id: true, sourceCount: true },
  })) {
    clusterSourceCounts.set(cluster.id, cluster.sourceCount);
  }

  const now = new Date();
  let changed = 0;

  for (const story of stories) {
    const sourceType: SourceType = isSourceType(story.source.type)
      ? story.source.type
      : "UNVERIFIED";

    const importance = scoreImportance({
      headline: story.headline,
      summary: story.summary,
      trustTier: story.source.trustTier,
      sourceType,
      sourceWeight: story.source.weight,
      publishedAt: story.publishedAt,
      hasImage: Boolean(story.imageUrl),
      corroboratingSources: story.clusterId
        ? (clusterSourceCounts.get(story.clusterId) ?? 1)
        : 1,
      region: isRegion(story.region) ? story.region : undefined,
      now,
    });

    if (importance !== story.importance) {
      await prisma.story.update({ where: { id: story.id }, data: { importance } });
      changed += 1;
    }
  }

  console.log(`Rescored ${stories.length} stories (${changed} changed).`);

  const top = await prisma.story.findMany({
    take: 10,
    orderBy: [{ importance: "desc" }, { publishedAt: "desc" }],
    select: { headline: true, importance: true, region: true, category: true, source: { select: { name: true } } },
  });
  console.log("\nNEW TOP STORIES:");
  for (const s of top) {
    console.log(`  [${s.importance}] ${s.region.padEnd(6)} ${s.category.padEnd(13)} ${s.headline.slice(0, 58)} — ${s.source.name}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
