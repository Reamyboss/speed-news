/** Dumps the real story corpus to JSON for clustering evaluation work. */
import { writeFileSync } from "node:fs";
import { prisma } from "../src/lib/db";

async function main() {
  const stories = await prisma.story.findMany({
    select: {
      id: true, headline: true, summary: true, category: true, publishedAt: true,
      titleKey: true, simhash: true, clusterId: true,
      source: { select: { slug: true, name: true } },
    },
    orderBy: { publishedAt: "desc" },
  });
  const rows = stories.map((s) => ({
    id: s.id, headline: s.headline, summary: (s.summary ?? "").slice(0, 400),
    category: s.category, publishedAt: s.publishedAt.toISOString(),
    titleKey: s.titleKey, simhash: s.simhash, clusterId: s.clusterId,
    source: s.source.slug, sourceName: s.source.name,
  }));
  writeFileSync("tools/corpus.json", JSON.stringify(rows, null, 1));
  console.log("wrote tools/corpus.json:", rows.length, "stories");
}
main().finally(() => prisma.$disconnect());
