/** Quick data-quality readout for the current database. */
import { prisma } from "../src/lib/db";

async function main() {
  const [stories, clusters, multi, withImg, sources] = await Promise.all([
    prisma.story.count(),
    prisma.storyCluster.count(),
    prisma.storyCluster.count({ where: { sourceCount: { gt: 1 } } }),
    prisma.story.count({ where: { imageUrl: { not: null } } }),
    prisma.source.count({ where: { status: "ACTIVE" } }),
  ]);
  console.log(`stories=${stories} clusters=${clusters} multiSourceClusters=${multi} withImages=${withImg} activeSources=${sources}`);

  const byCat = await prisma.story.groupBy({ by: ["category"], _count: { _all: true } });
  console.log("\nBY CATEGORY:");
  for (const c of byCat.sort((a, b) => b._count._all - a._count._all)) {
    console.log(`   ${c.category.padEnd(15)} ${c._count._all}`);
  }

  const bySrc = await prisma.story.groupBy({ by: ["sourceId"], _count: { _all: true } });
  const srcs = await prisma.source.findMany({
    where: { id: { in: bySrc.map((s) => s.sourceId) } },
    select: { id: true, name: true },
  });
  const names = new Map(srcs.map((s) => [s.id, s.name]));
  console.log("\nBY SOURCE:");
  for (const s of bySrc.sort((a, b) => b._count._all - a._count._all)) {
    console.log(`   ${(names.get(s.sourceId) ?? "?").padEnd(26)} ${s._count._all}`);
  }

  const top = await prisma.story.findMany({
    take: 8,
    orderBy: [{ importance: "desc" }, { publishedAt: "desc" }],
    select: { headline: true, category: true, importance: true, source: { select: { name: true } } },
  });
  console.log("\nTOP STORIES:");
  for (const s of top) {
    console.log(`   [${s.importance}] ${s.category.padEnd(13)} ${s.headline.slice(0, 66)} — ${s.source.name}`);
  }

  const biggest = await prisma.storyCluster.findMany({
    where: { sourceCount: { gt: 1 } },
    orderBy: { sourceCount: "desc" },
    take: 5,
    select: { title: true, storyCount: true, sourceCount: true },
  });
  console.log("\nLARGEST CLUSTERS (cross-source corroboration):");
  for (const c of biggest) {
    console.log(`   ${c.sourceCount} sources / ${c.storyCount} stories — ${c.title.slice(0, 62)}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
