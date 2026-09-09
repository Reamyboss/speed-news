/** Explains a classification decision. Usage: npx tsx scripts/why-category.ts <story slug fragment> */
import { prisma } from "../src/lib/db";
import { classifyStory } from "../src/lib/classify";

async function main() {
  const fragment = process.argv[2] ?? "family-planning";
  const stories = await prisma.story.findMany({
    where: { slug: { contains: fragment } },
    take: 3,
    select: {
      headline: true, summary: true, category: true, canonicalUrl: true,
      source: { select: { categories: true, type: true, country: true } },
    },
  });

  for (const s of stories) {
    const result = classifyStory({
      headline: s.headline,
      summary: s.summary,
      url: s.canonicalUrl,
      sourceCategories: s.source.categories,
      sourceType: s.source.type as never,
      sourceCountry: s.source.country,
    });
    console.log(`\nHEADLINE : ${s.headline}`);
    console.log(`URL      : ${s.canonicalUrl}`);
    console.log(`SOURCE   : declares [${s.source.categories}]`);
    console.log(`STORED   : ${s.category}   RECOMPUTED: ${result.category} (conf ${result.confidence})`);
    console.log(`SCORES   : ${Object.entries(result.scores).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join("  ")}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
