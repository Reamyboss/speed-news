import { prisma } from "../src/lib/db";
async function main() {
  const [stories, clusters, multi, active, paused, broken, pending] = await Promise.all([
    prisma.story.count(),
    prisma.storyCluster.count(),
    prisma.storyCluster.count({ where: { sourceCount: { gt: 1 } } }),
    prisma.source.count({ where: { status: "ACTIVE" } }),
    prisma.source.count({ where: { status: "PAUSED" } }),
    prisma.source.count({ where: { status: "BROKEN" } }),
    prisma.source.count({ where: { status: "PENDING" } }),
  ]);
  console.log(`stories=${stories} clusters=${clusters} multiSource=${multi}`);
  console.log(`sources: ACTIVE=${active} PAUSED=${paused} BROKEN=${broken} PENDING=${pending}`);
}
main().finally(() => prisma.$disconnect());
