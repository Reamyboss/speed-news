import { XMLParser } from "fast-xml-parser";
import { htmlToText, normalizeUrl, toSingleLine, truncate } from "./text";
import { INGEST_CONFIG } from "./env";

/**
 * Feed fetching and normalisation.
 *
 * Handles RSS 2.0, RSS 1.0/RDF and Atom, which between them cover essentially
 * every Nigerian and international publisher feed. Everything that comes back
 * is treated as untrusted: shapes are checked at runtime, not assumed.
 */

export interface RawFeedItem {
  title: string;
  link: string;
  /** Best available descriptive text — may contain HTML; callers must clean it. */
  description: string;
  /** Longer body when the feed publishes one (content:encoded / Atom content). */
  content: string;
  author: string | null;
  publishedAt: Date | null;
  categories: string[];
  imageUrl: string | null;
  /** Publisher-supplied unique id, when present. */
  guid: string | null;
}

export interface ParsedFeed {
  title: string | null;
  items: RawFeedItem[];
}

export class FeedError extends Error {
  constructor(
    message: string,
    readonly kind: "network" | "http" | "parse" | "empty",
    readonly status?: number,
  ) {
    super(message);
    this.name = "FeedError";
  }
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Keep values as strings; we do our own coercion and never want "01" -> 1.
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
  // Namespaced tags (dc:creator, content:encoded, media:content) are kept as-is.
  removeNSPrefix: false,
  cdataPropName: "__cdata",
  processEntities: true,
  htmlEntities: true,
});

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

export async function fetchFeed(
  url: string,
  options: { timeoutMs?: number; userAgent?: string } = {},
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? INGEST_CONFIG.timeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        // Some publishers block unknown agents; we identify ourselves honestly
        // while remaining acceptable to standard WAF rules.
        "user-agent": options.userAgent ?? INGEST_CONFIG.userAgent,
        accept:
          "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5",
        "accept-language": "en-NG,en;q=0.9",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new FeedError(`HTTP ${response.status} ${response.statusText}`, "http", response.status);
    }

    const body = await response.text();
    if (!body.trim()) throw new FeedError("Empty response body", "empty");
    return body;
  } catch (error) {
    if (error instanceof FeedError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    const isAbort = error instanceof Error && error.name === "AbortError";
    throw new FeedError(isAbort ? `Timed out after ${timeoutMs}ms` : message, "network");
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Shape helpers — feeds are wildly inconsistent, so normalise defensively
// ---------------------------------------------------------------------------

type Unknown = Record<string, unknown>;

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function isObject(value: unknown): value is Unknown {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Extracts a string from the many shapes a feed node can take:
 * a bare string, `{ "#text": "..." }`, `{ __cdata: "..." }`, or an array.
 */
function textOf(node: unknown): string {
  if (node === undefined || node === null) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number" || typeof node === "boolean") return String(node);
  if (Array.isArray(node)) {
    for (const entry of node) {
      const value = textOf(entry);
      if (value) return value;
    }
    return "";
  }
  if (isObject(node)) {
    const cdata = node.__cdata;
    if (cdata !== undefined) return textOf(cdata);
    const hash = node["#text"];
    if (hash !== undefined) return textOf(hash);
  }
  return "";
}

function attrOf(node: unknown, attribute: string): string {
  if (Array.isArray(node)) {
    for (const entry of node) {
      const value = attrOf(entry, attribute);
      if (value) return value;
    }
    return "";
  }
  if (isObject(node)) {
    const value = node[`@_${attribute}`];
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
  }
  return "";
}

/** Picks the first key present on a node, tolerating namespace variations. */
function pick(node: Unknown, keys: string[]): unknown {
  for (const key of keys) {
    if (node[key] !== undefined) return node[key];
  }
  return undefined;
}

function parseDate(value: unknown): Date | null {
  const raw = textOf(value).trim();
  if (!raw) return null;

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return sanityCheckDate(parsed);

  // Some feeds emit non-standard formats such as "2026-09-08 14:30:00".
  const normalized = raw.replace(" ", "T");
  const retry = new Date(normalized);
  if (!Number.isNaN(retry.getTime())) return sanityCheckDate(retry);

  // Unix timestamps (seconds or milliseconds).
  if (/^\d{10}$/.test(raw)) return sanityCheckDate(new Date(Number(raw) * 1000));
  if (/^\d{13}$/.test(raw)) return sanityCheckDate(new Date(Number(raw)));

  return null;
}

/**
 * Rejects dates that are obviously wrong. A far-future timestamp would pin a
 * junk item to the top of the homepage forever, so it is treated as missing.
 */
function sanityCheckDate(date: Date): Date | null {
  const time = date.getTime();
  const now = Date.now();
  if (time > now + 36 * 3_600_000) return null; // >36h in the future
  if (time < Date.UTC(1995, 0, 1)) return null;
  return date;
}

// ---------------------------------------------------------------------------
// Link + image extraction
// ---------------------------------------------------------------------------

function extractLink(item: Unknown, feedBase?: string): string {
  const linkNode = item.link;

  // Atom: <link rel="alternate" href="..."/>, possibly several.
  const candidates = asArray(linkNode);
  let alternate = "";
  let firstHref = "";
  for (const candidate of candidates) {
    const href = attrOf(candidate, "href");
    if (href) {
      const rel = attrOf(candidate, "rel");
      const type = attrOf(candidate, "type");
      if (!firstHref) firstHref = href;
      if ((!rel || rel === "alternate") && (!type || type.includes("html"))) {
        alternate = alternate || href;
      }
    }
  }
  const direct = textOf(linkNode);
  const guidNode = item.guid;
  const guidText = textOf(guidNode);
  const guidIsPermalink =
    attrOf(guidNode, "isPermaLink") !== "false" && /^https?:\/\//i.test(guidText);

  const raw =
    alternate ||
    direct ||
    firstHref ||
    (guidIsPermalink ? guidText : "") ||
    textOf(pick(item, ["feedburner:origLink", "origLink"]));

  if (!raw) return "";
  return resolveUrl(raw.trim(), feedBase);
}

function resolveUrl(raw: string, base?: string): string {
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  // Protocol-relative.
  if (raw.startsWith("//")) return `https:${raw}`;
  if (!base) return "";
  try {
    return new URL(raw, base).toString();
  } catch {
    return "";
  }
}

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|avif|gif)(\?|#|$)/i;

function extractImage(item: Unknown, descriptionHtml: string, feedBase?: string): string | null {
  // 1. media:content / media:thumbnail — the most reliable when present.
  for (const key of ["media:content", "media:thumbnail", "media:group"]) {
    for (const node of asArray(item[key])) {
      if (key === "media:group" && isObject(node)) {
        const nested = extractImage(node, "", feedBase);
        if (nested) return nested;
        continue;
      }
      const url = attrOf(node, "url");
      const medium = attrOf(node, "medium");
      const type = attrOf(node, "type");
      if (url && (medium === "image" || type.startsWith("image/") || IMAGE_EXT_RE.test(url))) {
        const resolved = resolveUrl(url, feedBase);
        if (resolved) return resolved;
      }
    }
  }

  // 2. <enclosure type="image/...">
  for (const node of asArray(item.enclosure)) {
    const url = attrOf(node, "url");
    const type = attrOf(node, "type");
    if (url && (type.startsWith("image/") || IMAGE_EXT_RE.test(url))) {
      const resolved = resolveUrl(url, feedBase);
      if (resolved) return resolved;
    }
  }

  // 3. <image><url>...</url></image> on the item.
  const imageNode = item.image;
  if (imageNode) {
    const url = textOf(isObject(imageNode) ? imageNode.url ?? imageNode : imageNode);
    if (url && IMAGE_EXT_RE.test(url)) {
      const resolved = resolveUrl(url, feedBase);
      if (resolved) return resolved;
    }
  }

  // 4. First <img src> inside the description/content HTML.
  const match = descriptionHtml.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (match?.[1]) {
    const resolved = resolveUrl(match[1], feedBase);
    if (resolved && !/\/(pixel|spacer|1x1|blank)\./i.test(resolved)) return resolved;
  }

  return null;
}

function extractCategories(item: Unknown): string[] {
  const out: string[] = [];
  for (const key of ["category", "dc:subject", "categories"]) {
    for (const node of asArray(item[key])) {
      // Atom uses <category term="..."/>, RSS uses element text.
      const value = attrOf(node, "term") || textOf(node);
      const cleaned = toSingleLine(value);
      if (cleaned && cleaned.length <= 60) out.push(cleaned);
    }
  }
  return [...new Set(out)].slice(0, 12);
}

function extractAuthor(item: Unknown): string | null {
  const authorNode = pick(item, ["dc:creator", "author", "creator"]);
  let raw = "";

  // Atom: <author><name>...</name></author>
  for (const node of asArray(authorNode)) {
    if (isObject(node) && node.name !== undefined) {
      raw = textOf(node.name);
      if (raw) break;
    }
    const value = textOf(node);
    if (value) {
      raw = value;
      break;
    }
  }

  const cleaned = toSingleLine(raw)
    // RSS often supplies "editor@example.com (Jane Doe)".
    .replace(/^[^\s@]+@[^\s@]+\s*\((.+)\)$/, "$1")
    .replace(/^by\s+/i, "")
    .trim();

  if (!cleaned || cleaned.length > 120) return null;
  if (/^https?:\/\//i.test(cleaned)) return null;
  return cleaned;
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

export function parseFeed(xml: string, feedUrl?: string): ParsedFeed {
  let document: unknown;
  try {
    document = parser.parse(xml);
  } catch (error) {
    throw new FeedError(
      `XML parse failed: ${error instanceof Error ? error.message : String(error)}`,
      "parse",
    );
  }

  if (!isObject(document)) throw new FeedError("Feed root is not an object", "parse");

  // Locate the channel/feed node across RSS 2.0, RDF and Atom.
  const rss = isObject(document.rss) ? document.rss : null;
  const rdf = isObject(document["rdf:RDF"]) ? document["rdf:RDF"] : null;
  const atom = isObject(document.feed) ? document.feed : null;

  let channel: Unknown | null = null;
  let itemNodes: unknown[] = [];

  if (rss && isObject(rss.channel)) {
    channel = rss.channel;
    itemNodes = asArray(channel.item);
  } else if (rdf) {
    channel = isObject(rdf.channel) ? rdf.channel : rdf;
    // RDF puts <item> as a sibling of <channel>, not a child.
    itemNodes = asArray(rdf.item ?? (channel ? channel.item : undefined));
  } else if (atom) {
    channel = atom;
    itemNodes = asArray(atom.entry);
  } else if (isObject(document.channel)) {
    channel = document.channel;
    itemNodes = asArray(channel.item);
  }

  if (!channel) throw new FeedError("No RSS channel or Atom feed element found", "parse");

  const feedBase = feedUrl || textOf(pick(channel, ["link"])) || undefined;
  const feedTitle = toSingleLine(textOf(channel.title)) || null;

  const items: RawFeedItem[] = [];
  for (const node of itemNodes) {
    if (!isObject(node)) continue;
    const item = parseItem(node, feedBase);
    if (item) items.push(item);
  }

  return { title: feedTitle, items };
}

function parseItem(node: Unknown, feedBase?: string): RawFeedItem | null {
  const title = toSingleLine(textOf(pick(node, ["title"])));
  const link = extractLink(node, feedBase);

  // Without a headline or a destination there is nothing to publish.
  if (!title || !link) return null;
  const normalizedLink = normalizeUrl(link);
  if (!normalizedLink) return null;

  const descriptionHtml = textOf(
    pick(node, ["description", "summary", "subtitle", "itunes:summary"]),
  );
  const contentHtml = textOf(pick(node, ["content:encoded", "content", "body"]));

  return {
    title,
    link: normalizedLink,
    description: descriptionHtml,
    content: contentHtml,
    author: extractAuthor(node),
    publishedAt: parseDate(
      pick(node, ["pubDate", "published", "dc:date", "updated", "date", "lastBuildDate"]),
    ),
    categories: extractCategories(node),
    imageUrl: extractImage(node, contentHtml || descriptionHtml, feedBase),
    guid: textOf(pick(node, ["guid", "id"])) || null,
  };
}

// ---------------------------------------------------------------------------
// Normalisation to storable shape
// ---------------------------------------------------------------------------

export interface NormalizedItem {
  headline: string;
  url: string;
  summary: string;
  excerpt: string | null;
  author: string | null;
  publishedAt: Date;
  categories: string[];
  imageUrl: string | null;
  /** True when publishedAt had to be inferred rather than read from the feed. */
  publishedAtInferred: boolean;
}

/** Longest excerpt we will ever store. We summarise, we do not republish. */
export const MAX_EXCERPT_CHARS = 600;
export const MAX_SUMMARY_CHARS = 320;
export const MAX_HEADLINE_CHARS = 240;

/**
 * Converts a raw feed item into the shape the store expects, applying the
 * licensing posture: short summary, capped excerpt, always link out.
 *
 * Returns null when the item is not publishable (no headline, junk URL, or a
 * headline too short to be a real story).
 */
export function normalizeItem(
  raw: RawFeedItem,
  options: { now?: Date } = {},
): NormalizedItem | null {
  const now = options.now ?? new Date();

  const headline = truncate(toSingleLine(raw.title), MAX_HEADLINE_CHARS);
  if (headline.length < 12) return null;

  const url = normalizeUrl(raw.link);
  if (!url || !/^https:\/\//i.test(url)) return null;

  // Prefer the richer of description/content for summarising.
  const descriptionText = htmlToText(raw.description);
  const contentText = htmlToText(raw.content);
  const bodyText = contentText.length > descriptionText.length ? contentText : descriptionText;

  // Some feeds repeat the headline as the description; that is not a summary.
  const usable =
    bodyText && toSingleLine(bodyText).toLowerCase() !== headline.toLowerCase() ? bodyText : "";

  const summary = usable
    ? truncate(toSingleLine(usable), MAX_SUMMARY_CHARS)
    : `${headline}. Full report at the source.`;

  const excerpt = usable ? truncate(toSingleLine(usable), MAX_EXCERPT_CHARS) : null;

  const publishedAtInferred = raw.publishedAt === null;
  // Clamp future stamps (publisher clock/timezone skew) to ingest time.
  const publishedAt =
    raw.publishedAt && raw.publishedAt.getTime() <= now.getTime()
      ? raw.publishedAt
      : now;

  return {
    headline,
    url,
    summary,
    excerpt,
    author: raw.author,
    publishedAt,
    categories: raw.categories,
    imageUrl: sanitizeImageUrl(raw.imageUrl),
    publishedAtInferred,
  };
}

/**
 * Publisher logos, favicons and placeholders are not story photography. Feeds
 * routinely fall back to them (Punch alone did so for over a hundred stories),
 * and rendering one as a lead image reads as a broken page.
 */
const NON_PHOTO_RE =
  /logo|favicon|placeholder|avatar|sprite|no[-_]?image|default[-_](?:image|thumb)|\/icons?[\/.\-_]|blank\./i;

export function isNonPhotoImage(url: string): boolean {
  try {
    return NON_PHOTO_RE.test(new URL(url).pathname);
  } catch {
    return true;
  }
}

/** Only https images are rendered — http assets would break the page over TLS. */
export function sanitizeImageUrl(url: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:") parsed.protocol = "https:";
    if (parsed.protocol !== "https:") return null;
    if (!parsed.hostname.includes(".")) return null;
    if (isNonPhotoImage(parsed.toString())) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}
