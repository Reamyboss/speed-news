/**
 * Surfaces cross-source candidate pairs using a RECALL-oriented signal, so we
 * can see what the current (precision-biased) thresholds are missing.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { hammingDistance, significantTokens, tokenSimilarity } from "../src/lib/text";

interface Row {
  id: string; headline: string; category: string; publishedAt: string;
  titleKey: string; simhash: string; source: string; sourceName: string;
  clusterId: string | null;
}

const rows: Row[] = JSON.parse(readFileSync("tools/corpus.json", "utf8"));

// Document frequency over the corpus -> IDF. Common words ("nigeria", "police")
// must not carry the same weight as rare ones ("kainji", "aboyeji").
const df = new Map<string, number>();
for (const r of rows) {
  for (const t of new Set(significantTokens(r.headline))) df.set(t, (df.get(t) ?? 0) + 1);
}
const N = rows.length;
const idf = (t: string) => Math.log(N / ((df.get(t) ?? 0) + 1));

function containment(a: string, b: string) {
  const A = new Set(significantTokens(a)), B = new Set(significantTokens(b));
  if (!A.size || !B.size) return 0;
  let i = 0; for (const t of A) if (B.has(t)) i++;
  return i / Math.min(A.size, B.size);
}
function weighted(a: string, b: string) {
  const A = new Set(significantTokens(a)), B = new Set(significantTokens(b));
  if (!A.size || !B.size) return 0;
  let inter = 0, wA = 0, wB = 0;
  for (const t of A) { wA += idf(t); if (B.has(t)) inter += idf(t); }
  for (const t of B) wB += idf(t);
  return inter / Math.min(wA, wB);
}

const hours = (a: string, b: string) =>
  Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 3_600_000;

const out: any[] = [];
for (let i = 0; i < rows.length; i++) {
  for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i], b = rows[j];
    if (a.source === b.source) continue;          // cross-source only
    if (hours(a.publishedAt, b.publishedAt) > 72) continue;
    const w = weighted(a.headline, b.headline);
    if (w < 0.34) continue;
    out.push({
      w: +w.toFixed(3),
      cont: +containment(a.headline, b.headline).toFixed(3),
      jac: +tokenSimilarity(a.headline, b.headline).toFixed(3),
      ham: hammingDistance(a.simhash, b.simhash),
      sameKey: a.titleKey === b.titleKey,
      clustered: !!(a.clusterId && a.clusterId === b.clusterId),
      A: `[${a.source}] ${a.headline}`,
      B: `[${b.source}] ${b.headline}`,
      idA: a.id, idB: b.id,
    });
  }
}
out.sort((x, y) => y.w - x.w);
writeFileSync("tools/candidates.json", JSON.stringify(out, null, 1));
console.log("candidate cross-source pairs (weighted>=0.34):", out.length);
console.log("of which currently clustered:", out.filter((o) => o.clustered).length);
console.log("of which pass current gate (jac>=.6 | (jac>=.45 & ham<=22) | sameKey):",
  out.filter((o) => o.sameKey || o.jac >= 0.6 || (o.jac >= 0.45 && o.ham <= 22)).length);
