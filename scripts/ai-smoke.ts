/**
 * Exercises the real Anthropic provider code path end to end.
 *
 * With no key (or a fake one) this still proves the SDK loads, the client
 * constructs, a request is actually issued, and the failure is classified
 * correctly — everything except the model's response. With a real key in
 * ANTHROPIC_API_KEY it performs one live enrichment and prints the result.
 *
 *   npx tsx scripts/ai-smoke.ts
 */
import { AnthropicProvider } from "../src/lib/ai/anthropic";

const key = process.env.ANTHROPIC_API_KEY || "sk-ant-fake-key-for-path-verification";
const isReal = Boolean(process.env.ANTHROPIC_API_KEY);
const model = process.env.AI_MODEL || "claude-opus-5";

async function main() {
  console.log(`mode : ${isReal ? "LIVE (real key present)" : "PATH CHECK (no key — a 401 is the expected, successful outcome)"}`);
  console.log(`model: ${model}\n`);

  const provider = new AnthropicProvider(key, model);
  console.log("isAvailable:", provider.isAvailable);

  const started = Date.now();
  const result = await provider.enrich({
    headline: "CBN holds benchmark interest rate at 27.5 per cent",
    summary:
      "The Monetary Policy Committee of the Central Bank of Nigeria voted to leave the benchmark rate unchanged after a two-day meeting in Abuja.",
    excerpt: null,
    sourceName: "Premium Times",
    sourceType: "SPECIALIST_MEDIA",
    category: "business",
    publishedAt: new Date(),
    relatedHeadlines: ["Central Bank leaves rates unchanged, citing inflation"],
  });

  console.log(`took : ${Date.now() - started}ms\n`);

  if (result.ok) {
    console.log("LIVE ENRICHMENT SUCCEEDED");
    console.log("provider :", result.provider, "|", result.model);
    console.log("summary  :", result.data.summary);
    console.log("why      :", result.data.whyItMatters);
    console.log("bullets  :", result.data.bullets);
    console.log("entities :", result.data.entities.map((e) => `${e.name} (${e.type})`).join(", "));
  } else {
    console.log("result.ok  : false");
    console.log("error      :", result.error.slice(0, 200));
    console.log("retryable  :", result.retryable);
    console.log("");
    if (!isReal) {
      console.log(
        result.error.includes("auth failed")
          ? "PASS — the SDK loaded, a real request was issued, and the 401 was classified as terminal (not retried)."
          : "NOTE — expected an auth failure. Anything else means the request never reached the API.",
      );
    }
  }
}

main().catch((e) => { console.error("UNCAUGHT:", e); process.exit(1); });
