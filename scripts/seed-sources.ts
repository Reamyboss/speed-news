/**
 * Seeds the Source Registry and the default advertising inventory.
 *
 * Idempotent: re-running updates existing rows by slug rather than creating
 * duplicates, and never clobbers runtime health fields (lastError, failure
 * counts) or a status the pipeline has since changed.
 */
import { prisma } from "../src/lib/db";
import { SOURCE_SEED } from "../src/data/sources";
import { SOURCE_TYPE_META } from "../src/lib/taxonomy";
import { sourceSeedSchema } from "../src/lib/validation";
import { AD_SLOT_SEED } from "../src/data/ad-slots";

async function seedSources() {
  let created = 0;
  let updated = 0;
  let invalid = 0;

  for (const raw of SOURCE_SEED) {
    const parsed = sourceSeedSchema.safeParse(raw);
    if (!parsed.success) {
      invalid += 1;
      console.error(`  INVALID ${raw.slug}: ${parsed.error.issues[0]?.message}`);
      continue;
    }
    const seed = parsed.data;

    // Fall back to the type's default tier when a seed omits a sensible one.
    const trustTier = seed.trustTier || SOURCE_TYPE_META[seed.type].defaultTrustTier;

    const data = {
      name: seed.name,
      type: seed.type,
      country: seed.country,
      region: seed.region,
      language: seed.language,
      categories: seed.categories,
      url: seed.url,
      rssUrl: seed.rssUrl ?? null,
      apiUrl: seed.apiUrl ?? null,
      socialUrls: seed.socialUrls ? JSON.stringify(seed.socialUrls) : null,
      trustTier,
      license: seed.license ?? "RSS_SUMMARY",
      weight: seed.weight,
    };

    const existing = await prisma.source.findUnique({ where: { slug: seed.slug } });
    if (existing) {
      await prisma.source.update({ where: { slug: seed.slug }, data });
      updated += 1;
    } else {
      await prisma.source.create({
        data: { ...data, slug: seed.slug, status: seed.status ?? "ACTIVE" },
      });
      created += 1;
    }
  }

  return { created, updated, invalid };
}

async function seedAdSlots() {
  let created = 0;
  for (const slot of AD_SLOT_SEED) {
    const existing = await prisma.adSlot.findUnique({ where: { key: slot.key } });
    if (existing) continue;
    await prisma.adSlot.create({ data: slot });
    created += 1;
  }
  return created;
}

async function main() {
  console.log("Seeding source registry...");
  const sources = await seedSources();
  console.log(`  created ${sources.created}, updated ${sources.updated}, invalid ${sources.invalid}`);

  console.log("Seeding ad inventory...");
  const ads = await seedAdSlots();
  console.log(`  created ${ads} ad slots`);

  const total = await prisma.source.count();
  const active = await prisma.source.count({ where: { status: "ACTIVE" } });
  const withFeeds = await prisma.source.count({ where: { rssUrl: { not: null } } });
  console.log(`\nRegistry: ${total} sources (${active} active, ${withFeeds} with feeds)`);

  if (sources.invalid > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
