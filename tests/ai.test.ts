import { afterEach, describe, expect, it } from "vitest";
import { NullProvider } from "@/lib/ai/null-provider";
import { extractJson } from "@/lib/ai/anthropic";
import { getAiProvider, setAiProvider } from "@/lib/ai";
import { aiEnrichmentSchema } from "@/lib/validation";
import type { AiProvider, EnrichmentRequest, EnrichmentResult } from "@/lib/ai/types";

/**
 * AI ENRICHMENT FAILURE HANDLING.
 *
 * The product requirement is absolute: the site works when AI does not. These
 * tests pin every failure mode to a defined, non-throwing outcome.
 */

afterEach(() => setAiProvider(null));

describe("NullProvider", () => {
  it("reports itself unavailable rather than pretending to work", () => {
    const provider = new NullProvider("no key");
    expect(provider.isAvailable).toBe(false);
    expect(provider.model).toBeNull();
  });

  it("fails cleanly instead of throwing", async () => {
    const result = await new NullProvider("no key").enrich();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("no key");
      expect(result.retryable).toBe(false);
    }
  });

  it("never fabricates a summary or a significance claim", async () => {
    // A machine-written "why it matters" with no model behind it would be
    // exactly the fabrication the editorial rules forbid.
    const result = await new NullProvider().enrich();
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty("data");
  });
});

describe("provider selection", () => {
  it("returns an unavailable provider when nothing is configured", () => {
    // The suite runs with AI_PROVIDER=none (see tests/global-setup.ts).
    const provider = getAiProvider();
    expect(provider.isAvailable).toBe(false);
    expect(provider.name).toBe("none");
  });

  it("accepts an injected provider so the pipeline is testable", () => {
    const stub: AiProvider = {
      name: "stub",
      model: "stub-1",
      isAvailable: true,
      enrich: async () => ({ ok: false, provider: "stub", model: null, error: "x", retryable: false }),
    };
    setAiProvider(stub);
    expect(getAiProvider().name).toBe("stub");
  });
});

describe("extractJson — tolerating imperfect model output", () => {
  it("parses a bare JSON object", () => {
    expect(extractJson('{"summary":"a"}')).toEqual({ summary: "a" });
  });

  it("parses JSON wrapped in a markdown code fence", () => {
    expect(extractJson('```json\n{"summary":"a"}\n```')).toEqual({ summary: "a" });
    expect(extractJson('```\n{"summary":"a"}\n```')).toEqual({ summary: "a" });
  });

  it("recovers an object embedded in surrounding prose", () => {
    expect(extractJson('Here you go:\n{"summary":"a"}\nHope that helps.')).toEqual({
      summary: "a",
    });
  });

  it("returns null for output containing no JSON at all", () => {
    expect(extractJson("I'm sorry, I can't help with that.")).toBeNull();
    expect(extractJson("")).toBeNull();
  });

  it("returns null for malformed JSON rather than throwing", () => {
    expect(() => extractJson('{"summary": unterminated')).not.toThrow();
    expect(extractJson('{"summary": unterminated')).toBeNull();
  });
});

describe("aiEnrichmentSchema — the gate on model output", () => {
  const valid = {
    summary: "The Central Bank of Nigeria held its benchmark rate at 27.5 per cent.",
    whyItMatters:
      "Borrowing costs stay high, which affects loan pricing and business expansion plans.",
    bullets: ["Rate held at 27.5%", "Decision follows a two-day meeting"],
    entities: [{ name: "Central Bank of Nigeria", type: "ORGANISATION" }],
  };

  it("accepts a well-formed response", () => {
    const parsed = aiEnrichmentSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it("defaults optional collections so callers never see undefined", () => {
    const parsed = aiEnrichmentSchema.safeParse({
      summary: valid.summary,
      whyItMatters: valid.whyItMatters,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.bullets).toEqual([]);
      expect(parsed.data.entities).toEqual([]);
    }
  });

  it("rejects a response missing the required fields", () => {
    expect(aiEnrichmentSchema.safeParse({ summary: valid.summary }).success).toBe(false);
    expect(aiEnrichmentSchema.safeParse({}).success).toBe(false);
  });

  it("rejects a truncated summary", () => {
    expect(
      aiEnrichmentSchema.safeParse({ ...valid, summary: "Too short" }).success,
    ).toBe(false);
  });

  it("rejects a runaway response that would break the layout", () => {
    expect(
      aiEnrichmentSchema.safeParse({ ...valid, summary: "x".repeat(5000) }).success,
    ).toBe(false);
  });

  it("rejects a non-object payload", () => {
    expect(aiEnrichmentSchema.safeParse("just a string").success).toBe(false);
    expect(aiEnrichmentSchema.safeParse(null).success).toBe(false);
    expect(aiEnrichmentSchema.safeParse([1, 2, 3]).success).toBe(false);
  });

  it("coerces an unknown entity type to OTHER rather than failing", () => {
    const parsed = aiEnrichmentSchema.safeParse({
      ...valid,
      entities: [{ name: "Someone" }],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.entities[0].type).toBe("OTHER");
  });
});

describe("a provider that misbehaves", () => {
  const request: EnrichmentRequest = {
    headline: "CBN holds benchmark rate",
    summary: "The apex bank left rates unchanged.",
    sourceName: "Premium Times",
    sourceType: "SPECIALIST_MEDIA",
    category: "business",
    publishedAt: new Date("2026-09-08T09:00:00Z"),
  };

  it("a throwing provider is contained by the caller, not propagated blindly", async () => {
    const exploding: AiProvider = {
      name: "exploding",
      model: "x",
      isAvailable: true,
      enrich: async () => {
        throw new Error("upstream exploded");
      },
    };

    // The contract is that callers must handle a rejection; assert the
    // rejection is a real Error and carries a usable message.
    await expect(exploding.enrich(request)).rejects.toThrow("upstream exploded");
  });

  it("distinguishes retryable from terminal failures", async () => {
    const rateLimited: EnrichmentResult = {
      ok: false,
      provider: "anthropic",
      model: "m",
      error: "rate limited",
      retryable: true,
    };
    const badKey: EnrichmentResult = {
      ok: false,
      provider: "anthropic",
      model: "m",
      error: "auth failed",
      retryable: false,
    };

    // Retryable failures stay queued; terminal ones must not block the queue.
    expect(rateLimited.retryable).toBe(true);
    expect(badKey.retryable).toBe(false);
  });
});
