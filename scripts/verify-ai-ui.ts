/**
 * Temporarily marks one story as AI-enriched, so the rendering path for the
 * AI briefing block can be verified, then reverts it. Verification only —
 * never leaves synthetic AI text in the database.
 */
import { prisma } from "../src/lib/db";

async function main() {
  const mode = process.argv[2];
  const story = await prisma.story.findFirstOrThrow({
    orderBy: { importance: "desc" },
    select: { id: true, slug: true },
  });

  if (mode === "set") {
    await prisma.story.update({
      where: { id: story.id },
      data: {
        aiStatus: "OK",
        aiSummary:
          "VERIFICATION FIXTURE. This placeholder exercises the AI briefing rendering path and is removed immediately after the check.",
        aiWhyItMatters:
          "VERIFICATION FIXTURE. This placeholder exercises the why-it-matters rendering path and is removed immediately after the check.",
        aiBullets: JSON.stringify(["Fixture bullet one", "Fixture bullet two"]),
        aiEntities: JSON.stringify([{ name: "Fixture Entity", type: "ORGANISATION" }]),
        aiProvider: "verification",
        aiModel: "fixture",
        aiEnrichedAt: new Date(),
      },
    });
    console.log(story.slug);
  } else {
    await prisma.story.update({
      where: { id: story.id },
      data: {
        aiStatus: "PENDING",
        aiSummary: null,
        aiWhyItMatters: null,
        aiBullets: null,
        aiEntities: null,
        aiProvider: null,
        aiModel: null,
        aiEnrichedAt: null,
      },
    });
    console.log("reverted");
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
