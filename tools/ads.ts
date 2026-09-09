import { prisma } from "../src/lib/db";
async function main() {
  const ads = await prisma.adSlot.findMany({ orderBy: [{ placement: "asc" }, { priority: "desc" }] });
  console.log(`${ads.length} ad slots configured:\n`);
  for (const a of ads) {
    console.log(`  ${a.placement.padEnd(15)} key=${a.key.padEnd(22)} provider=${a.provider.padEnd(12)} enabled=${a.enabled} ${a.widthPx ?? "?"}x${a.heightPx ?? "?"}`);
    if (a.headline) console.log(`      house creative: "${a.headline}" -> ${a.clickUrl ?? "(no link)"}`);
  }
  const placements = new Set(ads.map((a) => a.placement));
  console.log("\nrequired placement coverage:");
  for (const p of ["TOP_BANNER", "IN_FEED", "ARTICLE", "SIDEBAR", "MOBILE_STICKY"]) {
    console.log(`  ${placements.has(p) ? "YES" : "MISSING"}  ${p}`);
  }
}
main().finally(() => prisma.$disconnect());
