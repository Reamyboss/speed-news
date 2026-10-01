/**
 * Measures the grounding checker against the hand-labelled AI eval set.
 *   npx tsx tools/eval-ai.ts [--verbose]
 */
import { buildGroundingMaterial, checkGrounding, enrichmentOutputText } from "../src/lib/ai/grounding";
import { AI_EVAL } from "../tests/fixtures/ai-eval";

const verbose = process.argv.includes("--verbose");

let tp = 0; // flagged a genuine hallucination
let fp = 0; // flagged a clean output
let fn = 0; // missed a genuine hallucination
let tn = 0; // left clean output alone
const falsePositives: string[] = [];
const falseNegatives: string[] = [];

for (const evalCase of AI_EVAL) {
  const material = buildGroundingMaterial({
    ...evalCase.source,
    publishedAt: new Date(evalCase.source.publishedAt),
  });
  const outputText = enrichmentOutputText(evalCase.output);
  const { unsupportedNumbers, unsupportedNames } = checkGrounding(outputText, material);
  const flagged = unsupportedNumbers.length > 0 || unsupportedNames.length > 0;

  if (evalCase.label === "HALLUCINATED") {
    if (flagged) tp++;
    else {
      fn++;
      falseNegatives.push(evalCase.note);
    }
  } else {
    if (flagged) {
      fp++;
      falsePositives.push(
        `${evalCase.note}  ->  numbers=${JSON.stringify(unsupportedNumbers)} names=${JSON.stringify(unsupportedNames)}`,
      );
    } else tn++;
  }
}

const precision = tp + fp ? tp / (tp + fp) : 1;
const recall = tp + fn ? tp / (tp + fn) : 1;

console.log(`AI eval set: ${AI_EVAL.length} cases (${AI_EVAL.filter((c) => c.label === "CLEAN").length} CLEAN / ${AI_EVAL.filter((c) => c.label === "HALLUCINATED").length} HALLUCINATED)\n`);
console.log(`TP=${tp} FP=${fp} FN=${fn} TN=${tn}  precision=${precision.toFixed(3)} recall=${recall.toFixed(3)}`);

if (verbose || falsePositives.length) {
  if (falsePositives.length) {
    console.log("\nFALSE POSITIVES (flagged genuinely clean output — these erode trust in the tool):");
    falsePositives.forEach((s) => console.log("  x " + s));
  }
  if (falseNegatives.length) {
    console.log("\nFALSE NEGATIVES (missed an injected hallucination):");
    falseNegatives.forEach((s) => console.log("  - " + s));
  }
}
