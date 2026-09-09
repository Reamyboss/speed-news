import { prisma } from "../src/lib/db";
async function main() {
  const rows = await prisma.source.findMany({
    where: { status: { in: ["BROKEN", "PENDING"] } },
    select: { slug: true, name: true, url: true, rssUrl: true, status: true, type: true, trustTier: true, lastError: true, consecutiveFailures: true },
    orderBy: [{ type: "asc" }, { slug: "asc" }],
  });
  for (const r of rows) {
    console.log(`${r.status.padEnd(8)} T${r.trustTier} ${r.type.padEnd(18)} ${r.slug.padEnd(24)} ${r.rssUrl ?? "(no rss)"}`);
    if (r.lastError) console.log(`         err: ${r.lastError.slice(0, 110)}`);
  }
  console.log(`\ntotal: ${rows.length}`);
}
main().finally(() => prisma.$disconnect());
