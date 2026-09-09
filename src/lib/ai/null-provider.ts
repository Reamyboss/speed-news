import type { AiProvider, EnrichmentResult } from "./types";

/**
 * The no-AI provider.
 *
 * It deliberately produces NOTHING rather than a synthesised "why it matters".
 * Every story already carries an extractive `summary` taken from the
 * publisher's own feed, so the page renders fully without this layer; writing
 * a machine-invented significance claim with no model behind it would be
 * exactly the fabrication the editorial rules forbid.
 *
 * This is what keeps "the website must still work if AI enrichment fails"
 * true by construction: the AI columns stay null and the UI omits those blocks.
 */
export class NullProvider implements AiProvider {
  readonly name = "none";
  readonly model = null;
  readonly isAvailable = false;

  private readonly reason: string;

  constructor(reason = "no AI provider configured") {
    this.reason = reason;
  }

  async enrich(): Promise<EnrichmentResult> {
    return {
      ok: false,
      provider: this.name,
      model: null,
      error: this.reason,
      retryable: false,
    };
  }
}
