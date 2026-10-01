import { significantTokens, tokenize } from "../text";
import type { EnrichmentRequest } from "./types";

/**
 * Hallucination screen for AI enrichment output.
 *
 * Two classes of claim carry most of the risk of a fabricated fact:
 *   - FIGURES. A number in the output that is not in the material supplied is
 *     invented.
 *   - NAMES. A capitalised term not in the material is a person, place or
 *     body the model supplied from its own background knowledge, which the
 *     editorial rules (`EDITORIAL_RULES` in `./types`) forbid.
 *
 * This is a screen, not a proof: it cannot catch a wrong claim built entirely
 * from words that do appear in the material. It reliably catches the failure
 * mode that matters most here — the model padding a thin feed item with
 * remembered context.
 *
 * Measured against `tests/fixtures/ai-eval.ts`: see `tools/eval-ai.ts` for the
 * current precision/recall and `tests/ai-quality.test.ts` for the ratchet.
 */

/**
 * Words that routinely appear in a faithful summary without appearing in the
 * source text: connective vocabulary, and the days/months a dateline implies.
 * Excluded so the grounding check flags substance, not grammar.
 */
export const GROUNDING_ALLOWLIST = new Set([
  "the", "this", "that", "which", "who", "whom", "nigeria", "nigerian", "nigerians",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "january", "february", "march", "april", "may", "june", "july", "august",
  "september", "october", "november", "december",
  "government", "state", "federal", "national", "country", "report", "reported",
  "according", "said", "says", "statement", "announced", "authorities", "officials",
]);

export interface GroundingResult {
  unsupportedNumbers: string[];
  unsupportedNames: string[];
}

/**
 * Reconstructs the material actually placed in front of the model —
 * everything `buildEnrichmentPrompt` (`./structured.ts`) puts under "STORY
 * MATERIAL" and "OTHER HEADLINES COVERING THE SAME EVENT".
 *
 * The source name and sibling-cluster headlines are real input, not model
 * invention: a summary that restates "Vanguard" or borrows a detail that only
 * appears in a related headline is grounded, not hallucinated. A grounding
 * check built from headline+summary+excerpt alone would flag both as
 * fabricated — a false positive on exactly the routine case of attributing
 * the piece or using corroborating coverage.
 */
export type GroundingSource = Pick<
  EnrichmentRequest,
  "headline" | "summary" | "excerpt" | "sourceName" | "relatedHeadlines" | "publishedAt"
>;

export function buildGroundingMaterial(request: GroundingSource): string {
  return [
    request.headline,
    request.summary,
    request.excerpt ?? "",
    request.sourceName,
    request.publishedAt.toISOString(),
    ...(request.relatedHeadlines ?? []),
  ].join("\n");
}

/**
 * Minor words an acronym conventionally drops: "DRC" for "Democratic
 * Republic of the Congo" skips "of" and "the". Only used to build the
 * initials sequence below, never to judge full-word grounding.
 */
const ACRONYM_SKIP_WORDS = new Set(["of", "the", "and", "for", "in", "on", "at"]);

/**
 * True when `candidate` (e.g. "LGA", "DRC") is a standard abbreviation of
 * words that actually appear in `sourceMaterial`, in order.
 *
 * The model is instructed to use the material as given, but Nigerian and
 * international reporting routinely abbreviates a term the source spelled
 * out in full — "Local Government Area" becomes "LGA", "Democratic Republic
 * of Congo" becomes "DRC". Flagging every such abbreviation as an invented
 * name would bury genuine fabrications in routine noise, so an all-caps
 * token is checked against the initials of the source's own words (skipping
 * minor words an acronym conventionally drops) before it counts as
 * unsupported.
 */
function isKnownAcronym(candidate: string, sourceMaterial: string): boolean {
  if (candidate.length < 2 || candidate.length > 6) return false;
  if (candidate !== candidate.toUpperCase()) return false;

  const words = sourceMaterial.match(/[a-zA-Z]+/g) ?? [];
  const initials = words
    .filter((w) => !ACRONYM_SKIP_WORDS.has(w.toLowerCase()))
    .map((w) => w[0].toLowerCase())
    .join("");

  return initials.includes(candidate.toLowerCase());
}

/**
 * True for a multi-word capitalised phrase in the output ("United States",
 * "World Health Organisation") that spells out a short all-caps token the
 * source material used verbatim ("US", "WHO") — the mirror image of
 * `isKnownAcronym`. A thin wire item often gives only the abbreviation; a
 * faithful summary spelling it out is restating the material, not inventing
 * a new fact from background knowledge.
 */
function isAbbreviatedInSource(words: string[], sourceMaterial: string): boolean {
  if (words.length < 2 || words.length > 4) return false;
  const sourceAcronyms = sourceMaterial.match(/\b[A-Z]{2,6}\b/g) ?? [];
  if (sourceAcronyms.length === 0) return false;

  const initials = words.map((w) => w[0].toLowerCase()).join("");
  return sourceAcronyms.some((a) => a.toLowerCase() === initials);
}

/**
 * Flags content in `outputText` that is not supported by `sourceMaterial`.
 * Pass the result of `buildGroundingMaterial` as `sourceMaterial` so metadata
 * the model was legitimately given isn't mistaken for invention.
 */
export function checkGrounding(outputText: string, sourceMaterial: string): GroundingResult {
  // Nigerian reporting routinely prefixes an amount with a bare "N" for naira
  // ("N7.58bn") rather than the "₦" glyph. "N" and the digit that follows are
  // both word characters, so \b never breaks between them and a naive number
  // regex loses the leading digit ("N7.58" → "58", not "7.58") — on both
  // sides of the comparison, which can hide a genuinely different figure.
  // Inserting a space after a bare currency letter fixes extraction without
  // touching the text used for the name check below.
  const forNumbers = (text: string) => text.replace(/\b([Nn])(?=\d)/g, "$1 ");
  const outputForNumbers = forNumbers(outputText);
  const sourceForNumbers = forNumbers(sourceMaterial);

  const sourceNumbers = new Set(sourceForNumbers.match(/\b\d[\d,.]*\b/g) ?? []);
  const sourceTokens = new Set(significantTokens(sourceMaterial));

  const unsupportedNumbers = (outputForNumbers.match(/\b\d[\d,.]*\b/g) ?? []).filter((n) => {
    if (sourceNumbers.has(n)) return false;
    // "27.5 per cent" restated as "27.5%" is the same figure, and a figure
    // split across a non-breaking space ("2 500") is the same figure as the
    // source's "2,500". A single bare digit is deliberately not screened at
    // all: a lone 0-9 trivially appears as a substring of almost any nearby
    // year or amount, so it carries no real signal either way — this is a
    // screen for fabricated multi-digit quantities, not single digits.
    if (n.length <= 1) return false;
    return !sourceForNumbers.replace(/[,%]/g, "").includes(n.replace(/[,%]/g, ""));
  });

  // Capitalised words that are not sentence-initial.
  const capitalised = outputText.match(/(?<![.!?]\s)(?<!^)\b[A-Z][a-zA-Z'-]{2,}\b/gm) ?? [];
  // Runs of 2-4 consecutive capitalised words, checked separately against
  // `isAbbreviatedInSource` — a multi-word proper noun whose source form is
  // an abbreviation, not the single words that make it up.
  const phrases = outputText.match(/\b[A-Z][a-zA-Z'-]{2,}(?:\s+[A-Z][a-zA-Z'-]{2,}){1,3}\b/g) ?? [];
  const coveredByPhraseMatch = new Set<string>();
  for (const phrase of phrases) {
    const words = phrase.split(/\s+/);
    if (isAbbreviatedInSource(words, sourceMaterial)) {
      for (const word of words) coveredByPhraseMatch.add(word.toLowerCase());
    }
  }

  const unsupportedNames = [...new Set(capitalised)].filter((word) => {
    const lower = word.toLowerCase();
    if (GROUNDING_ALLOWLIST.has(lower)) return false;
    if (coveredByPhraseMatch.has(lower)) return false;
    if (isKnownAcronym(word, sourceMaterial)) return false;
    // Tokenised the same way the source was, so a hyphenated place name
    // ("Sud-Ubangi") or a possessive/contraction ("D'Tigress", apostrophe
    // stripped before splitting) is compared the way `significantTokens`
    // would actually represent it, not as one literal lowercase string.
    const subTokens = tokenize(word);
    if (subTokens.length > 0 && subTokens.every((t) => t.length <= 2 || sourceTokens.has(t))) {
      return false;
    }
    return true;
  });

  return { unsupportedNumbers, unsupportedNames };
}

/**
 * Flattens the generated fields that are checked for grounding into one
 * string. Bullets are discrete claims, not a continuous sentence, so they are
 * joined as separate sentences (". ") rather than with a bare space — a
 * check that only forgives a *sentence-initial* capital would otherwise
 * mistake every bullet's first word ("Source is Punch") for a mid-sentence,
 * unsupported proper noun.
 */
export function enrichmentOutputText(data: {
  summary: string;
  whyItMatters: string;
  bullets: readonly string[];
}): string {
  return [data.summary, data.whyItMatters, ...data.bullets]
    .filter(Boolean)
    .join(". ");
}
