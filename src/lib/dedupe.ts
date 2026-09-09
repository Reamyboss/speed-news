import { hammingDistance, significantTokens, simhash, titleKey, urlHash } from "./text";

/**
 * Deduplication and clustering are DIFFERENT operations and must not be
 * conflated:
 *
 *   DEDUPE  — the same item arriving twice (same URL, or the same source
 *             re-posting the same headline). One of them is dropped.
 *
 *   CLUSTER — several INDEPENDENT sources covering the same event. All are
 *             kept, because multi-source corroboration is a core product
 *             feature ("what evidence exists"). They are linked instead.
 *
 * Collapsing corroborating coverage into one row would destroy the signal the
 * intelligence layer is built on, so the thresholds below are deliberately
 * conservative in opposite directions.
 */

/** Near-duplicate simhash threshold (out of 64 bits). Lower = stricter. */
export const DUPLICATE_SIMHASH_DISTANCE = 4;

/**
 * Clustering thresholds.
 *
 * These are NOT guesses. They were fitted against `tests/fixtures/cluster-eval.ts`
 * — 88 cross-source headline pairs taken from real production data and labelled
 * by hand — using `npx tsx tools/eval-cluster.ts`. Measured results:
 *
 *   plain-Jaccard rule (previous)   P=1.000  R=0.343  F1=0.511
 *   IDF rule below (current)        P=1.000  R=0.710  F1=0.831
 *
 * Recall is quoted against the 793-story production window, which is the
 * corpus size ingest supplies to `buildIdfModel`. Term rarity is only
 * meaningful relative to a body of text, so a smaller corpus scores slightly
 * lower: the same rule measures R=0.681 using only the eval fixture's own 176
 * headlines. Precision is 1.000 in both cases.
 *
 * Recall slightly above this is reachable (R=0.739 at CLUSTER_WEIGHTED_JACCARD
 * = 0.32) but that value sits 0.005 above the highest-scoring pair that must
 * NOT merge, which is a fit to this eval set rather than a real margin. 0.34
 * keeps a 0.025 buffer. Protecting against false merges beats squeezing recall:
 * a wrong merge is visible to readers as two unrelated stories presented as one
 * event, while a missed merge only costs a corroboration badge.
 *
 * Re-run the harness after changing anything here.
 *
 * Why plain Jaccard failed: it divides by the UNION, so it collapses whenever
 * two newsrooms write headlines of different lengths about one event. "NOUN
 * appoints acting bursar" vs "NOUN appoints Ramatu Ibrahim as acting bursar"
 * is the same event by any human reading, but scores only 0.667 — and the
 * longer the second headline, the worse it gets. Weighting by inverse document
 * frequency and dividing by the SMALLER side fixes both problems at once.
 */

/** Headline is decisively about one event: IDF containment at or above this. */
export const CLUSTER_WEIGHTED_CONTAINMENT = 0.65;
/** Secondary tier: moderate containment needs symmetric agreement too. */
export const CLUSTER_MID_CONTAINMENT = 0.45;
/**
 * Symmetric IDF-weighted Jaccard required at the secondary tier. This is the
 * signal that rejects "same topic, different event" pairs: a headline covering
 * a different match in the same tournament shares the tournament's vocabulary
 * but little else, so the symmetric measure stays low even when containment
 * looks high.
 */
export const CLUSTER_WEIGHTED_JACCARD = 0.34;

/** Retained for the duplicate path and for callers that still pass simhashes. */
export const CLUSTER_STRONG_SIMILARITY = 0.6;
export const CLUSTER_TOKEN_SIMILARITY = 0.45;
export const CLUSTER_SIMHASH_DISTANCE = 22;

/**
 * Formats that cover MANY events in one article: roundups, liveblogs, digests,
 * "five things" explainers.
 *
 * A story carries exactly one clusterId. Letting an omnibus join a cluster
 * therefore forces an arbitrary choice between the events it covers, and can
 * bridge two unrelated clusters into one. In the real corpus "Champions League
 * Roundup: Real Madrid beat Inter Milan, Man City win at Porto" scored high
 * against BOTH match reports — merging it would have fused two distinct
 * fixtures into a single "event".
 */
const OMNIBUS_FORMAT =
  /\b(round[- ]?up|roundup|as it happened|wrap(?:[- ]up)?|recap|highlights|digest|briefing|in pictures|in photos|explainer|what we know|things to know|five things|quiz)\b|\blive(?:blog)?\s*[:|-]|^live\b|\blive updates?\b/i;

/** Reporting an outcome. */
const RESULT_LANGUAGE =
  /\b(beat|beats|beaten|defeat|defeats|defeated|edge|edges|win|wins|won|thrash|thrashes|stun|stuns|victory|triumph|hold|held|draw with|drew)\b/i;
/** Announcing a fixture that has not happened yet. */
const PREVIEW_LANGUAGE =
  /\b(host|hosts|to face|face off|preview|clash with|take on|takes on|set to (?:play|face|meet)|vs\.?|versus)\b/i;

export function isOmnibusFormat(headline: string): boolean {
  return OMNIBUS_FORMAT.test(headline);
}

/**
 * True when one headline previews a fixture and the other reports its result.
 * Same teams, same competition, but different moments — a preview and a match
 * report are not coverage of one event.
 */
export function hasStageConflict(a: string, b: string): boolean {
  const aResult = RESULT_LANGUAGE.test(a);
  const aPreview = PREVIEW_LANGUAGE.test(a);
  const bResult = RESULT_LANGUAGE.test(b);
  const bPreview = PREVIEW_LANGUAGE.test(b);
  return (aResult && !aPreview && bPreview && !bResult) || (bResult && !bPreview && aPreview && !aResult);
}

function numbersIn(headline: string): Set<string> {
  return new Set(headline.match(/\b\d[\d,]*\b/g) ?? []);
}

/**
 * True when both headlines quote figures and share none of them.
 *
 * "Troops rescue 23 kidnap victims in Zamfara" and "Troops Rescue 12 People
 * ... In Zamfara" are two different operations. This is only ever applied as a
 * veto at the SECONDARY tier: newsrooms do genuinely disagree on figures while
 * covering one event (an appeal-court story in the corpus was reported as both
 * a 10-year and a 490-year sentence), and those pairs clear the primary tier
 * on wording alone.
 */
export function hasNumericConflict(a: string, b: string): boolean {
  const left = numbersIn(a);
  const right = numbersIn(b);
  if (left.size === 0 || right.size === 0) return false;
  for (const value of left) if (right.has(value)) return false;
  return true;
}

/**
 * Inverse-document-frequency model over a corpus of headlines.
 *
 * Built from the same recent-story window the clusterer already holds in
 * memory, so it self-calibrates to whatever the news cycle is currently full
 * of. If half the corpus says "Nigeria", the word stops being evidence that
 * two headlines describe the same event; a word appearing twice is strong
 * evidence.
 */
export interface IdfModel {
  weight(token: string): number;
}

export function buildIdfModel(headlines: string[]): IdfModel {
  const documentFrequency = new Map<string, number>();
  for (const headline of headlines) {
    for (const token of new Set(significantTokens(headline))) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }
  const total = headlines.length;
  return {
    weight(token: string) {
      // +1 smoothing keeps an unseen token finite; the trailing +1 floor keeps
      // even a very common word contributing a little.
      return Math.log((total + 1) / ((documentFrequency.get(token) ?? 0) + 1)) + 1;
    },
  };
}

export interface HeadlineOverlap {
  /** Shared weight over the SMALLER headline — tolerant of length differences. */
  containment: number;
  /** Shared weight over the union — punishes one-sided topical overlap. */
  jaccard: number;
}

export function weightedOverlap(a: string, b: string, idf: IdfModel): HeadlineOverlap {
  const left = new Set(significantTokens(a));
  const right = new Set(significantTokens(b));
  if (left.size === 0 || right.size === 0) return { containment: 0, jaccard: 0 };

  let shared = 0;
  let leftWeight = 0;
  let rightWeight = 0;
  for (const token of left) {
    const w = idf.weight(token);
    leftWeight += w;
    if (right.has(token)) shared += w;
  }
  for (const token of right) rightWeight += idf.weight(token);

  const union = leftWeight + rightWeight - shared;
  return {
    containment: shared / Math.min(leftWeight, rightWeight),
    jaccard: union > 0 ? shared / union : 0,
  };
}

/** How far back to look when deciding whether something is a repost. */
export const DUPLICATE_WINDOW_HOURS = 72;
/** How far back to look for a cluster to join. */
export const CLUSTER_WINDOW_HOURS = 72;

export interface Fingerprint {
  urlHash: string;
  titleKey: string;
  simhash: string;
}

export function fingerprint(headline: string, summary: string, url: string): Fingerprint {
  return {
    urlHash: urlHash(url),
    titleKey: titleKey(headline),
    // Weight the headline over the summary: it carries the event identity.
    simhash: simhash(`${headline} ${headline} ${summary}`),
  };
}

/** Minimal shape needed to compare an incoming item against a stored story. */
export interface CandidateStory {
  id: string;
  sourceId: string;
  headline: string;
  urlHash: string;
  titleKey: string;
  simhash: string;
  publishedAt: Date;
  clusterId: string | null;
}

export interface DuplicateCheckInput {
  sourceId: string;
  headline: string;
  publishedAt: Date;
  fingerprint: Fingerprint;
}

export type DuplicateReason =
  | "SAME_URL"
  | "SAME_SOURCE_SAME_TITLE"
  | "SAME_SOURCE_NEAR_DUPLICATE";

export interface DuplicateVerdict {
  isDuplicate: boolean;
  reason?: DuplicateReason;
  matchedStoryId?: string;
}

function hoursBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 3_600_000;
}

/**
 * Decides whether an incoming item is a duplicate of something already stored.
 *
 * Cross-source matches are never duplicates — those are cluster candidates.
 */
export function findDuplicate(
  input: DuplicateCheckInput,
  candidates: CandidateStory[],
): DuplicateVerdict {
  // 1. Identical canonical URL — unambiguous, regardless of source or age.
  for (const candidate of candidates) {
    if (candidate.urlHash === input.fingerprint.urlHash) {
      return { isDuplicate: true, reason: "SAME_URL", matchedStoryId: candidate.id };
    }
  }

  for (const candidate of candidates) {
    // Only the SAME source can produce a duplicate from here on.
    if (candidate.sourceId !== input.sourceId) continue;
    if (hoursBetween(candidate.publishedAt, input.publishedAt) > DUPLICATE_WINDOW_HOURS) continue;

    // 2. Same publisher, same normalised headline — a repost or URL change.
    if (candidate.titleKey === input.fingerprint.titleKey) {
      return {
        isDuplicate: true,
        reason: "SAME_SOURCE_SAME_TITLE",
        matchedStoryId: candidate.id,
      };
    }

    // 3. Same publisher, near-identical text — a lightly edited re-run.
    if (
      hammingDistance(candidate.simhash, input.fingerprint.simhash) <= DUPLICATE_SIMHASH_DISTANCE
    ) {
      return {
        isDuplicate: true,
        reason: "SAME_SOURCE_NEAR_DUPLICATE",
        matchedStoryId: candidate.id,
      };
    }
  }

  return { isDuplicate: false };
}

export interface ClusterMatch {
  clusterId: string;
  matchedStoryId: string;
  score: number;
}

/**
 * Finds an existing cluster this story belongs to.
 *
 * Two tiers, both measured against a hand-labelled set of real headline pairs
 * (see the threshold comments above):
 *
 *   PRIMARY   — the normalised title key matches exactly, or IDF-weighted
 *               containment alone is high enough to be decisive.
 *   SECONDARY — moderate containment, but only when the symmetric measure
 *               agrees and no veto fires.
 *
 * Three vetoes apply before either tier: omnibus formats (which cover several
 * events), preview-versus-result pairs, and — at the secondary tier only —
 * headlines quoting entirely different figures.
 *
 * `idf` is optional so existing callers and tests keep working; when omitted a
 * model is built from the candidate headlines themselves. Ingest passes one
 * built once per run instead, which is the same model but computed once.
 */
export function findCluster(
  input: { headline: string; publishedAt: Date; fingerprint: Fingerprint },
  candidates: CandidateStory[],
  idf?: IdfModel,
): ClusterMatch | null {
  // An omnibus never joins a cluster, in either direction.
  if (isOmnibusFormat(input.headline)) return null;

  const model =
    idf ?? buildIdfModel([input.headline, ...candidates.map((candidate) => candidate.headline)]);

  /** Scores one headline pair, returning 0 when the pair must not be linked. */
  function pairScore(candidate: CandidateStory): number {
    if (isOmnibusFormat(candidate.headline)) return 0;
    if (hasStageConflict(input.headline, candidate.headline)) return 0;

    if (candidate.titleKey === input.fingerprint.titleKey) return 1;

    const overlap = weightedOverlap(input.headline, candidate.headline, model);
    if (overlap.containment >= CLUSTER_WEIGHTED_CONTAINMENT) return overlap.containment;
    if (
      overlap.containment >= CLUSTER_MID_CONTAINMENT &&
      overlap.jaccard >= CLUSTER_WEIGHTED_JACCARD &&
      !hasNumericConflict(input.headline, candidate.headline)
    ) {
      // Blend both measures so the best of several eligible candidates wins.
      return 0.5 * overlap.containment + 0.5 * overlap.jaccard;
    }
    return 0;
  }

  /**
   * The lead (earliest) story of each cluster, which stands for the cluster's
   * identity — the same story `StoryCluster.title` is taken from.
   */
  const leads = new Map<string, CandidateStory>();
  for (const candidate of candidates) {
    if (!candidate.clusterId) continue;
    const current = leads.get(candidate.clusterId);
    if (!current || candidate.publishedAt < current.publishedAt) {
      leads.set(candidate.clusterId, candidate);
    }
  }

  let best: ClusterMatch | null = null;

  for (const candidate of candidates) {
    if (!candidate.clusterId) continue;
    if (hoursBetween(candidate.publishedAt, input.publishedAt) > CLUSTER_WINDOW_HOURS) continue;

    const score = pairScore(candidate);
    if (score === 0) continue;

    // TRANSITIVITY GUARD. Matching any one member is not enough: the story must
    // also match what the cluster is *about*, i.e. its lead.
    //
    // Without this, clusters chain. In the real corpus, four separate FIFA U20
    // Women's World Cup fixtures linked into a single "event" because each new
    // match report resembled the previous one through the shared tournament
    // name, even though the first and last reports describe different games.
    // A ∼ B and B ∼ C does not make A ∼ C.
    const lead = leads.get(candidate.clusterId);
    if (lead && lead.id !== candidate.id && pairScore(lead) === 0) continue;

    if (!best || score > best.score) {
      best = { clusterId: candidate.clusterId, matchedStoryId: candidate.id, score };
    }
  }

  return best;
}

/** Deterministic cluster key so the same event maps to the same cluster. */
export function clusterKey(headline: string): string {
  return titleKey(headline);
}
