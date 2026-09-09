import { prisma } from "../src/lib/db";
async function main() {
  const c = await prisma.storyCluster.findFirst({
    where: { sourceCount: { gt: 2 } }, orderBy: { sourceCount: "desc" },
    select: { title: true, sourceCount: true, storyCount: true, stories: { select: { slug: true, headline: true, source: { select: { name: true } } } } },
  });
  if (!c) { console.log("none"); return; }
  console.log(`cluster: ${c.sourceCount} sources / ${c.storyCount} stories — ${c.title}`);
  for (const s of c.stories) console.log(`   ${s.source.name}: /story/${s.slug}`);
}
main().finally(() => prisma.$disconnect());
