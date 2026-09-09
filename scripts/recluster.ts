/**
 * Rebuilds story clusters across the whole corpus.
 *
 * Clustering happens at ingest, comparing each new item against a recent
 * window. That is right for steady-state operation but means stories already
 * stored keep whatever grouping the thresholds produced on the day they
 * arrived. After retuning `src/lib/dedupe.ts` this script replays the same
 * decision over existing rows so the archive reflects the current rule.
 *
 *   npx tsx scripts/recluster.ts --dry     inspect without writing
 *   npx tsx scripts/recluster.ts           apply
 *
 * The clustering rule itself is imported, never reimplemented here — if this
 * file drifted from `findCluster`, the measurement would be a lie.
 */
import { prisma } from "../src/lib/db";
import {
  CLUSTER_WINDOW_HOURS,
  buildIdfModel,
  clusterKey,
  findCluster,
  type CandidateStory,
} from "../src/lib/dedupe";

const dryRun = process.argv.includes("--dry");

async function main() {
  const stories = await prisma.story.findMany({
    select: {
      id: true,
      sourceId: true,
      headline: true,
      urlHash: true,
      titleKey: true,
      simhash: true,
      publishedAt: true,
      clusterId: true,
      category: true,
    },
    // Oldest first, so each story clusters against what genuinely preceded it.
    orderBy: { publishedAt: "asc" },
  });

  if (stories.length === 0) {
    console.log("no stories to cluster");
    return;
  }

  const idf = buildIdfModel(stories.map((story) => story.headline));
  console.log(`replaying ${stories.length} stories through the current clustering rule...`);

  // clusterKey -> synthetic cluster id, and the members assigned to it.
  const members = new Map<string, string[]>();
  const assignment = new Map<string, string>();
  const processed: CandidateStory[] = [];
  let nextId = 0;

  for (const story of stories) {
    const windowStart = story.publishedAt.getTime() - CLUSTER_WINDOW_HOURS * 3_600_000;
    const candidates = processed.filter((c) => c.publishedAt.getTime() >= windowStart);

    const match = findCluster(
      {
        headline: story.headline,
        publishedAt: story.publishedAt,
        fingerprint: {
          urlHash: story.urlHash,
          titleKey: story.titleKey,
          simhash: story.simhash,
        },
      },
      candidates,
      idf,
    );

    const clusterId = match ? match.clusterId : `c${nextId++}`;
    assignment.set(story.id, clusterId);
    members.set(clusterId, [...(members.get(clusterId) ?? []), story.id]);
    processed.push({ ...story, clusterId });
  }

  const byId = new Map(stories.map((s) => [s.id, s]));
  const multi: Array<{ id: string; ids: string[]; sources: number }> = [];
  for (const [id, ids] of members) {
    const sources = new Set(ids.map((sid) => byId.get(sid)!.sourceId));
    if (sources.size > 1) multi.push({ id, ids, sources: sources.size });
  }
  multi.sort((a, b) => b.sources - a.sources);

  console.log(`\nclusters:              ${members.size}`);
  console.log(`multi-source clusters: ${multi.length}`);
  console.log(`stories corroborated:  ${multi.reduce((n, c) => n + c.ids.length, 0)}`);

  console.log("\nlargest multi-source clusters:");
  for (const cluster of multi.slice(0, Number(process.env.SHOW ?? 12))) {
    const lead = byId.get(cluster.ids[0])!;
    console.log(`  ${cluster.sources} sources / ${cluster.ids.length} stories — ${lead.headline.slice(0, 70)}`);
    for (const sid of cluster.ids.slice(0, 6)) {
      console.log(`      · ${byId.get(sid)!.headline.slice(0, 76)}`);
    }
  }

  if (dryRun) {
    console.log("\n--dry: nothing written");
    return;
  }

  // Write: one StoryCluster row per group, then point stories at it. Keyed off
  // the earliest member so the key stays stable if this is re-run.
  console.log("\nwriting...");
  await prisma.story.updateMany({ data: { clusterId: null } });
  await prisma.storyCluster.deleteMany({});

  let written = 0;
  for (const [, ids] of members) {
    const rows = ids.map((id) => byId.get(id)!);
    const lead = rows[0];
    const sources = new Set(rows.map((r) => r.sourceId));
    const created = await prisma.storyCluster.create({
      data: {
        // A cluster's identity is its lead headline, matching ingest.
        key: `${clusterKey(lead.headline)}-${lead.id.slice(0, 8)}`,
        title: lead.headline,
        category: lead.category,
        storyCount: rows.length,
        sourceCount: sources.size,
        firstSeenAt: rows[0].publishedAt,
        lastStoryAt: rows[rows.length - 1].publishedAt,
      },
      select: { id: true },
    });
    await prisma.story.updateMany({
      where: { id: { in: ids } },
      data: { clusterId: created.id },
    });
    written += 1;
  }
  console.log(`wrote ${written} clusters`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
