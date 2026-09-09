import { prisma } from "../src/lib/db";
async function main() {
  const top = await prisma.story.findMany({
    take: 22, orderBy: [{ importance: "desc" }, { publishedAt: "desc" }],
    select: { headline: true, importance: true, category: true, source: { select: { name: true, slug: true, trustTier: true } } },
  });
  console.log("TOP BY IMPORTANCE:");
  for (const s of top) console.log(`  [${s.importance}] T${s.source.trustTier} ${s.source.slug.padEnd(16)} ${s.headline.slice(0, 74)}`);
  const bySrc = await prisma.story.groupBy({ by: ["sourceId"], _count: { _all: true }, _avg: { importance: true } });
  const srcs = await prisma.source.findMany({ select: { id: true, slug: true, trustTier: true } });
  const map = new Map(srcs.map((s) => [s.id, s]));
  console.log("\nAVG IMPORTANCE BY SOURCE (top 12):");
  for (const r of bySrc.sort((a, b) => (b._avg.importance ?? 0) - (a._avg.importance ?? 0)).slice(0, 12)) {
    const s = map.get(r.sourceId)!;
    console.log(`  ${(r._avg.importance ?? 0).toFixed(1)}  T${s.trustTier} ${s.slug.padEnd(18)} n=${r._count._all}`);
  }
}
main().finally(() => prisma.$disconnect());
