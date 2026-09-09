/**
 * Recomputes `category`, `region` and `importance` for stored stories.
 *
 * Classification and ranking are tuning-sensitive and will change as the
 * product is edited, so this reapplies the current rules to existing rows
 * without a re-ingest.
 *   npx tsx scripts/rescore.ts
 */
import { prisma } from "../src/lib/db";
import { classifyStory, scoreImportance } from "../src/lib/classify";
import { isSourceType, type SourceType } from "../src/lib/taxonomy";

async function main() {
  const stories = await prisma.story.findMany({
    select: {
      id: true,
      headline: true,
      summary: true,
      publishedAt: true,
      imageUrl: true,
      canonicalUrl: true,
      region: true,
      category: true,
      importance: true,
      clusterId: true,
      source: {
        select: { trustTier: true, type: true, weight: true, categories: true, country: true },
      },
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
  let reclassified = 0;

  for (const story of stories) {
    const sourceType: SourceType = isSourceType(story.source.type)
      ? story.source.type
      : "UNVERIFIED";

    const classification = classifyStory({
      headline: story.headline,
      summary: story.summary,
      url: story.canonicalUrl,
      sourceCategories: story.source.categories,
      sourceType,
      sourceCountry: story.source.country,
    });

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
      region: classification.region,
      url: story.canonicalUrl,
      now,
    });

    const categoryChanged = classification.category !== story.category;
    const regionChanged = classification.region !== story.region;

    if (importance !== story.importance || categoryChanged || regionChanged) {
      await prisma.story.update({
        where: { id: story.id },
        data: { importance, category: classification.category, region: classification.region },
      });
      changed += 1;
      if (categoryChanged) reclassified += 1;
    }
  }

  console.log(
    `Rescored ${stories.length} stories (${changed} updated, ${reclassified} recategorised).`,
  );

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
