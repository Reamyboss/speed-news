/**
 * Threshold tuner for cross-source clustering.
 *
 * Prints the precision/recall trade-off curve for CLUSTER_WEIGHTED_JACCARD
 * against the hand-labelled pairs in tests/fixtures/cluster-eval.ts, plus the
 * margin between each candidate threshold and the highest-scoring pair that
 * must NOT merge. Use it before changing anything in src/lib/dedupe.ts.
 *
 *   npx tsx tools/dump-corpus.ts        # refresh tools/corpus.json from the DB
 *   npx tsx tools/tune-thresholds.ts
 *
 * Prefer a threshold with real margin over the one that maximises recall: a
 * value sitting a thousandth above the nearest false merge is fitted to this
 * eval set, not to the world.
 */
import { readFileSync } from "node:fs";
import { CLUSTER_EVAL } from "../tests/fixtures/cluster-eval";
import { significantTokens, titleKey } from "../src/lib/text";
const corpus: { headline: string }[] = JSON.parse(readFileSync("tools/corpus.json","utf8"));
const df = new Map<string,number>();
for (const r of corpus) for (const t of new Set(significantTokens(r.headline))) df.set(t,(df.get(t)??0)+1);
const N = corpus.length; const idf=(t:string)=>Math.log((N+1)/((df.get(t)??0)+1))+1;
const OMNIBUS=/\b(round[- ]?up|roundup|as it happened|wrap(?:[- ]up)?|recap|highlights|digest|briefing|in pictures|in photos|explainer|what we know|things to know|five things|quiz)\b|\blive(?:blog)?\s*[:|-]|^live\b|\blive updates?\b/i;
const RESULT=/\b(beat|beats|beaten|defeat|defeats|defeated|edge|edges|win|wins|won|thrash|thrashes|stun|stuns|victory|triumph|hold|held|draw with|drew)\b/i;
const PREVIEW=/\b(host|hosts|to face|face off|preview|clash with|take on|takes on|set to (?:play|face|meet)|vs\.?|versus)\b/i;
const isOmni=(s:string)=>OMNIBUS.test(s);
const stage=(a:string,b:string)=>{const ar=RESULT.test(a),ap=PREVIEW.test(a),br=RESULT.test(b),bp=PREVIEW.test(b);return (ar&&!ap&&bp&&!br)||(br&&!bp&&ap&&!ar);};
const nums=(s:string)=>new Set(s.match(/\b\d[\d,]*\b/g)??[]);
const numConflict=(a:string,b:string)=>{const A=nums(a),B=nums(b);if(!A.size||!B.size)return false;for(const n of A)if(B.has(n))return false;return true;};
function sig(a:string,b:string){const A=new Set(significantTokens(a)),B=new Set(significantTokens(b));let iw=0,wA=0,wB=0;for(const t of A){wA+=idf(t);if(B.has(t))iw+=idf(t);}for(const t of B)wB+=idf(t);const u=wA+wB-iw;return{wcont:wA&&wB?iw/Math.min(wA,wB):0,wjac:u?iw/u:0,sameKey:titleKey(a)===titleKey(b)};}

console.log("Unguarded DIFF pairs, sorted by wjac (these set the safety floor):\n");
const diffs = CLUSTER_EVAL.filter(p=>p.label==="DIFF")
  .filter(p=>!isOmni(p.a)&&!isOmni(p.b)&&!stage(p.a,p.b)&&!numConflict(p.a,p.b))
  .map(p=>({p,s:sig(p.a,p.b)})).sort((x,y)=>y.s.wjac-x.s.wjac);
for (const {p,s} of diffs.slice(0,6)) console.log(`  wjac=${s.wjac.toFixed(3)} wcont=${s.wcont.toFixed(3)}  ${p.a.slice(0,46)} || ${p.b.slice(0,46)}`);

console.log("\nRecall vs wj (hi=0.65, mid=0.45, all guards + numeric veto):\n");
console.log("  wj     P      R      F1    margin-to-nearest-FP");
for (const wj of [0.30,0.32,0.34,0.35,0.36,0.38,0.40,0.42]) {
  let tp=0,fp=0,fn=0;
  for (const p of CLUSTER_EVAL) {
    const s=sig(p.a,p.b);
    const yes=!isOmni(p.a)&&!isOmni(p.b)&&!stage(p.a,p.b)&&(s.sameKey||s.wcont>=0.65||(s.wcont>=0.45&&s.wjac>=wj&&!numConflict(p.a,p.b)));
    if(p.label==="SAME") yes?tp++:fn++; else if(yes) fp++;
  }
  const prec=tp+fp?tp/(tp+fp):1, rec=tp/(tp+fn);
  const margin = wj - (diffs[0]?.s.wjac ?? 0);
  console.log(`  ${wj.toFixed(2)}  ${prec.toFixed(3)}  ${rec.toFixed(3)}  ${((2*prec*rec)/(prec+rec||1)).toFixed(3)}   ${margin>=0?"+":""}${margin.toFixed(3)}`);
}
