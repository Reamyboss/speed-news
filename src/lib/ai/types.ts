import type { AiEnrichment } from "../validation";

/**
 * AI provider abstraction.
 *
 * The rest of the application depends on this interface only, never on a
 * vendor SDK, so a provider can be swapped without touching the pipeline or
 * the UI. The contract is deliberately narrow: given the facts we already
 * hold about a story, return a summary and an explanation of significance.
 */

export interface EnrichmentRequest {
  headline: string;
  /** The extractive summary derived from the publisher's feed. */
  summary: string;
  /** A short attributed excerpt, when the feed provided one. */
  excerpt?: string | null;
  sourceName: string;
  sourceType: string;
  category: string;
  publishedAt: Date;
  /** Headlines from other sources covering the same event, if any. */
  relatedHeadlines?: string[];
}

/**
 * Token accounting for one enrichment call.
 *
 * Reported so cost is something we measure rather than assume — a run that
 * shows `cacheRead` stuck at zero means the shared system prompt is being
 * re-billed on every story and the caching has silently broken.
 */
export interface EnrichmentUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface EnrichmentSuccess {
  ok: true;
  data: AiEnrichment;
  provider: string;
  model: string;
  usage?: EnrichmentUsage;
}

export interface EnrichmentFailure {
  ok: false;
  provider: string;
  model: string | null;
  error: string;
  /** True when retrying later could plausibly succeed (rate limit, 5xx). */
  retryable: boolean;
}

export type EnrichmentResult = EnrichmentSuccess | EnrichmentFailure;

export interface AiProvider {
  readonly name: string;
  readonly model: string | null;
  /** False when the provider cannot run (no key, SDK missing, disabled). */
  readonly isAvailable: boolean;
  enrich(request: EnrichmentRequest): Promise<EnrichmentResult>;
}

/**
 * The editorial rules every provider must be held to.
 *
 * These exist because an aggregator's credibility collapses the first time it
 * attributes an invented claim to a real newsroom.
 */
export const EDITORIAL_RULES = `You are an editor at a Nigerian news intelligence service.

ABSOLUTE RULES — breaking any of these is a critical failure:
1. Use ONLY the facts contained in the material provided to you. Never add
   names, numbers, dates, quotes, locations or outcomes that are not present.
2. Never state or imply that the source said something it did not say.
3. If the material is too thin to explain significance, say plainly that the
   available reporting is limited rather than inventing context.
4. Do not speculate about motives, guilt, or future events. Describing openly
   stated next steps that appear in the material is fine.
5. Write about what is reported, not what you believe to be true from other
   knowledge. Your own background knowledge is NOT a source here.
6. Keep a neutral, professional register. No hype, no editorialising, no
   moral judgement, no exclamation marks.
7. Write in clear British/Nigerian English for a general Nigerian audience.`;
