import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ingestSource, runIngest } from "@/lib/ingest";
import { enrichPendingStories } from "@/lib/ai/enrich";
import { setAiProvider } from "@/lib/ai";
import { NullProvider } from "@/lib/ai/null-provider";
import type { AiProvider } from "@/lib/ai/types";
import { sourceSeedSchema } from "@/lib/validation";
import { SOURCE_SEED } from "@/data/sources";

/**
 * STORY CREATION, SOURCE ATTRIBUTION and AI FAILURE HANDLING — end to end
 * against a real database.
 *
 * A local HTTP server serves controlled feed XML, so the whole
 * fetch -> normalise -> dedupe -> classify -> cluster -> store path runs
 * exactly as it does in production, without depending on the live web.
 */

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// A tiny feed server
// ---------------------------------------------------------------------------

import { createServer, type Server } from "node:http";

let server: Server;
let baseUrl: string;
const routes = new Map<string, { status: number; body: string }>();

async function startServer(): Promise<void> {
  server = createServer((req, res) => {
    const route = routes.get(req.url ?? "");
    if (!route) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
      return;
    }
    res.writeHead(route.status, { "content-type": "application/rss+xml" });
    res.end(route.body);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address && typeof address === "object") {
    baseUrl = `http://127.0.0.1:${address.port}`;
  }
}

function rssFeed(items: Array<{ title: string; link: string; description?: string; date?: string }>) {
  const entries = items
    .map(
      (item) => `    <item>
      <title><![CDATA[${item.title}]]></title>
      <link>${item.link}</link>
      <description><![CDATA[${item.description ?? "Body text for the story."}]]></description>
      <pubDate>${item.date ?? new Date().toUTCString()}</pubDate>
    </item>`,
    )
    .join("\n");

  return `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Test Feed</title><link>https://test.example</link>
${entries}
</channel></rss>`;
}

async function makeSource(overrides: Partial<{ slug: string; name: string; feedPath: string; type: string; trustTier: number; weight: number; categories: string }> = {}) {
  const slug = overrides.slug ?? "test-source";
  const feedPath = overrides.feedPath ?? "/feed.xml";

  return prisma.source.create({
    data: {
      name: overrides.name ?? "Test Source",
      slug,
      type: overrides.type ?? "PROFESSIONAL_MEDIA",
      country: "NG",
      region: "ng",
      language: "en",
      categories: overrides.categories ?? "nigeria,politics",
      url: "https://test.example",
      rssUrl: `${baseUrl}${feedPath}`,
      trustTier: overrides.trustTier ?? 2,
      status: "ACTIVE",
      license: "RSS_SUMMARY",
      weight: overrides.weight ?? 70,
    },
  });
}

await startServer();

beforeEach(async () => {
  routes.clear();
  setAiProvider(null);
  // Order matters: stories reference sources and clusters.
  await prisma.story.deleteMany();
  await prisma.storyCluster.deleteMany();
  await prisma.source.deleteMany();
  await prisma.ingestRun.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

// ---------------------------------------------------------------------------

describe("story creation", () => {
  it("creates stories from a feed with all required fields populated", async () => {
    routes.set(
      "/feed.xml",
      {
        status: 200,
        body: rssFeed([
          {
            title: "CBN holds benchmark interest rate at 27.5 per cent",
            link: "https://test.example/cbn-holds-rate",
            description: "The Monetary Policy Committee voted to hold the rate.",
          },
        ]),
      },
    );

    const source = await makeSource();
    const { result } = await ingestSource(source, [], { skipRunRecord: true });

    expect(result.ok).toBe(true);
    expect(result.itemsCreated).toBe(1);

    const story = await prisma.story.findFirstOrThrow({ include: { source: true } });

    expect(story.headline).toBe("CBN holds benchmark interest rate at 27.5 per cent");
    expect(story.slug).toMatch(/^cbn-holds-benchmark-interest-rate/);
    expect(story.canonicalUrl).toBe("https://test.example/cbn-holds-rate");
    expect(story.status).toBe("PUBLISHED");
    expect(story.summary.length).toBeGreaterThan(0);
    expect(story.urlHash).toMatch(/^[0-9a-f]{64}$/);
    expect(story.simhash).toMatch(/^[0-9a-f]{16}$/);
    expect(story.clusterId).toBeTruthy();
    expect(story.searchText).toContain("cbn");
    // Enrichment has not run yet — the story is live regardless.
    expect(story.aiStatus).toBe("PENDING");
    expect(story.aiSummary).toBeNull();
  });

  it("assigns a category from the controlled vocabulary", async () => {
    routes.set("/feed.xml", {
      status: 200,
      body: rssFeed([
        {
          title: "Super Eagles name 23-man squad for AFCON qualifier",
          link: "https://test.example/eagles-squad",
          description: "The coach named his squad for the qualifier against Benin.",
        },
      ]),
    });

    const source = await makeSource({ categories: "nigeria,sports" });
    await ingestSource(source, [], { skipRunRecord: true });

    const story = await prisma.story.findFirstOrThrow();
    expect(story.category).toBe("sports");
    expect(story.region).toBe("ng");
  });

  it("skips items that are not publishable without failing the source", async () => {
    routes.set("/feed.xml", {
      status: 200,
      body: rssFeed([
        { title: "Hi", link: "https://test.example/too-short" },
        {
          title: "A perfectly valid headline about Lagos road works",
          link: "https://test.example/valid",
        },
      ]),
    });

    const source = await makeSource();
    const { result } = await ingestSource(source, [], { skipRunRecord: true });

    expect(result.ok).toBe(true);
    expect(result.itemsCreated).toBe(1);
    expect(await prisma.story.count()).toBe(1);
  });
});

describe("source attribution", () => {
  it("links every story to exactly one source and preserves its identity", async () => {
    routes.set("/feed.xml", {
      status: 200,
      body: rssFeed([
        {
          title: "Lagos announces new road expansion project for Ikorodu",
          link: "https://test.example/lagos-roads",
        },
      ]),
    });

    const source = await makeSource({ name: "Premium Times", slug: "premium-times-test" });
    await ingestSource(source, [], { skipRunRecord: true });

    const story = await prisma.story.findFirstOrThrow({ include: { source: true } });

    expect(story.sourceId).toBe(source.id);
    expect(story.source.name).toBe("Premium Times");
    expect(story.source.trustTier).toBe(2);
    // The link out must survive normalisation intact.
    expect(story.canonicalUrl).toBe("https://test.example/lagos-roads");
  });

  it("credits the image to the source when one is present", async () => {
    routes.set("/feed.xml", {
      status: 200,
      body: `<?xml version="1.0"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel>
<title>T</title><link>https://test.example</link>
<item>
  <title>Flooding displaces hundreds of residents in Bayelsa communities</title>
  <link>https://test.example/flood</link>
  <description>Heavy rain caused widespread flooding.</description>
  <pubDate>${new Date().toUTCString()}</pubDate>
  <media:content url="https://cdn.test.example/flood.jpg" medium="image" />
</item>
</channel></rss>`,
    });

    const source = await makeSource({ name: "Daily Trust" });
    await ingestSource(source, [], { skipRunRecord: true });

    const story = await prisma.story.findFirstOrThrow();
    expect(story.imageUrl).toBe("https://cdn.test.example/flood.jpg");
    expect(story.imageCredit).toBe("Daily Trust");
  });

  it("cascades story deletion when a source is removed", async () => {
    routes.set("/feed.xml", {
      status: 200,
      body: rssFeed([
        { title: "A story that will be removed with its source", link: "https://test.example/x" },
      ]),
    });

    const source = await makeSource();
    await ingestSource(source, [], { skipRunRecord: true });
    expect(await prisma.story.count()).toBe(1);

    await prisma.source.delete({ where: { id: source.id } });
    // An orphaned story could never be attributed, so it must not survive.
    expect(await prisma.story.count()).toBe(0);
  });
});

describe("deduplication in the real pipeline", () => {
  it("does not create the same story twice across runs", async () => {
    const feed = rssFeed([
      {
        title: "NNPC announces petrol price adjustment across filling stations",
        link: "https://test.example/nnpc-price",
      },
    ]);
    routes.set("/feed.xml", { status: 200, body: feed });

    const source = await makeSource();

    const first = await ingestSource(source, [], { skipRunRecord: true });
    expect(first.result.itemsCreated).toBe(1);

    const candidates = await prisma.story.findMany({
      select: {
        id: true,
        sourceId: true,
        headline: true,
        urlHash: true,
        titleKey: true,
        simhash: true,
        publishedAt: true,
        clusterId: true,
      },
    });

    const second = await ingestSource(source, candidates, { skipRunRecord: true });
    expect(second.result.itemsCreated).toBe(0);
    expect(second.result.itemsDuplicate).toBe(1);
    expect(await prisma.story.count()).toBe(1);
  });

  it("keeps both stories when two sources report the same event, and clusters them", async () => {
    const headline = "Fuel scarcity worsens in Abuja as filling stations shut down";

    routes.set("/a.xml", {
      status: 200,
      body: rssFeed([{ title: headline, link: "https://a.example/fuel" }]),
    });
    routes.set("/b.xml", {
      status: 200,
      body: rssFeed([{ title: headline, link: "https://b.example/fuel" }]),
    });

    const sourceA = await makeSource({ slug: "source-a", name: "Source A", feedPath: "/a.xml" });
    const sourceB = await makeSource({ slug: "source-b", name: "Source B", feedPath: "/b.xml" });

    await ingestSource(sourceA, [], { skipRunRecord: true });
    const candidates = await prisma.story.findMany({
      select: {
        id: true,
        sourceId: true,
        headline: true,
        urlHash: true,
        titleKey: true,
        simhash: true,
        publishedAt: true,
        clusterId: true,
      },
    });
    await ingestSource(sourceB, candidates, { skipRunRecord: true });

    const stories = await prisma.story.findMany({ include: { source: true } });

    // Both must survive — corroboration is the product, not noise.
    expect(stories).toHaveLength(2);
    expect(new Set(stories.map((s) => s.source.name))).toEqual(new Set(["Source A", "Source B"]));

    // ...and they must be linked as one event.
    expect(stories[0].clusterId).toBe(stories[1].clusterId);

    const cluster = await prisma.storyCluster.findFirstOrThrow();
    expect(cluster.storyCount).toBe(2);
    expect(cluster.sourceCount).toBe(2);
  });
});

describe("source health tracking", () => {
  it("records the error and increments the failure count on a bad feed", async () => {
    routes.set("/feed.xml", { status: 500, body: "server error" });

    const source = await makeSource();
    const { result } = await ingestSource(source, [], { skipRunRecord: true });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("500");

    const updated = await prisma.source.findUniqueOrThrow({ where: { id: source.id } });
    expect(updated.consecutiveFailures).toBe(1);
    expect(updated.lastError).toContain("500");
    expect(updated.lastErrorAt).not.toBeNull();
  });

  it("does not fail the run when a feed is unreachable", async () => {
    const source = await makeSource({ feedPath: "/missing.xml" });
    await expect(ingestSource(source, [], { skipRunRecord: true })).resolves.toBeDefined();
    expect(await prisma.story.count()).toBe(0);
  });

  it("reinstates a BROKEN source that starts working again", async () => {
    routes.set("/feed.xml", {
      status: 200,
      body: rssFeed([
        { title: "The feed is working again after an outage", link: "https://test.example/ok" },
      ]),
    });

    const source = await makeSource();
    await prisma.source.update({
      where: { id: source.id },
      data: { status: "BROKEN", consecutiveFailures: 7, lastError: "old failure" },
    });

    const reloaded = await prisma.source.findUniqueOrThrow({ where: { id: source.id } });
    await ingestSource(reloaded, [], { skipRunRecord: true });

    const updated = await prisma.source.findUniqueOrThrow({ where: { id: source.id } });
    expect(updated.status).toBe("ACTIVE");
    expect(updated.consecutiveFailures).toBe(0);
    expect(updated.lastError).toBeNull();
  });
});

describe("AI enrichment failure handling", () => {
  async function seedOneStory() {
    routes.set("/feed.xml", {
      status: 200,
      body: rssFeed([
        {
          title: "Federal Government approves new minimum wage implementation timeline",
          link: "https://test.example/wage",
          description: "The government set out how the new wage will be implemented.",
        },
      ]),
    });
    const source = await makeSource();
    await ingestSource(source, [], { skipRunRecord: true });
    return prisma.story.findFirstOrThrow();
  }

  it("marks stories SKIPPED when no provider is available, and leaves them readable", async () => {
    const before = await seedOneStory();
    setAiProvider(new NullProvider("AI_PROVIDER=none"));

    const summary = await enrichPendingStories();
    expect(summary.provider).toBe("none");
    expect(summary.skipped).toBeGreaterThan(0);

    const after = await prisma.story.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.aiStatus).toBe("SKIPPED");
    expect(after.aiSummary).toBeNull();
    expect(after.aiWhyItMatters).toBeNull();
    // The story itself is untouched and still fully renderable.
    expect(after.status).toBe("PUBLISHED");
    expect(after.summary).toBe(before.summary);
    expect(after.headline).toBe(before.headline);
  });

  it("keeps a story readable when the provider errors", async () => {
    const before = await seedOneStory();

    const failing: AiProvider = {
      name: "failing",
      model: "m",
      isAvailable: true,
      enrich: async () => ({
        ok: false,
        provider: "failing",
        model: "m",
        error: "upstream 503",
        retryable: true,
      }),
    };
    setAiProvider(failing);

    const summary = await enrichPendingStories();
    expect(summary.failed).toBe(1);
    expect(summary.succeeded).toBe(0);

    const after = await prisma.story.findUniqueOrThrow({ where: { id: before.id } });
    // Retryable, so it stays queued for a later pass.
    expect(after.aiStatus).toBe("FAILED");
    expect(after.aiError).toContain("503");
    expect(after.summary).toBe(before.summary);
    expect(after.status).toBe("PUBLISHED");
  });

  it("does not requeue a terminal failure", async () => {
    await seedOneStory();

    setAiProvider({
      name: "failing",
      model: "m",
      isAvailable: true,
      enrich: async () => ({
        ok: false,
        provider: "failing",
        model: "m",
        error: "auth failed",
        retryable: false,
      }),
    });

    await enrichPendingStories();
    const after = await prisma.story.findFirstOrThrow();
    expect(after.aiStatus).toBe("SKIPPED");
  });

  it("writes enrichment through when the provider succeeds", async () => {
    const before = await seedOneStory();

    setAiProvider({
      name: "stub",
      model: "stub-1",
      isAvailable: true,
      enrich: async () => ({
        ok: true,
        provider: "stub",
        model: "stub-1",
        data: {
          summary: "The government approved a timeline for the new minimum wage.",
          whyItMatters: "It sets when workers can expect the increase to reach them.",
          bullets: ["Timeline approved", "Implementation to follow"],
          entities: [{ name: "Federal Government", type: "ORGANISATION" as const }],
        },
      }),
    });

    const summary = await enrichPendingStories();
    expect(summary.succeeded).toBe(1);

    const after = await prisma.story.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.aiStatus).toBe("OK");
    expect(after.aiSummary).toContain("minimum wage");
    expect(after.aiWhyItMatters).toContain("workers");
    expect(JSON.parse(after.aiBullets!)).toHaveLength(2);
    expect(after.aiProvider).toBe("stub");
    expect(after.aiEnrichedAt).not.toBeNull();
    // The publisher-derived summary is preserved alongside the AI one.
    expect(after.summary).toBe(before.summary);
  });
});

describe("the shipped source registry", () => {
  it("every seeded source passes validation", () => {
    for (const seed of SOURCE_SEED) {
      const parsed = sourceSeedSchema.safeParse(seed);
      if (!parsed.success) {
        throw new Error(`${seed.slug}: ${parsed.error.issues[0]?.message}`);
      }
      expect(parsed.success).toBe(true);
    }
  });

  it("has unique slugs", () => {
    const slugs = SOURCE_SEED.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("covers every source category the product promises", () => {
    const types = new Set(SOURCE_SEED.map((s) => s.type));
    for (const required of [
      "PRIMARY_OFFICIAL",
      "PROFESSIONAL_MEDIA",
      "SPECIALIST_MEDIA",
      "DIGITAL_PUBLISHER",
      "INTERNATIONAL_MEDIA",
      "BROADCAST",
      "RADIO",
    ]) {
      expect(types).toContain(required);
    }
  });

  it("assigns official and wire sources the highest confidence tier", () => {
    const official = SOURCE_SEED.filter((s) => s.type === "PRIMARY_OFFICIAL");
    expect(official.length).toBeGreaterThan(0);
    for (const source of official) expect(source.trustTier).toBe(1);
  });
});

describe("broken-source recovery", () => {
  it("re-tests a BROKEN source once its backoff has elapsed, and reinstates it", async () => {
    routes.set("/feed.xml", {
      status: 200,
      body: rssFeed([
        {
          title: "The publisher fixed their feed and it works again now",
          link: "https://test.example/recovered",
        },
      ]),
    });

    const source = await makeSource();
    // Simulate a source that failed out of the rotation some time ago.
    await prisma.source.update({
      where: { id: source.id },
      data: {
        status: "BROKEN",
        consecutiveFailures: 6,
        lastError: "HTTP 500",
        lastCheckedAt: new Date(Date.now() - 24 * 3_600_000),
      },
    });

    const summary = await runIngest({ skipRunRecord: true });

    // BROKEN must not be a one-way door — the source has to be picked up.
    expect(summary.sourcesAttempted).toBeGreaterThan(0);

    const updated = await prisma.source.findUniqueOrThrow({ where: { id: source.id } });
    expect(updated.status).toBe("ACTIVE");
    expect(updated.consecutiveFailures).toBe(0);
    expect(await prisma.story.count()).toBe(1);
  });

  it("does not re-test a BROKEN source that was just checked", async () => {
    const source = await makeSource();
    await prisma.source.update({
      where: { id: source.id },
      data: {
        status: "BROKEN",
        consecutiveFailures: 6,
        lastCheckedAt: new Date(),
      },
    });

    const summary = await runIngest({ skipRunRecord: true });
    expect(summary.sourcesAttempted).toBe(0);
  });
});
