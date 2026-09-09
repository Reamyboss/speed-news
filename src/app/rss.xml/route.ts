import { prisma, safeQuery } from "@/lib/db";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/env";
import { toSingleLine, truncate } from "@/lib/text";

/**
 * Our own RSS feed.
 *
 * Publishing a feed is table stakes for a news site, and it closes the loop on
 * the source strategy: we consume feeds, so we offer one. Each item carries
 * our summary plus explicit attribution to the originating newsroom.
 */
export const revalidate = 600;

/** Escapes text for XML. Feed content is external data — never trust it raw. */
function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // Strip control characters. XML 1.0 permits only tab, LF and CR below
    // 0x20, and a raw control byte from a feed would make the document
    // unparseable for every reader that consumes it.
    .split("")
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code > 31 || code === 9 || code === 10 || code === 13;
    })
    .join("");
}

export async function GET() {
  const stories = await safeQuery(
    () =>
      prisma.story.findMany({
        where: { status: "PUBLISHED" },
        orderBy: { publishedAt: "desc" },
        take: 60,
        select: {
          headline: true,
          slug: true,
          summary: true,
          aiSummary: true,
          publishedAt: true,
          category: true,
          canonicalUrl: true,
          source: { select: { name: true } },
        },
      }),
    [],
    "rss",
  );

  const items = stories
    .map((story) => {
      const link = absoluteUrl(`/story/${story.slug}`);
      const description = truncate(
        toSingleLine(story.aiSummary ?? story.summary),
        400,
      );

      return `    <item>
      <title>${xmlEscape(story.headline)}</title>
      <link>${xmlEscape(link)}</link>
      <guid isPermaLink="true">${xmlEscape(link)}</guid>
      <pubDate>${story.publishedAt.toUTCString()}</pubDate>
      <category>${xmlEscape(story.category)}</category>
      <source url="${xmlEscape(story.canonicalUrl)}">${xmlEscape(story.source.name)}</source>
      <description>${xmlEscape(`${description} (Reported by ${story.source.name})`)}</description>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xmlEscape(SITE_NAME)}</title>
    <link>${xmlEscape(SITE_URL)}</link>
    <description>${xmlEscape(SITE_DESCRIPTION)}</description>
    <language>en-NG</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${xmlEscape(absoluteUrl("/rss.xml"))}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=600, s-maxage=600, stale-while-revalidate=3600",
    },
  });
}
