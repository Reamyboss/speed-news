import { describe, expect, it } from "vitest";
import {
  buildGroundingMaterial,
  checkGrounding,
  enrichmentOutputText,
  type GroundingSource,
} from "../src/lib/ai/grounding";
import { AI_EVAL } from "./fixtures/ai-eval";

/**
 * AI enrichment quality, measured against hand-labelled real production
 * output (`tests/fixtures/ai-eval.ts`).
 *
 * This is the ratchet the backlog called for: "No evaluation set for summary
 * quality or hallucination rate. This should be the first thing built before
 * AI output is trusted at scale." Building it caught real defects in the
 * checker itself — see the fixture file's header for what they were and
 * `tools/eval-ai.ts` for a verbose run.
 */

function source(overrides: Partial<GroundingSource> = {}): GroundingSource {
  return {
    headline: "Example headline",
    summary: "Example summary.",
    excerpt: null,
    sourceName: "Example Source",
    relatedHeadlines: [],
    publishedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("checkGrounding: unit cases", () => {
  it("flags a fabricated figure absent from the material", () => {
    const material = buildGroundingMaterial(source({ summary: "Troops rescued 13 victims." }));
    const result = checkGrounding("Troops rescued 45 victims.", material);
    expect(result.unsupportedNumbers).toEqual(["45"]);
  });

  it("flags an invented proper noun absent from the material", () => {
    const material = buildGroundingMaterial(source({ summary: "Police arrested a suspect." }));
    const result = checkGrounding("Inspector Femi Balogun made the arrest.", material);
    expect(result.unsupportedNames).toContain("Balogun");
  });

  it("does not flag a figure restated with a different thousands separator", () => {
    const material = buildGroundingMaterial(
      source({ summary: "Police recovered 2,500 sachets." }),
    );
    const result = checkGrounding("Police recovered 2 500 sachets.", material);
    expect(result.unsupportedNumbers).toEqual([]);
  });

  it("does not flag a naira figure restated without the bare 'N' prefix merging into the digits", () => {
    const material = buildGroundingMaterial(
      source({ summary: "The system cost N7.58 billion, installed in 2019." }),
    );
    const result = checkGrounding(
      "The system cost N7.58 billion, installed in 2019.",
      material,
    );
    expect(result.unsupportedNumbers).toEqual([]);
  });

  it("still catches a fabricated naira figure despite the bare-'N' prefix", () => {
    const material = buildGroundingMaterial(
      source({ summary: "The system cost N7.58 billion." }),
    );
    const result = checkGrounding("Auditors valued it at N8.2 billion.", material);
    expect(result.unsupportedNumbers).toEqual(["8.2"]);
  });

  it("does not screen a bare single digit either way", () => {
    // Low-signal by design: a lone 0-9 is a substring of almost any nearby
    // year or amount, so it is excluded rather than rubber-stamped.
    const material = buildGroundingMaterial(source({ summary: "No figures here at all." }));
    const result = checkGrounding("A single figure of 9 appears.", material);
    expect(result.unsupportedNumbers).toEqual([]);
  });

  it("does not flag the source's own name", () => {
    const material = buildGroundingMaterial(
      source({ sourceName: "Vanguard", summary: "Something happened." }),
    );
    const result = checkGrounding("Vanguard reported the development.", material);
    expect(result.unsupportedNames).toEqual([]);
  });

  it("does not flag an entity that only appears in a sibling cluster headline", () => {
    const material = buildGroundingMaterial(
      source({
        summary: "NNPC plans new filling stations.",
        relatedHeadlines: ["NNPCL to deploy fuel stations nationwide"],
      }),
    );
    const result = checkGrounding("NNPCL confirmed the rollout.", material);
    expect(result.unsupportedNames).toEqual([]);
  });

  it("does not flag the publish date restated in a different format", () => {
    const material = buildGroundingMaterial(
      source({ summary: "An update.", publishedAt: new Date("2026-09-10T08:00:00.000Z") }),
    );
    const result = checkGrounding("Published 2026-09-10.", material);
    expect(result.unsupportedNumbers).toEqual([]);
  });

  it("does not flag a standard abbreviation of a phrase spelled out in the material", () => {
    const material = buildGroundingMaterial(
      source({ summary: "The attack happened in Goronyo Local Government Area." }),
    );
    const result = checkGrounding("The LGA was placed under curfew.", material);
    expect(result.unsupportedNames).toEqual([]);
  });

  it("does not flag a full name that spells out the source's own abbreviation", () => {
    const material = buildGroundingMaterial(
      source({ summary: "The man travelled through the US before diagnosis." }),
    );
    const result = checkGrounding("He had been in the United States.", material);
    expect(result.unsupportedNames).toEqual([]);
  });

  it("does not treat the first word of each bullet as a mid-sentence proper noun", () => {
    const text = enrichmentOutputText({
      summary: "A striker deleted his social media posts.",
      whyItMatters: "It raised concern among fans.",
      bullets: ["Source is Punch", "Deployment scheduled within six months"],
    });
    const material = buildGroundingMaterial(
      source({ summary: "Reported by Punch. Deployment scheduled within six months." }),
    );
    const result = checkGrounding(text, material);
    expect(result.unsupportedNames).toEqual([]);
  });

  it("still flags a genuinely mid-sentence invented name inside a bullet", () => {
    const material = buildGroundingMaterial(source({ summary: "Police made an arrest." }));
    const result = checkGrounding("The arrest was led by Inspector Balogun.", material);
    expect(result.unsupportedNames).toContain("Balogun");
  });
});

describe("AI eval set: precision and recall ratchet", () => {
  function measure() {
    let truePositive = 0;
    let falsePositive = 0;
    let falseNegative = 0;
    let trueNegative = 0;
    const falsePositiveNotes: string[] = [];
    const falseNegativeNotes: string[] = [];

    for (const evalCase of AI_EVAL) {
      const material = buildGroundingMaterial({
        ...evalCase.source,
        publishedAt: new Date(evalCase.source.publishedAt),
      });
      const outputText = enrichmentOutputText(evalCase.output);
      const { unsupportedNumbers, unsupportedNames } = checkGrounding(outputText, material);
      const flagged = unsupportedNumbers.length > 0 || unsupportedNames.length > 0;

      if (evalCase.label === "HALLUCINATED") {
        if (flagged) truePositive += 1;
        else {
          falseNegative += 1;
          falseNegativeNotes.push(evalCase.note);
        }
      } else if (flagged) {
        falsePositive += 1;
        falsePositiveNotes.push(evalCase.note);
      } else {
        trueNegative += 1;
      }
    }

    return {
      truePositive,
      falsePositive,
      falseNegative,
      trueNegative,
      falsePositiveNotes,
      falseNegativeNotes,
    };
  }

  it("never flags a genuinely clean, real-production output", () => {
    // This is the number that matters most in practice: a false positive
    // here means an editor sees a "needs review" flag on correct AI output
    // and learns to ignore the tool.
    const { falsePositive, falsePositiveNotes } = measure();
    expect(falsePositiveNotes).toEqual([]);
    expect(falsePositive).toBe(0);
  });

  it("catches every injected hallucination in the set", () => {
    const { falseNegative, falseNegativeNotes } = measure();
    // Reported by name so a regression says WHICH injected case stopped
    // being caught, not just a number.
    expect(falseNegativeNotes).toEqual([]);
    expect(falseNegative).toBe(0);
  });

  it("has at least as many CLEAN cases as HALLUCINATED ones", () => {
    // A cheap guard against the set drifting toward all-synthetic-negatives,
    // which would stop measuring anything about real output.
    const clean = AI_EVAL.filter((c) => c.label === "CLEAN").length;
    const hallucinated = AI_EVAL.filter((c) => c.label === "HALLUCINATED").length;
    expect(clean).toBeGreaterThan(hallucinated);
  });
});
