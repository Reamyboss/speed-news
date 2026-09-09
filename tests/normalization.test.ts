import { describe, expect, it } from "vitest";
import {
  decodeEntities,
  extractiveSummary,
  hammingDistance,
  htmlToText,
  normalizeUrl,
  simhash,
  slugify,
  titleKey,
  tokenSimilarity,
  truncate,
  uniqueSlug,
  urlHash,
} from "@/lib/text";
import {
  MAX_EXCERPT_CHARS,
  MAX_SUMMARY_CHARS,
  normalizeItem,
  parseFeed,
  sanitizeImageUrl,
  type RawFeedItem,
} from "@/lib/feed";

/**
 * SOURCE NORMALIZATION.
 *
 * Everything a feed hands us is untrusted: markup, tracking parameters, junk
 * dates, missing fields. These tests pin the behaviour that turns that into a
 * storable, safe story.
 */

describe("htmlToText — sanitisation", () => {
  it("drops script bodies entirely rather than leaking their text", () => {
    const input = '<p>Real news</p><script>alert("xss");window.x=1</script>';
    const output = htmlToText(input);
    expect(output).toContain("Real news");
    expect(output).not.toContain("alert");
    expect(output).not.toContain("xss");
    expect(output).not.toContain("window.x");
  });

  it("drops style, iframe, svg and noscript bodies", () => {
    const input =
      "<style>.a{color:red}</style><p>Body</p><iframe>frame text</iframe>" +
      "<svg><title>svgtitle</title></svg><noscript>nojs</noscript>";
    const output = htmlToText(input);
    expect(output).toContain("Body");
    expect(output).not.toContain("color:red");
    expect(output).not.toContain("frame text");
    expect(output).not.toContain("svgtitle");
    expect(output).not.toContain("nojs");
  });

  it("strips tags but keeps paragraph structure", () => {
    expect(htmlToText("<p>One</p><p>Two</p>")).toBe("One\nTwo");
    expect(htmlToText("Line<br/>Break")).toBe("Line\nBreak");
  });

  it("unwraps CDATA and decodes entities", () => {
    expect(htmlToText("<![CDATA[Tinubu &amp; Shettima]]>")).toBe("Tinubu & Shettima");
    expect(decodeEntities("&#8358;500 &ndash; &pound;2")).toBe("₦500 – £2");
  });

  it("removes WordPress feed boilerplate", () => {
    const input = "<p>Story body.</p><p>The post Some Headline appeared first on Punch.</p>";
    expect(htmlToText(input)).not.toContain("appeared first on");
  });

  it("survives malformed and empty input without throwing", () => {
    expect(htmlToText("<p>unclosed")).toBe("unclosed");
    expect(htmlToText("")).toBe("");
    expect(htmlToText(null)).toBe("");
    expect(htmlToText(undefined)).toBe("");
    expect(decodeEntities("&#xZZZZ; &notarealentity;")).toContain("&notarealentity;");
  });

  it("rejects out-of-range numeric entities instead of throwing", () => {
    expect(() => decodeEntities("&#1114112;")).not.toThrow();
    expect(decodeEntities("&#1114112;")).toBe("&#1114112;");
  });
});

describe("normalizeUrl — canonicalisation", () => {
  it("strips tracking parameters", () => {
    expect(normalizeUrl("https://punchng.com/story?utm_source=x&utm_medium=y&id=7")).toBe(
      "https://punchng.com/story?id=7",
    );
    expect(normalizeUrl("https://punchng.com/a?fbclid=abc")).toBe("https://punchng.com/a");
  });

  it("normalises scheme, www, trailing slash and fragment", () => {
    expect(normalizeUrl("http://www.Punchng.com/Story/#section")).toBe(
      "https://punchng.com/Story",
    );
  });

  it("collapses AMP variants to the canonical path", () => {
    expect(normalizeUrl("https://punchng.com/story/amp/")).toBe("https://punchng.com/story");
  });

  it("sorts query parameters so ordering cannot create a false duplicate", () => {
    expect(normalizeUrl("https://x.ng/a?b=2&a=1")).toBe(normalizeUrl("https://x.ng/a?a=1&b=2"));
  });

  it("refuses non-http(s) schemes — this is an injection guard", () => {
    expect(normalizeUrl("javascript:alert(1)")).toBe("");
    expect(normalizeUrl("data:text/html,<script>x</script>")).toBe("");
    expect(normalizeUrl("file:///etc/passwd")).toBe("");
  });

  it("produces a stable hash for equivalent URLs", () => {
    expect(urlHash("https://x.ng/a?utm_source=q")).toBe(urlHash("http://www.x.ng/a/"));
  });
});

describe("slugify", () => {
  it("produces clean, URL-safe slugs", () => {
    expect(slugify("Tinubu's N50bn Budget — What Next?")).toBe(
      "tinubus-n50bn-budget-what-next",
    );
  });

  it("strips diacritics found in Nigerian names", () => {
    expect(slugify("Adéwálé Àjàdí")).toBe("adewale-ajadi");
  });

  it("never emits leading, trailing or doubled hyphens", () => {
    const slug = slugify("!!! Hello --- World !!!");
    expect(slug).toBe("hello-world");
  });

  it("generates deterministic unique slugs", () => {
    const a = uniqueSlug("Same Headline Here", "seed-one");
    const b = uniqueSlug("Same Headline Here", "seed-two");
    expect(a).not.toBe(b);
    expect(uniqueSlug("Same Headline Here", "seed-one")).toBe(a);
  });
});

describe("truncate and extractiveSummary", () => {
  it("truncates on a word boundary", () => {
    const out = truncate("the quick brown fox jumps over the lazy dog", 20);
    expect(out.length).toBeLessThanOrEqual(21);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toContain("qui…");
  });

  it("leaves short text untouched", () => {
    expect(truncate("short", 100)).toBe("short");
  });

  it("prefers whole sentences when summarising", () => {
    const text = "First sentence here. Second sentence follows. Third one is extra.";
    const summary = extractiveSummary(text, 45);
    expect(summary.endsWith(".")).toBe(true);
    expect(summary.length).toBeLessThanOrEqual(45);
  });
});

describe("fingerprints", () => {
  it("gives the same title key to reworded headlines with the same core", () => {
    expect(titleKey("Tinubu signs the 2026 budget into law")).toBe(
      titleKey("The 2026 budget signs into law, Tinubu"),
    );
  });

  it("gives different keys to genuinely different stories", () => {
    expect(titleKey("CBN raises interest rate to 27 per cent")).not.toBe(
      titleKey("Super Eagles beat Ghana in Accra friendly"),
    );
  });

  it("produces a 16-character hex simhash", () => {
    const hash = simhash("Nigeria wins the Africa Cup of Nations");
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("scores near-identical text as close and unrelated text as far", () => {
    const a = simhash("CBN raises benchmark interest rate to 27 per cent");
    const b = simhash("CBN raises benchmark interest rate to 27 percent");
    const c = simhash("Burna Boy announces new album and world tour dates");
    expect(hammingDistance(a, b)).toBeLessThan(hammingDistance(a, c));
  });

  it("treats a malformed simhash as maximally distant rather than throwing", () => {
    expect(hammingDistance("abc", "")).toBe(64);
  });

  it("computes token similarity between 0 and 1", () => {
    const same = tokenSimilarity("naira falls against dollar", "naira falls against dollar");
    const none = tokenSimilarity("naira falls against dollar", "arsenal sign new striker");
    expect(same).toBe(1);
    expect(none).toBe(0);
  });
});

describe("parseFeed", () => {
  const RSS = `<?xml version="1.0"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Test Wire</title>
    <link>https://example.ng</link>
    <item>
      <title><![CDATA[CBN holds rate at 27.5%]]></title>
      <link>https://example.ng/cbn-holds-rate?utm_source=feed</link>
      <description><![CDATA[<p>The Central Bank of Nigeria kept its benchmark rate unchanged.</p>]]></description>
      <pubDate>Tue, 08 Sep 2026 09:30:00 +0100</pubDate>
      <dc:creator>Jane Reporter</dc:creator>
      <category>Business</category>
      <media:content url="https://example.ng/photo.jpg" medium="image" />
    </item>
    <item>
      <title>No link item</title>
      <description>Should be dropped</description>
    </item>
  </channel>
</rss>`;

  const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Source</title>
  <entry>
    <title>Super Eagles name squad for qualifiers</title>
    <link rel="alternate" type="text/html" href="https://atom.ng/eagles-squad"/>
    <published>2026-09-08T11:00:00Z</published>
    <author><name>Sports Desk</name></author>
    <category term="Sports"/>
    <summary>The head coach named a 23-man squad.</summary>
  </entry>
</feed>`;

  it("parses RSS 2.0 including CDATA, creator, category and media image", () => {
    const feed = parseFeed(RSS, "https://example.ng/feed");
    expect(feed.title).toBe("Test Wire");
    // The item with no link is not publishable and must be dropped.
    expect(feed.items).toHaveLength(1);

    const item = feed.items[0];
    expect(item.title).toBe("CBN holds rate at 27.5%");
    expect(item.link).toBe("https://example.ng/cbn-holds-rate");
    expect(item.author).toBe("Jane Reporter");
    expect(item.categories).toContain("Business");
    expect(item.imageUrl).toBe("https://example.ng/photo.jpg");
    expect(item.publishedAt?.toISOString()).toBe("2026-09-08T08:30:00.000Z");
  });

  it("parses Atom entries with rel=alternate links and nested authors", () => {
    const feed = parseFeed(ATOM, "https://atom.ng/feed");
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0].link).toBe("https://atom.ng/eagles-squad");
    expect(feed.items[0].author).toBe("Sports Desk");
    expect(feed.items[0].categories).toContain("Sports");
  });

  it("throws a typed FeedError on content that is not a feed", () => {
    expect(() => parseFeed("<html><body>not a feed</body></html>")).toThrow(
      /No RSS channel or Atom feed/,
    );
  });

  it("rejects an implausible future date rather than pinning it to the top", () => {
    const future = new Date(Date.now() + 90 * 24 * 3_600_000).toUTCString();
    const xml = RSS.replace("Tue, 08 Sep 2026 09:30:00 +0100", future);
    expect(parseFeed(xml).items[0].publishedAt).toBeNull();
  });
});

describe("normalizeItem", () => {
  function raw(overrides: Partial<RawFeedItem> = {}): RawFeedItem {
    return {
      title: "CBN holds benchmark interest rate at 27.5 per cent",
      link: "https://example.ng/story?utm_source=rss",
      description: "<p>The apex bank left rates unchanged after a two-day meeting.</p>",
      content: "",
      author: "Jane Reporter",
      publishedAt: new Date("2026-09-08T09:00:00Z"),
      categories: ["Business"],
      imageUrl: "https://example.ng/img.jpg",
      guid: "abc",
      ...overrides,
    };
  }

  it("produces a clean, storable item", () => {
    const item = normalizeItem(raw());
    expect(item).not.toBeNull();
    expect(item!.url).toBe("https://example.ng/story");
    expect(item!.summary).not.toContain("<p>");
    expect(item!.publishedAtInferred).toBe(false);
  });

  it("caps the excerpt — we summarise, we never republish in full", () => {
    const long = "word ".repeat(1000);
    const item = normalizeItem(raw({ description: long }))!;
    expect(item.excerpt!.length).toBeLessThanOrEqual(MAX_EXCERPT_CHARS + 1);
    expect(item.summary.length).toBeLessThanOrEqual(MAX_SUMMARY_CHARS + 1);
  });

  it("rejects items with no usable headline or a non-https link", () => {
    expect(normalizeItem(raw({ title: "Hi" }))).toBeNull();
    expect(normalizeItem(raw({ link: "javascript:alert(1)" }))).toBeNull();
  });

  it("falls back to a headline-derived summary when the feed gives none", () => {
    const item = normalizeItem(raw({ description: "", content: "" }))!;
    expect(item.summary).toContain("Full report at the source");
  });

  it("does not treat a description that merely repeats the headline as a summary", () => {
    const title = "CBN holds benchmark interest rate at 27.5 per cent";
    const item = normalizeItem(raw({ description: title, content: "" }))!;
    expect(item.summary).toContain("Full report at the source");
  });

  it("infers a timestamp when the feed omits one, and flags that it did", () => {
    const now = new Date("2026-09-09T00:00:00Z");
    const item = normalizeItem(raw({ publishedAt: null }), { now })!;
    expect(item.publishedAt).toEqual(now);
    expect(item.publishedAtInferred).toBe(true);
  });
});

describe("sanitizeImageUrl", () => {
  it("upgrades http to https and rejects anything else", () => {
    expect(sanitizeImageUrl("http://cdn.ng/a.jpg")).toBe("https://cdn.ng/a.jpg");
    expect(sanitizeImageUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeImageUrl("not a url")).toBeNull();
    expect(sanitizeImageUrl(null)).toBeNull();
  });
});
