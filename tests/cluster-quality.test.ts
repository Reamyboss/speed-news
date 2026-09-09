import { describe, expect, it } from "vitest";
import {
  buildIdfModel,
  hasNumericConflict,
  hasStageConflict,
  isOmnibusFormat,
  weightedOverlap,
  CLUSTER_MID_CONTAINMENT,
  CLUSTER_WEIGHTED_CONTAINMENT,
  CLUSTER_WEIGHTED_JACCARD,
} from "../src/lib/dedupe";
import { titleKey } from "../src/lib/text";
import { CLUSTER_EVAL } from "./fixtures/cluster-eval";

/**
 * Clustering accuracy, measured against hand-labelled real-world pairs.
 *
 * The thresholds in `src/lib/dedupe.ts` were fitted to this set. These tests
 * are the ratchet that stops them drifting back: if someone retunes for recall
 * and starts merging unrelated events, the precision assertion fails.
 */

/**
 * Mirrors the decision `findCluster` makes, minus the database plumbing, so the
 * scoring rule can be measured directly on headline pairs.
 */
function wouldCluster(a: string, b: string, idf: ReturnType<typeof buildIdfModel>): boolean {
  if (isOmnibusFormat(a) || isOmnibusFormat(b)) return false;
  if (hasStageConflict(a, b)) return false;
  if (titleKey(a) === titleKey(b)) return true;

  const overlap = weightedOverlap(a, b, idf);
  if (overlap.containment >= CLUSTER_WEIGHTED_CONTAINMENT) return true;
  return (
    overlap.containment >= CLUSTER_MID_CONTAINMENT &&
    overlap.jaccard >= CLUSTER_WEIGHTED_JACCARD &&
    !hasNumericConflict(a, b)
  );
}

/**
 * The IDF model is built from the eval headlines themselves, so this test is
 * self-contained and deterministic.
 *
 * Note that recall depends on how big the corpus behind the IDF model is: term
 * rarity is only meaningful relative to a body of text. Measured recall is
 * 0.681 against these 176 headlines and 0.710 against the 793-story production
 * window, which is the larger corpus ingest actually supplies. The assertion
 * below therefore uses the pessimistic figure — production does better, not
 * worse. Precision is 1.000 under both.
 */
const idf = buildIdfModel(CLUSTER_EVAL.flatMap((pair) => [pair.a, pair.b]));

function measure() {
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  let trueNegative = 0;
  const falseMerges: string[] = [];

  for (const pair of CLUSTER_EVAL) {
    const clustered = wouldCluster(pair.a, pair.b, idf);
    if (pair.label === "SAME") {
      clustered ? (truePositive += 1) : (falseNegative += 1);
    } else if (clustered) {
      falsePositive += 1;
      falseMerges.push(`${pair.a}  ||  ${pair.b}`);
    } else {
      trueNegative += 1;
    }
  }

  const precision = truePositive + falsePositive ? truePositive / (truePositive + falsePositive) : 1;
  const recall = truePositive / (truePositive + falseNegative);
  return { truePositive, falsePositive, falseNegative, trueNegative, precision, recall, falseMerges };
}

describe("clustering quality against labelled real-world pairs", () => {
  it("never merges two different events", () => {
    const { precision, falseMerges } = measure();
    // Reported by name so a regression says WHICH pair broke, not just a number.
    expect(falseMerges).toEqual([]);
    expect(precision).toBe(1);
  });

  it("recalls the large majority of genuine same-event pairs", () => {
    const { recall } = measure();
    // 0.681 with this fixture's own corpus; 0.710 against the production
    // window. The superseded plain-Jaccard rule scored 0.343 either way, which
    // is why the real corpus produced almost no multi-source clusters.
    expect(recall).toBeGreaterThanOrEqual(0.68);
  });

  it("beats the superseded plain-Jaccard rule it replaced", () => {
    const { recall } = measure();
    expect(recall).toBeGreaterThan(0.343 * 1.5);
  });
});

describe("omnibus formats", () => {
  it.each([
    "Champions League Roundup: Real Madrid beat Inter Milan, Man City win at Porto",
    "Middle East live: US destroys five Iranian oil tankers",
    "Nigeria at 65: five things to know",
    "Budget explainer: what we know so far",
    "The week in pictures",
  ])("treats %s as covering several events", (headline) => {
    expect(isOmnibusFormat(headline)).toBe(true);
  });

  it.each([
    "FG moves to operationalise 112 national emergency number",
    "Troops rescue 23 kidnap victims in Zamfara",
    "CBN elevates terrorism financing supervision",
  ])("does not misclassify the ordinary report %s", (headline) => {
    expect(isOmnibusFormat(headline)).toBe(false);
  });
});

describe("stage conflict", () => {
  it("separates a fixture preview from the match report", () => {
    expect(
      hasStageConflict(
        "Mourinho's Real Madrid edge Inter Milan in Champions League opener",
        "UEFA Champions League: Madrid Host Inter Milan In Heavyweight Tie",
      ),
    ).toBe(true);
  });

  it("does not fire when both sides preview the same fixture", () => {
    expect(
      hasStageConflict(
        "Super Eagles to face Russia in October friendly",
        "Friendly: Super Eagles To Face Russia In Nizhny Novgorod October 6",
      ),
    ).toBe(false);
  });

  it("does not fire when both sides report the same result", () => {
    expect(
      hasStageConflict(
        "Champions League: Haaland Double Powers Man City To victory Over Porto",
        "Haaland to the double as Manchester City beat Porto in Champions League",
      ),
    ).toBe(false);
  });
});

describe("numeric conflict", () => {
  it("flags two operations reported with different victim counts", () => {
    expect(
      hasNumericConflict(
        "Troops rescue 23 kidnap victims in Zamfara",
        "Troops Rescue 12 People, Foil Abduction Attempt In Zamfara",
      ),
    ).toBe(true);
  });

  it("does not flag agreeing figures", () => {
    expect(
      hasNumericConflict(
        "Troops Rescue 12 People, Foil Abduction Attempt In Zamfara",
        "Troops rescue 12 civilians from terrorists in Zamfara",
      ),
    ).toBe(false);
  });

  it("stays silent when either headline quotes no figure", () => {
    expect(hasNumericConflict("Kenya cracks down on foreign traders", "Kenya: Crackdown on foreign traders")).toBe(
      false,
    );
  });
});

describe("IDF-weighted overlap", () => {
  it("scores a short headline fully contained in a longer one as a strong match", () => {
    const model = buildIdfModel([
      "NOUN appoints acting bursar",
      "NOUN appoints Ramatu Ibrahim as acting bursar",
      "Troops rescue 23 kidnap victims in Zamfara",
      "CBN elevates terrorism financing supervision",
    ]);
    const overlap = weightedOverlap(
      "NOUN appoints acting bursar",
      "NOUN appoints Ramatu Ibrahim as acting bursar",
      model,
    );
    // Plain Jaccard scores this pair only 0.667 because it divides by the union.
    expect(overlap.containment).toBe(1);
  });

  it("discounts words that appear all over the corpus", () => {
    const model = buildIdfModel(Array.from({ length: 50 }, (_, i) => `Nigeria news item number ${i}`));
    expect(model.weight("nigeria")).toBeLessThan(model.weight("kainji"));
  });

  it("returns zero for an empty headline rather than dividing by zero", () => {
    const model = buildIdfModel(["something real"]);
    expect(weightedOverlap("", "anything", model)).toEqual({ containment: 0, jaccard: 0 });
  });
});
