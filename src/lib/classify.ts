import {
  type Category,
  type Region,
  type SourceType,
  CATEGORIES,
  SOURCE_TYPE_META,
  isCategory,
} from "./taxonomy";
import { tokenize, toSingleLine } from "./text";

/**
 * Deterministic, dependency-free classification.
 *
 * Category assignment must never depend on the AI provider — the site has to
 * work when enrichment is down, and category pages are core navigation. This
 * scores keyword evidence from the headline, summary and feed-supplied
 * sections, then falls back to the source's declared categories.
 */

interface CategoryRule {
  /** Strong single-token signals. */
  tokens: string[];
  /** Multi-word phrases matched against the lowercased text. */
  phrases: string[];
  /** Path fragments in the article URL, which publishers section reliably. */
  urlHints: string[];
}

const RULES: Record<Category, CategoryRule> = {
  politics: {
    tokens: [
      "inec", "apc", "pdp", "lp", "nnpp", "senate", "senator", "governor",
      "governorship", "election", "elections", "ballot", "electoral", "impeach",
      "impeachment", "tinubu", "shettima", "assembly", "lawmaker", "lawmakers",
      "reps", "constituency", "minister", "ministerial", "cabinet", "presidency",
      "aso", "villa", "campaign", "primaries", "defection", "coalition", "polls",
      "gubernatorial", "councillor", "referendum", "tribunal", "obi", "atiku",
    ],
    phrases: [
      "national assembly", "house of representatives", "state house", "federal government",
      "political party", "presidential candidate", "local government election",
      "supplementary election", "the presidency", "party primaries", "vote of no confidence",
      "state assembly", "peoples democratic party", "all progressives congress",
    ],
    urlHints: ["/politics", "/political", "/election", "/elections", "/govt"],
  },
  business: {
    tokens: [
      "naira", "cbn", "inflation", "gdp", "nbs", "economy", "economic", "forex",
      "fx", "dollar", "exchange", "bank", "banks", "banking", "loan", "loans",
      "debt", "budget", "revenue", "tax", "taxes", "firs", "customs", "tariff",
      "oil", "crude", "opec", "nnpc", "petrol", "fuel", "subsidy", "diesel",
      "market", "markets", "stocks", "equities", "ngx", "investors", "investment",
      "trade", "export", "exports", "import", "imports", "sec", "pension",
      "insurance", "fintech", "recapitalisation", "recapitalization", "eurobond",
      "imf", "afdb", "remittances", "manufacturers", "manufacturing", "cement",
      "profit", "earnings", "dividend", "shareholders", "turnover", "pmi",
    ],
    phrases: [
      "central bank", "monetary policy", "interest rate", "exchange rate",
      "foreign exchange", "world bank", "capital market", "stock exchange",
      "cost of living", "purchasing power", "food prices", "minimum wage",
      "gross domestic product", "fuel subsidy", "balance of payments",
      "monetary policy committee", "bureau de change", "national bureau of statistics",
    ],
    urlHints: ["/business", "/economy", "/money", "/finance", "/markets", "/energy"],
  },
  technology: {
    tokens: [
      "startup", "startups", "fintech", "app", "apps", "software", "ai",
      "artificial", "developer", "developers", "tech", "technology", "telecom",
      "telecoms", "ncc", "broadband", "internet", "5g", "smartphone", "android",
      "ios", "cybersecurity", "hacker", "hackers", "data", "cloud", "saas",
      "crypto", "cryptocurrency", "bitcoin", "blockchain", "ecommerce",
      "seedfunding", "vc", "openai", "google", "microsoft", "meta", "nitda",
      "digital", "platform", "algorithm", "chip", "chips", "semiconductor",
      "starlink", "mtn", "airtel", "glo",
    ],
    phrases: [
      "artificial intelligence", "machine learning", "series a", "series b",
      "seed round", "venture capital", "data centre", "data center",
      "digital economy", "mobile money", "payment gateway", "tech ecosystem",
      "raised $", "cyber attack", "data breach", "social media platform",
      "electronic payment", "open banking",
    ],
    urlHints: ["/tech", "/technology", "/innovation", "/startups", "/digital"],
  },
  sports: {
    tokens: [
      "football", "soccer", "match", "matches", "goal", "goals", "striker",
      "midfielder", "defender", "goalkeeper", "coach", "manager", "squad",
      "fixture", "fixtures", "league", "cup", "afcon", "fifa", "caf", "uefa",
      "nff", "npfl", "eagles", "falcons", "olympic", "olympics", "athletics",
      "sprinter", "boxing", "basketball", "nba", "tennis", "cricket", "golf",
      "transfer", "arsenal", "chelsea", "liverpool", "barcelona", "madrid",
      "osimhen", "lookman", "iwobi", "chukwueze", "kickoff", "penalty",
      "qualifier", "qualifiers", "trophy", "champions", "relegation", "derby",
    ],
    phrases: [
      "super eagles", "super falcons", "premier league", "champions league",
      "world cup", "africa cup of nations", "nigeria professional football league",
      "transfer window", "half time", "full time", "man of the match",
      "flying eagles", "golden eaglets", "d'tigers",
    ],
    urlHints: ["/sport", "/sports", "/football", "/soccer"],
  },
  entertainment: {
    tokens: [
      "nollywood", "afrobeats", "movie", "movies", "film", "films", "cinema",
      "album", "single", "song", "songs", "music", "musician", "singer",
      "rapper", "artiste", "actress", "actor", "celebrity", "concert", "tour",
      "grammy", "amvca", "bbnaija", "reality", "netflix", "showmax", "premiere",
      "wizkid", "davido", "burna", "tems", "rema", "asake", "ayra", "tiwa",
      "comedian", "skit", "fashion", "streaming", "box", "chart", "charts",
    ],
    phrases: [
      "big brother naija", "box office", "music video", "record label",
      "movie premiere", "red carpet", "award show", "billboard chart",
      "the headies", "entertainment industry", "new album",
    ],
    urlHints: ["/entertainment", "/nollywood", "/celebrity", "/music", "/lifestyle", "/arts"],
  },
  world: {
    tokens: [
      "ukraine", "russia", "gaza", "israel", "palestine", "nato", "eu",
      "brussels", "washington", "beijing", "moscow", "kyiv", "tehran", "iran",
      "china", "india", "brazil", "ghana", "kenya", "ethiopia", "sudan",
      "niger", "mali", "senegal", "cameroon", "un", "unicef", "unhcr",
      "trump", "biden", "putin", "zelensky", "macron", "starmer", "xi",
      "summit", "sanctions", "ceasefire", "airstrike", "diplomacy",
    ],
    phrases: [
      "united nations", "european union", "white house", "security council",
      "african union", "foreign minister", "prime minister", "state department",
      "international court", "world health organization", "global summit",
      "peace talks", "g20", "g7",
    ],
    urlHints: ["/world", "/international", "/global", "/africa", "/foreign"],
  },
  nigeria: {
    tokens: [
      "nigeria", "nigerian", "nigerians", "lagos", "abuja", "kano", "rivers",
      "kaduna", "enugu", "ibadan", "oyo", "ogun", "delta", "anambra", "borno",
      "benue", "plateau", "sokoto", "zamfara", "katsina", "bayelsa", "imo",
      "abia", "ekiti", "ondo", "osun", "kwara", "niger", "taraba", "yobe",
      "adamawa", "bauchi", "gombe", "jigawa", "kebbi", "nasarawa", "ebonyi",
      "cross", "akwa", "efcc", "icpc", "police", "nscdc", "nafdac", "ndlea",
      "frsc", "jamb", "waec", "neco", "asuu", "nlc", "kidnappers", "bandits",
      "insurgents", "herdsmen", "community", "residents", "flood", "collapse",
    ],
    phrases: [
      "federal capital territory", "state government", "nigeria police force",
      "nigerian army", "road safety", "trade union congress", "academic staff union",
      "local government area", "south east", "south west", "north east",
      "north west", "north central", "south south", "niger delta",
    ],
    urlHints: ["/news", "/nigeria", "/metro", "/national", "/local", "/education", "/health"],
  },
};

/** Categories are scored in this order when totals tie — most specific first. */
const TIE_BREAK_ORDER: Category[] = [
  "sports",
  "entertainment",
  "technology",
  "business",
  "politics",
  "world",
  "nigeria",
];

export interface ClassifyInput {
  headline: string;
  summary?: string | null;
  /** Section/category labels supplied by the feed itself, if any. */
  feedCategories?: string[];
  url?: string | null;
  /** Comma-delimited category slugs declared on the source registry entry. */
  sourceCategories?: string;
  sourceType?: SourceType;
  sourceCountry?: string;
}

export interface ClassifyResult {
  category: Category;
  region: Region;
  /** 0..1 — how much evidence backed the winning category. */
  confidence: number;
  scores: Record<Category, number>;
}

const NIGERIA_MARKERS = new Set(RULES.nigeria.tokens);

function scoreRules(
  haystackTokens: Set<string>,
  haystackText: string,
  urlPath: string,
): Record<Category, number> {
  const scores = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;

  for (const category of CATEGORIES) {
    const rule = RULES[category];
    let score = 0;

    for (const token of rule.tokens) {
      if (haystackTokens.has(token)) score += 2;
    }
    for (const phrase of rule.phrases) {
      if (haystackText.includes(phrase)) score += 5;
    }
    for (const hint of rule.urlHints) {
      if (urlPath.includes(hint)) score += 6;
    }
    scores[category] = score;
  }

  return scores;
}

/**
 * `nigeria` is the residual bucket for domestic news, so it must not win just
 * because a Nigerian outlet mentions Nigeria. We damp it whenever a topical
 * category also has real evidence.
 */
function dampenResidual(scores: Record<Category, number>): void {
  const topical = (["politics", "business", "technology", "sports", "entertainment"] as const)
    .map((c) => scores[c])
    .reduce((max, value) => Math.max(max, value), 0);
  if (topical >= 6) scores.nigeria = Math.round(scores.nigeria * 0.35);
}

export function classifyStory(input: ClassifyInput): ClassifyResult {
  const headline = toSingleLine(input.headline);
  const summary = toSingleLine(input.summary ?? "");
  const feedCategoryText = (input.feedCategories ?? []).join(" ").toLowerCase();

  // Headline evidence counts double — it is the most reliable signal.
  const haystackText = `${headline} ${headline} ${summary} ${feedCategoryText}`.toLowerCase();
  const haystackTokens = new Set(tokenize(haystackText));

  let urlPath = "";
  try {
    urlPath = input.url ? new URL(input.url).pathname.toLowerCase() : "";
  } catch {
    urlPath = (input.url ?? "").toLowerCase();
  }

  const scores = scoreRules(haystackTokens, haystackText, urlPath);

  // A feed section that exactly names one of our categories is strong evidence.
  for (const raw of input.feedCategories ?? []) {
    const normalized = raw.trim().toLowerCase();
    if (isCategory(normalized)) scores[normalized] += 8;
    if (normalized === "economy" || normalized === "money" || normalized === "finance") {
      scores.business += 8;
    }
    if (normalized === "tech" || normalized === "innovation") scores.technology += 8;
    if (normalized === "football" || normalized === "sport") scores.sports += 8;
    if (normalized === "showbiz" || normalized === "celebrities") scores.entertainment += 8;
    if (normalized === "international" || normalized === "foreign") scores.world += 8;
  }

  dampenResidual(scores);

  // Wire services and international desks default toward `world` unless the
  // item is clearly about Nigeria.
  const mentionsNigeria = [...haystackTokens].some((t) => NIGERIA_MARKERS.has(t));
  if (input.sourceType === "INTERNATIONAL_MEDIA" && !mentionsNigeria) {
    scores.world += 7;
  }

  // Evidence drawn from the story ITSELF, before any source-level prior is
  // mixed in. Keeping these separate matters: a publisher that declares four
  // categories would otherwise contribute an equal score to all of them and
  // let the tie-break order — not the story — decide the section.
  const contentScores = { ...scores };
  const contentBest = Math.max(...CATEGORIES.map((c) => contentScores[c]));

  const declared = (input.sourceCategories ?? "")
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(isCategory);

  // The registry's declared categories are a weak prior, and only the first
  // one (the source's primary beat) carries real information.
  declared.forEach((category, index) => {
    if (declared.length === 1) scores[category] += 4;
    else scores[category] += index === 0 ? 2 : 1;
  });

  let winner: Category = "nigeria";
  let best = -1;
  for (const category of TIE_BREAK_ORDER) {
    if (scores[category] > best) {
      best = scores[category];
      winner = category;
    }
  }

  // The story itself said nothing topical. Trust the source's primary beat
  // rather than letting the tie-break order pick a section at random.
  if (contentBest <= 0) {
    winner = declared[0] ?? (input.sourceType === "INTERNATIONAL_MEDIA" ? "world" : "nigeria");
    best = scores[winner];
  }

  const total = CATEGORIES.reduce((sum, c) => sum + Math.max(0, scores[c]), 0);
  const confidence = total > 0 ? Math.min(1, Math.max(0, best / total)) : 0;

  return {
    category: winner,
    region: resolveRegion(winner, mentionsNigeria, input),
    confidence: Number(confidence.toFixed(3)),
    scores,
  };
}

function resolveRegion(
  category: Category,
  mentionsNigeria: boolean,
  input: ClassifyInput,
): Region {
  if (mentionsNigeria) return "ng";
  if (category === "world") return "world";
  if (input.sourceCountry && input.sourceCountry.toUpperCase() !== "NG") {
    return input.sourceType === "INTERNATIONAL_MEDIA" ? "world" : "africa";
  }
  return "ng";
}

// ---------------------------------------------------------------------------
// Importance scoring — drives homepage ranking
// ---------------------------------------------------------------------------

const HIGH_IMPACT_PHRASES = [
  "breaking", "dies", "died", "death toll", "killed", "explosion", "crash",
  "resigns", "sacked", "arrested", "convicted", "sentenced", "declares",
  "state of emergency", "strike", "shutdown", "collapse", "devalued",
  "emergency", "attack", "abducted", "kidnapped", "flood", "outbreak",
  "verdict", "ruling", "swears in", "suspended", "impeached", "curfew",
];

/**
 * Opinion, columns and editorials.
 *
 * These are legitimate journalism but they are argument, not new information,
 * so they should not lead a news front page. Publishers signal them reliably
 * in two ways: a "By <Author>" suffix in the headline, and an opinion section
 * in the URL.
 */
const OPINION_URL_HINTS = [
  "/opinion",
  "/columnist",
  "/columns",
  "/editorial",
  "/viewpoint",
  "/perspective",
  "/blog",
  "/analysis",
  "/letters",
];

export function looksLikeOpinion(headline: string, url?: string | null): boolean {
  // "Some argument about a thing, By Jane Doe".
  // `by` is matched case-insensitively by hand rather than with the `i` flag,
  // because `i` would also make \p{Lu} match a lowercase letter and the
  // capitalised author name is the part that makes this signal reliable.
  if (/,\s*[Bb][Yy]\s+\p{Lu}[\p{L}'-]+/u.test(headline)) return true;

  if (url) {
    let path = "";
    try {
      path = new URL(url).pathname.toLowerCase();
    } catch {
      path = url.toLowerCase();
    }
    if (OPINION_URL_HINTS.some((hint) => path.includes(hint))) return true;
  }
  return false;
}

/**
 * Ceremonial / procedural wire language. These items are legitimate reporting
 * but are rarely what a reader needs at the top of a front page.
 */
const ROUTINE_PHRASES = [
  "urges", "commends", "felicitates", "congratulates", "lauds", "hails",
  "charges", "tasks", "calls on", "harps on", "reiterates", "restates",
  "seeks support", "advocates", "pledges support", "assures", "woos",
  "flags off", "inaugurates committee", "pays courtesy",
];

export interface ImportanceInput {
  headline: string;
  summary?: string | null;
  trustTier: number;
  sourceType: SourceType;
  sourceWeight: number;
  publishedAt: Date;
  hasImage: boolean;
  /** Number of distinct sources already covering the same cluster. */
  corroboratingSources?: number;
  /** Story region — this is a Nigeria-first product, so `ng` ranks higher. */
  region?: Region;
  /** Article URL, used to detect opinion/column sections. */
  url?: string | null;
  now?: Date;
}

/**
 * Returns 0-100. Combines source authority, corroboration, recency and
 * language intensity. Deliberately transparent and tunable — no black box.
 */
export function scoreImportance(input: ImportanceInput): number {
  // Budgeted so the components sum to roughly 100 at their theoretical
  // maximum. If the total saturates, every story ties at 100 and ordering
  // silently degenerates to publish time — which is exactly not the point of
  // having a score.
  let score = 30;

  // Source authority: tier 1 earns +15, tier 5 earns nothing.
  score += (4 - Math.min(4, Math.max(0, input.trustTier - 1))) * 3.75;

  const meta = SOURCE_TYPE_META[input.sourceType];
  // Signals and commentary are labelled, not led with.
  if (!meta?.presentAsReporting) score -= 20;

  // Editorial weight from the registry, mapped to +/- 8.
  score += (Math.min(100, Math.max(0, input.sourceWeight)) - 50) / 6.25;

  // NIGERIA-FIRST. Without this, tier-1 international wires (high trust, high
  // weight) sweep the homepage and the product stops being what it claims to
  // be. World news still earns its place on merit — it just does not get a
  // structural advantage over domestic reporting on a Nigerian front page.
  if (input.region === "ng") score += 10;
  else if (input.region === "africa") score += 4;

  // Corroboration across independent sources is the strongest quality signal
  // we can compute without reading the article.
  const corroborating = input.corroboratingSources ?? 1;
  if (corroborating >= 2) score += Math.min(14, (corroborating - 1) * 5);

  const now = input.now ?? new Date();
  const ageHours = (now.getTime() - input.publishedAt.getTime()) / 3_600_000;
  if (ageHours < 1) score += 12;
  else if (ageHours < 3) score += 9;
  else if (ageHours < 8) score += 6;
  else if (ageHours < 24) score += 2;
  else if (ageHours < 72) score -= 6;
  else score -= 16;

  const text = `${input.headline} ${input.summary ?? ""}`.toLowerCase();
  const impactHits = HIGH_IMPACT_PHRASES.filter((p) => text.includes(p)).length;
  score += Math.min(10, impactHits * 3.5);

  if (input.hasImage) score += 3;

  // Routine institutional notices ("urges", "commends", "felicitates") are the
  // bulk of wire filler and should not outrank actual events.
  if (ROUTINE_PHRASES.some((p) => text.includes(p))) score -= 8;

  // Opinion is argument, not new information. It belongs in its section, not
  // at the top of the front page.
  if (looksLikeOpinion(input.headline, input.url)) score -= 16;

  // Clickbait-ish all-caps headlines get a small penalty.
  const letters = input.headline.replace(/[^A-Za-z]/g, "");
  if (letters.length > 12) {
    const upperRatio = (input.headline.match(/[A-Z]/g)?.length ?? 0) / letters.length;
    if (upperRatio > 0.7) score -= 8;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

