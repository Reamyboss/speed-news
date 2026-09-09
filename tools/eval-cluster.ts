/** Measures a clustering decision function against the hand-labelled set. */
import { readFileSync } from "node:fs";
import { CLUSTER_EVAL } from "../tests/fixtures/cluster-eval";
import { hammingDistance, significantTokens, simhash, titleKey, tokenSimilarity } from "../src/lib/text";

const corpus: { headline: string }[] = JSON.parse(readFileSync("tools/corpus.json", "utf8"));
const df = new Map<string, number>();
for (const r of corpus) for (const t of new Set(significantTokens(r.headline))) df.set(t, (df.get(t) ?? 0) + 1);
const N = corpus.length;
const idf = (t: string) => Math.log((N + 1) / ((df.get(t) ?? 0) + 1)) + 1;

function metrics(a: string, b: string) {
  const A = new Set(significantTokens(a)), B = new Set(significantTokens(b));
  let interW = 0, wA = 0, wB = 0, interN = 0;
  for (const t of A) { wA += idf(t); if (B.has(t)) { interW += idf(t); interN++; } }
  for (const t of B) wB += idf(t);
  const unionW = wA + wB - interW;
  return {
    wcont: wA && wB ? interW / Math.min(wA, wB) : 0,   // IDF containment
    wjac: unionW ? interW / unionW : 0,                 // IDF jaccard (symmetric)
    jac: tokenSimilarity(a, b),
    ham: hammingDistance(simhash(`${a} ${a} `), simhash(`${b} ${b} `)),
    sameKey: titleKey(a) === titleKey(b),
    interN,
  };
}

type Decider = (m: ReturnType<typeof metrics>) => boolean;

export function score(name: string, decide: Decider, verbose = false) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  const fpList: string[] = [], fnList: string[] = [];
  for (const p of CLUSTER_EVAL) {
    const m = metrics(p.a, p.b);
    const yes = decide(m);
    if (p.label === "SAME") { if (yes) tp++; else { fn++; fnList.push(`${p.a}  ||  ${p.b}`); } }
    else { if (yes) { fp++; fpList.push(`${p.a}  ||  ${p.b}`); } else tn++; }
  }
  const prec = tp + fp ? tp / (tp + fp) : 1;
  const rec = tp + fn ? tp / (tp + fn) : 1;
  const f1 = prec + rec ? (2 * prec * rec) / (prec + rec) : 0;
  console.log(`${name.padEnd(46)} TP=${String(tp).padStart(2)} FP=${String(fp).padStart(2)} FN=${String(fn).padStart(2)} TN=${String(tn).padStart(2)}  P=${prec.toFixed(3)} R=${rec.toFixed(3)} F1=${f1.toFixed(3)}`);
  if (verbose) {
    if (fpList.length) { console.log("  FALSE MERGES:"); fpList.forEach((s) => console.log("    x " + s)); }
    if (fnList.length) { console.log("  MISSED:"); fnList.forEach((s) => console.log("    - " + s)); }
  }
  return { tp, fp, fn, tn, prec, rec, f1 };
}

export { metrics };

if (process.argv[1]?.includes("eval-cluster")) {
  console.log(`eval set: ${CLUSTER_EVAL.length} pairs (${CLUSTER_EVAL.filter(p=>p.label==="SAME").length} SAME / ${CLUSTER_EVAL.filter(p=>p.label==="DIFF").length} DIFF)\n`);
  console.log("=== BASELINE: thresholds currently shipping ===");
  score("current (jac>=.6 | jac>=.45&ham<=22 | key)",
    (m) => m.sameKey || m.jac >= 0.6 || (m.jac >= 0.45 && m.ham <= 22), true);
}
