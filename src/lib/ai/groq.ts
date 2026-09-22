import Groq from "groq-sdk";
import { AI_CONFIG } from "../env";
import {
  AI_OUTPUT_JSON_SCHEMA,
  buildEnrichmentPrompt,
  parseEnrichment,
} from "./structured";
import type {
  AiProvider,
  EnrichmentRequest,
  EnrichmentResult,
} from "./types";

export class GroqProvider implements AiProvider {
  readonly name = "groq";
  readonly model: string;
  readonly isAvailable: boolean;

  private readonly client: Groq | null;

  constructor(
    apiKey: string,
    model = process.env.AI_GROQ_MODEL || "openai/gpt-oss-20b",
  ) {
    this.model = model;
    this.isAvailable = Boolean(apiKey);
    this.client = apiKey ? new Groq({ apiKey }) : null;
  }

  async enrich(request: EnrichmentRequest): Promise<EnrichmentResult> {
    if (!this.client) {
      return {
        ok: false,
        provider: this.name,
        model: this.model,
        error: "GROQ_API_KEY is not set",
        retryable: false,
      };
    }

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content:
              "You are a strict JSON-producing Nigerian news editor. " +
              "Follow the user's editorial rules exactly.",
          },
          {
            role: "user",
            content: buildEnrichmentPrompt(request),
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "news_enrichment",
            strict: true,
            schema: AI_OUTPUT_JSON_SCHEMA,
          },
        },
      });

      const content = response.choices[0]?.message?.content || "";
      const data = parseEnrichment(content);
      const usage = response.usage;
      const cached =
        usage && "prompt_tokens_details" in usage
          ? (
              usage.prompt_tokens_details as
                | { cached_tokens?: number }
                | undefined
            )?.cached_tokens ?? 0
          : 0;

      return {
        ok: true,
        provider: this.name,
        model: this.model,
        data,
        usage: {
          inputTokens: usage?.prompt_tokens ?? 0,
          outputTokens: usage?.completion_tokens ?? 0,
          cacheReadTokens: cached,
          cacheWriteTokens: 0,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryable = /429|rate.?limit|5\d\d|timeout|temporar/i.test(message);

      return {
        ok: false,
        provider: this.name,
        model: this.model,
        error: message.slice(0, 400),
        retryable,
      };
    }
  }
}

export function createGroqProvider(): GroqProvider {
  return new GroqProvider(
    AI_CONFIG.groqApiKey,
    AI_CONFIG.groqModel,
  );
}
