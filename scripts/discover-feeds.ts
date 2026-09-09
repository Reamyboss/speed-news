/**
 * Finds the real feed endpoint for sources whose configured URL stopped working.
 *
 *   npx tsx scripts/discover-feeds.ts              # all BROKEN/PENDING sources
 *   npx tsx scripts/discover-feeds.ts --slugs cbn,ncc
 *   npx tsx scripts/discover-feeds.ts --apply      # write what it finds
 *
 * Two legitimate discovery methods, in order:
 *
 *   1. RSS autodiscovery — fetch the site's own homepage and read the
 *      <link rel="alternate" type="application/rss+xml"> tag it publishes.
 *      This is the mechanism publishers use to advertise their feed; it is the
 *      correct answer when it exists.
 *   2. A short list of conventional paths (/rss, /feed/rss, ?feed=rss2 ...)
 *      for sites that serve a feed without advertising it.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: it never varies the user agent, retries
 * past a refusal, or otherwise works around an access control. A 403 is the
 * publisher declining, and the answer to that is a licensing conversation, not
 * a workaround — such sources are reported as NEEDS_PERMISSION and left alone.
 */
import { prisma } from "../src/lib/db";
import { fetchFeed, parseFeed } from "../src/lib/feed";

const apply = process.argv.includes("--apply");
const slugArg = process.argv.find((a) => a.startsWith("--slugs="))?.split("=")[1];
const onlySlugs = slugArg ? slugArg.split(",").map((s) => s.trim()) : null;

/** Conventional feed paths, most-likely first. */
const CANDIDATE_PATHS = [
  "/feed/",
  "/feed",
  "/rss",
  "/rss/",
  "/rss.xml",
  "/feed.xml",
  "/atom.xml",
  "/index.xml",
  "/?feed=rss2",
  "/feed/rss/",
  "/news/feed/",
  "/news/rss",
  "/blog/feed/",
  "/category/news/feed/",
  "/en/rss",
  "/rss/news",
];

type Verdict =
  | { kind: "ok"; url: string; items: number; sample: string }
  | { kind: "needs_permission"; detail: string }
  | { kind: "rate_limited"; detail: string }
  | { kind: "dead"; detail: string };

/**
 * Feeds that resolve but are not what the registry entry is for. Found by
 * reading the sample headlines the probe prints — a feed that parses is not
 * automatically a feed worth ingesting.
 */
const REJECT: Record<string, string> = {
  afp: "afp.com/rss.xml is AFP's French-language corporate newsroom, not an English wire feed",
};

/** Reads the feed URL a page advertises in its own <head>. */
function autodiscover(html: string, baseUrl: string): string[] {
  const found: string[] = [];
  const linkTag = /<link\b[^>]*>/gi;
  for (const tag of html.match(linkTag) ?? []) {
    if (!/rel\s*=\s*["']?alternate/i.test(tag)) continue;
    if (!/type\s*=\s*["']?application\/(rss|atom)\+xml/i.test(tag)) continue;
    const href = tag.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    try {
      found.push(new URL(href, baseUrl).toString());
    } catch {
      /* malformed href in someone else's markup is not our problem */
    }
  }
  return found;
}

async function tryFeed(url: string): Promise<{ items: number; sample: string } | null> {
  try {
    const body = await fetchFeed(url, { timeoutMs: 12_000 });
    const parsed = parseFeed(body);
    if (!parsed.items.length) return null;
    return { items: parsed.items.length, sample: parsed.items[0]?.title?.slice(0, 68) ?? "" };
  } catch {
    return null;
  }
}

async function probe(source: { slug: string; url: string; rssUrl: string | null }): Promise<Verdict> {
  const origin = (() => {
    try {
      return new URL(source.url).origin;
    } catch {
      return null;
    }
  })();
  if (!origin) return { kind: "dead", detail: "unparseable site url" };

  // 1. Ask the site what its feed is.
  let homepage = "";
  try {
    homepage = await fetchFeed(origin, { timeoutMs: 12_000 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // A refusal at the front door applies to the whole site. Stop here.
    //
    // 429 is "not now", not "no": the site is reachable and we are simply
    // being paced. That is a backoff problem, not a licensing one, so it is
    // reported separately and the source is left active.
    if (/\b429\b/.test(message)) {
      return { kind: "rate_limited", detail: `homepage ${message}` };
    }
    if (/\b40[13]\b/.test(message)) {
      return { kind: "needs_permission", detail: `homepage ${message}` };
    }
  }

  const advertised = homepage ? autodiscover(homepage, origin) : [];
  for (const url of advertised) {
    if (url === source.rssUrl) continue; // already known broken
    const hit = await tryFeed(url);
    if (hit) return { kind: "ok", url, ...hit };
  }

  // 2. Conventional paths.
  for (const path of CANDIDATE_PATHS) {
    const url = `${origin}${path}`;
    if (url === source.rssUrl) continue;
    const hit = await tryFeed(url);
    if (hit) return { kind: "ok", url, ...hit };
  }

  return {
    kind: "dead",
    detail: advertised.length ? "advertised feed did not parse" : "no feed advertised or found",
  };
}

async function main() {
  const sources = await prisma.source.findMany({
    where: onlySlugs ? { slug: { in: onlySlugs } } : { status: { in: ["BROKEN", "PENDING"] } },
    select: { id: true, slug: true, name: true, url: true, rssUrl: true, status: true, trustTier: true },
    orderBy: [{ trustTier: "asc" }, { slug: "asc" }],
  });

  console.log(`probing ${sources.length} sources...\n`);
  const recovered: Array<{ slug: string; url: string; items: number }> = [];
  const blocked: string[] = [];
  const rateLimited: string[] = [];
  const rejected: string[] = [];
  const dead: string[] = [];

  // Sequential on purpose: this hits other people's servers, and a burst of
  // parallel requests to a struggling government site is exactly the behaviour
  // that earns a permanent block.
  for (const source of sources) {
    const verdict = await probe(source);
    if (verdict.kind === "ok" && REJECT[source.slug]) {
      console.log(`  REJECTED   ${source.slug.padEnd(22)} ${REJECT[source.slug]}`);
      rejected.push(source.slug);
    } else if (verdict.kind === "ok") {
      console.log(`  FOUND      ${source.slug.padEnd(22)} ${verdict.url}`);
      console.log(`             ${verdict.items} items — "${verdict.sample}"`);
      recovered.push({ slug: source.slug, url: verdict.url, items: verdict.items });
    } else if (verdict.kind === "needs_permission") {
      console.log(`  BLOCKED    ${source.slug.padEnd(22)} ${verdict.detail}`);
      blocked.push(source.slug);
    } else if (verdict.kind === "rate_limited") {
      console.log(`  RATELIMIT  ${source.slug.padEnd(22)} ${verdict.detail}`);
      rateLimited.push(source.slug);
    } else {
      console.log(`  DEAD       ${source.slug.padEnd(22)} ${verdict.detail}`);
      dead.push(source.slug);
    }
  }

  console.log(
    `\nrecovered: ${recovered.length}   rejected: ${rejected.length}   ` +
      `blocked: ${blocked.length}   rate-limited: ${rateLimited.length}   dead: ${dead.length}`,
  );

  if (!apply) {
    console.log("\n(dry run — pass --apply to write these feed URLs and reactivate)");
    return;
  }

  for (const row of recovered) {
    await prisma.source.update({
      where: { slug: row.slug },
      data: { rssUrl: row.url, status: "ACTIVE", consecutiveFailures: 0, lastError: null },
    });
  }
  // A source we are not permitted to fetch is not broken, it is paused pending
  // a licensing conversation. Recording that distinction stops the pipeline
  // retrying it forever and keeps the registry honest about why it is absent.
  for (const slug of blocked) {
    await prisma.source.update({
      where: { slug },
      data: { status: "PAUSED", lastError: "Access declined by publisher — requires permission or licensing" },
    });
  }
  // Rate limiting is transient. Clear the failure counter so the pipeline
  // retries on its normal schedule instead of counting down to BROKEN.
  for (const slug of rateLimited) {
    await prisma.source.update({
      where: { slug },
      data: { consecutiveFailures: 0, lastError: "Rate limited upstream — will retry on schedule" },
    });
  }
  // A feed that resolves but is the wrong content is not a win. Record why,
  // so nobody re-discovers it in three months and switches it on.
  for (const slug of rejected) {
    await prisma.source.update({
      where: { slug },
      data: { status: "PENDING", lastError: `Discovered feed rejected: ${REJECT[slug]}` },
    });
  }
  console.log(
    `\napplied: ${recovered.length} reactivated, ${blocked.length} paused pending permission, ` +
      `${rateLimited.length} reset for retry, ${rejected.length} rejected`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
