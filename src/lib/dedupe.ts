import { hammingDistance, simhash, titleKey, tokenSimilarity, urlHash } from "./text";

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
 * Headline token overlap is the primary signal. SimHash over a single short
 * headline is noisy — two reports of one event routinely differ by 20+ bits
 * purely because the publishers chose different nouns ("CBN" vs "Central
 * Bank") — so it is used as a corroborating signal at a moderate similarity,
 * never as a gate on its own.
 */
export const CLUSTER_STRONG_SIMILARITY = 0.6;
export const CLUSTER_TOKEN_SIMILARITY = 0.45;
export const CLUSTER_SIMHASH_DISTANCE = 22;

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
 * Requires agreement from two independent signals (exact key OR simhash
 * proximity, plus token overlap) so unrelated stories that happen to share a
 * couple of common nouns are not merged.
 */
export function findCluster(
  input: { headline: string; publishedAt: Date; fingerprint: Fingerprint },
  candidates: CandidateStory[],
): ClusterMatch | null {
  let best: ClusterMatch | null = null;

  for (const candidate of candidates) {
    if (!candidate.clusterId) continue;
    if (hoursBetween(candidate.publishedAt, input.publishedAt) > CLUSTER_WINDOW_HOURS) continue;

    const distance = hammingDistance(candidate.simhash, input.fingerprint.simhash);
    const similarity = tokenSimilarity(input.headline, candidate.headline);
    const exactKey = candidate.titleKey === input.fingerprint.titleKey;

    let score = 0;
    if (exactKey) {
      // An exact normalised-title match is decisive on its own.
      score = 1;
    } else if (similarity >= CLUSTER_STRONG_SIMILARITY) {
      // Headlines that share most of their meaningful words are the same
      // event, whatever the fingerprints say.
      score = similarity;
    } else if (similarity >= CLUSTER_TOKEN_SIMILARITY && distance <= CLUSTER_SIMHASH_DISTANCE) {
      // Moderate overlap needs the fingerprint to agree before we merge.
      score = 0.5 * (1 - distance / 64) + 0.5 * similarity;
    } else {
      continue;
    }

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
