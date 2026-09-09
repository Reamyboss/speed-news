import { prisma } from "../src/lib/db";
prisma.story
  .findFirst({ orderBy: { importance: "desc" }, select: { slug: true } })
  .then((s) => { process.stdout.write(s?.slug ?? ""); })
  .finally(() => prisma.$disconnect());
