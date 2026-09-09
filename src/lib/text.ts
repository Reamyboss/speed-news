import { createHash } from "node:crypto";

/**
 * Text normalisation, sanitisation and fingerprinting.
 *
 * Everything arriving from a feed is hostile input: it may contain HTML,
 * scripts, tracking parameters, CDATA wrappers, mojibake or nothing at all.
 * Every ingest path funnels through here.
 */

// ---------------------------------------------------------------------------
// HTML -> text
// ---------------------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "\u2013",
  mdash: "\u2014",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201C",
  rdquo: "\u201D",
  hellip: "\u2026",
  eacute: "\u00E9",
  egrave: "\u00E8",
  agrave: "\u00E0",
  ccedil: "\u00E7",
  uuml: "\u00FC",
  ouml: "\u00F6",
  auml: "\u00E4",
  szlig: "\u00DF",
  ntilde: "\u00F1",
  deg: "\u00B0",
  euro: "\u20AC",
  pound: "\u00A3",
  naira: "\u20A6",
  trade: "\u2122",
  copy: "\u00A9",
  reg: "\u00AE",
  middot: "\u00B7",
  bull: "\u2022",
  laquo: "\u00AB",
  raquo: "\u00BB",
};

export function decodeEntities(input: string): string {
  if (!input) return "";
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,31});/g, (match, body: string) => {
    if (body.startsWith("#")) {
      const isHex = body[1] === "x" || body[1] === "X";
      const code = Number.parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10);
      // Reject NaN, surrogates and out-of-range code points rather than throwing.
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match;
      if (code >= 0xd800 && code <= 0xdfff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? match;
  });
}

/**
 * Strips markup and returns readable plain text.
 *
 * This is the security boundary for feed content: script/style bodies are
 * dropped entirely (not merely tagged-stripped, which would leak their text),
 * and the result is inserted into React as a plain string, never via
 * dangerouslySetInnerHTML.
 */
export function htmlToText(input: string | null | undefined): string {
  if (!input) return "";
  let text = String(input);

  // Drop dangerous element bodies wholesale.
  text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ");
  text = text.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ");
  text = text.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi, " ");
  text = text.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe\s*>/gi, " ");
  text = text.replace(/<svg\b[^>]*>[\s\S]*?<\/svg\s*>/gi, " ");

  // Unwrap CDATA.
  text = text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  // HTML comments.
  text = text.replace(/<!--[\s\S]*?-->/g, " ");

  // Preserve paragraph/line structure before stripping the rest.
  text = text.replace(/<\/(p|div|li|h[1-6]|blockquote|tr)\s*>/gi, "\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");

  // Remaining tags.
  text = text.replace(/<[^>]+>/g, " ");

  text = decodeEntities(text);

  // Feed boilerplate that adds nothing for a reader.
  text = text.replace(/\bThe post .{0,160}? appeared first on .{0,80}?\.?$/gis, " ");
  text = text.replace(/\bContinue reading[\s\S]{0,80}$/gi, " ");
  text = text.replace(/\bRead more(?: here)?[.:]?\s*$/gi, " ");

  // Collapse whitespace but keep paragraph breaks.
  text = text.replace(/\r/g, "");
  text = text.replace(/[ \t\u00A0]+/g, " ");
  text = text.replace(/\s*\n\s*/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}

/** Collapses to a single line — used for headlines and meta descriptions. */
export function toSingleLine(input: string | null | undefined): string {
  return htmlToText(input).replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Truncation
// ---------------------------------------------------------------------------

/** Truncates on a word boundary and appends an ellipsis. */
export function truncate(input: string, maxChars: number): string {
  const text = (input || "").trim();
  if (maxChars <= 0) return "";
  if (text.length <= maxChars) return text;

  const slice = text.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > maxChars * 0.5 ? slice.slice(0, lastSpace) : slice;
  return `${cut.replace(/[\s.,;:!?\u2013\u2014-]+$/, "")}\u2026`;
}

/**
 * Builds a short extractive summary from feed text.
 *
 * We deliberately take only the opening sentences: enough to orient a reader,
 * never enough to substitute for the publisher's article. The reader is always
 * sent to the source to read it in full.
 */
export function extractiveSummary(input: string, maxChars = 320): string {
  const text = toSingleLine(input);
  if (!text) return "";
  if (text.length <= maxChars) return text;

  const sentences = text.match(/[^.!?]+[.!?]+(?:\s|$)/g);
  if (sentences) {
    let out = "";
    for (const sentence of sentences) {
      const candidate = (out + sentence).trim();
      if (candidate.length > maxChars) break;
      out = candidate + " ";
    }
    const trimmed = out.trim();
    // Only use the sentence-aligned version if it is substantial.
    if (trimmed.length >= Math.min(80, maxChars * 0.35)) return trimmed;
  }
  return truncate(text, maxChars);
}

// ---------------------------------------------------------------------------
// Slugs
// ---------------------------------------------------------------------------

const DIACRITIC_RE = /[\u0300-\u036f]/g;

export function slugify(input: string, maxLength = 80): string {
  const base = toSingleLine(input)
    .normalize("NFKD")
    .replace(DIACRITIC_RE, "")
    .toLowerCase()
    // Keep intra-word apostrophes from creating stray hyphens.
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (base.length <= maxLength) return base;
  const cut = base.slice(0, maxLength);
  const lastHyphen = cut.lastIndexOf("-");
  return (lastHyphen > maxLength * 0.6 ? cut.slice(0, lastHyphen) : cut).replace(/-+$/, "");
}

/** Slug plus a short deterministic suffix, guaranteeing global uniqueness. */
export function uniqueSlug(input: string, uniqueSeed: string): string {
  const base = slugify(input, 72) || "story";
  const suffix = sha256(uniqueSeed).slice(0, 6);
  return `${base}-${suffix}`;
}

// ---------------------------------------------------------------------------
// Hashing + fingerprints
// ---------------------------------------------------------------------------

export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Tracking parameters that must not create a "new" story. */
const TRACKING_PARAMS = [
  /^utm_/i,
  /^fbclid$/i,
  /^gclid$/i,
  /^igshid$/i,
  /^mc_[ce]id$/i,
  /^ref$/i,
  /^ref_src$/i,
  /^source$/i,
  /^amp$/i,
  /^__twitter_impression$/i,
  /^spm$/i,
  /^cmpid$/i,
  /^_ga$/i,
];

/**
 * Canonicalises a URL so the same article always produces the same key,
 * regardless of tracking parameters, AMP suffixes or protocol/host casing.
 */
export function normalizeUrl(rawUrl: string): string {
  const trimmed = (rawUrl || "").trim();
  if (!trimmed) return "";

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return trimmed;
  }

  // Only http(s) is ever ingested — this also blocks javascript:/data: URLs.
  if (url.protocol !== "http:" && url.protocol !== "https:") return "";

  url.protocol = "https:";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  url.hash = "";
  url.username = "";
  url.password = "";
  if ((url.port === "80" || url.port === "443")) url.port = "";

  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.some((re) => re.test(key))) url.searchParams.delete(key);
  }
  url.searchParams.sort();

  // Normalise AMP variants and trailing slashes to one canonical form.
  url.pathname = url.pathname
    .replace(/\/amp\/?$/i, "/")
    .replace(/\.amp$/i, "")
    .replace(/\/{2,}/g, "/");
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");

  const query = url.searchParams.toString();
  return `${url.origin}${url.pathname}${query ? `?${query}` : ""}`;
}

export function urlHash(rawUrl: string): string {
  return sha256(normalizeUrl(rawUrl) || rawUrl.trim());
}

/** Words that carry no distinguishing signal for headline matching. */
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "of", "to", "in", "on", "for", "with",
  "at", "by", "from", "as", "is", "are", "was", "were", "be", "been", "being",
  "it", "its", "this", "that", "these", "those", "has", "have", "had", "will",
  "would", "can", "could", "should", "may", "might", "do", "does", "did",
  "not", "no", "you", "your", "we", "our", "they", "their", "he", "she", "his",
  "her", "him", "them", "us", "if", "than", "then", "so", "up", "out", "over",
  "after", "before", "into", "about", "amid", "says", "said", "say", "new",
  "latest", "breaking", "update", "updates", "video", "photos", "read", "more",
]);

export function tokenize(input: string): string[] {
  return toSingleLine(input)
    .toLowerCase()
    .normalize("NFKD")
    .replace(DIACRITIC_RE, "")
    .replace(/['\u2019]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function significantTokens(input: string): string[] {
  return tokenize(input).filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/**
 * A normalised headline key. Two headlines describing the same event usually
 * collapse to the same key even when the wording around them differs, because
 * stopwords are dropped and the remaining tokens are sorted.
 */
export function titleKey(headline: string): string {
  const tokens = significantTokens(headline);
  if (tokens.length === 0) return sha256(toSingleLine(headline).toLowerCase()).slice(0, 32);
  const unique = [...new Set(tokens)].sort();
  return sha256(unique.slice(0, 12).join(" ")).slice(0, 32);
}

/**
 * 64-bit SimHash over token shingles, returned as 16 hex characters.
 *
 * Near-duplicate detection compares Hamming distance between two simhashes,
 * which catches rewrites and syndication that an exact key would miss.
 */
export function simhash(input: string): string {
  const tokens = significantTokens(input);
  if (tokens.length === 0) return "0".repeat(16);

  // Weight bigrams higher than unigrams: word order carries real signal.
  const features = new Map<string, number>();
  for (const token of tokens) {
    features.set(token, (features.get(token) ?? 0) + 1);
  }
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const bigram = `${tokens[i]}_${tokens[i + 1]}`;
    features.set(bigram, (features.get(bigram) ?? 0) + 2);
  }

  const vector = new Array<number>(64).fill(0);
  for (const [feature, weight] of features) {
    const digest = createHash("md5").update(feature).digest();
    for (let bit = 0; bit < 64; bit += 1) {
      const byte = digest[bit >> 3];
      const isSet = (byte >> (7 - (bit & 7))) & 1;
      vector[bit] += isSet ? weight : -weight;
    }
  }

  let hex = "";
  for (let nibble = 0; nibble < 16; nibble += 1) {
    let value = 0;
    for (let bit = 0; bit < 4; bit += 1) {
      value = (value << 1) | (vector[nibble * 4 + bit] > 0 ? 1 : 0);
    }
    hex += value.toString(16);
  }
  return hex;
}

/** Hamming distance between two 16-char hex simhashes (0 = identical). */
export function hammingDistance(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return 64;
  let distance = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = Number.parseInt(a[i], 16) ^ Number.parseInt(b[i], 16);
    if (!Number.isFinite(x)) return 64;
    distance += (x & 1) + ((x >> 1) & 1) + ((x >> 2) & 1) + ((x >> 3) & 1);
  }
  return distance;
}

/** Jaccard similarity over significant tokens. Returns 0..1. */
export function tokenSimilarity(a: string, b: string): number {
  const setA = new Set(significantTokens(a));
  const setB = new Set(significantTokens(b));
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const token of setA) if (setB.has(token)) intersection += 1;
  return intersection / (setA.size + setB.size - intersection);
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

/** Reading time in whole minutes, floored at 1. */
export function readingTimeMinutes(text: string): number {
  const words = toSingleLine(text).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

/** Escapes a string for safe inclusion inside a JSON-LD <script> block. */
export function escapeJsonLd(value: string): string {
  return value.replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}
