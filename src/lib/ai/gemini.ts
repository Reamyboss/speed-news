import { GoogleGenAI } from "@google/genai";
import { AI_CONFIG } from "../env";
import { buildEnrichmentPrompt, parseEnrichment, AI_OUTPUT_JSON_SCHEMA } from "./structured";
import type {
  AiProvider,
  EnrichmentRequest,
  EnrichmentResult,
} from "./types";

export class GeminiProvider implements AiProvider {
  readonly name = "gemini";
  readonly model: string;
  readonly isAvailable: boolean;

  private readonly client: GoogleGenAI | null;

  constructor(
    apiKey: string,
    model = process.env.AI_GEMINI_MODEL || "gemini-3.6-flash",
  ) {
    this.model = model;
    this.isAvailable = Boolean(apiKey);
    this.client = apiKey ? new GoogleGenAI({ apiKey }) : null;
  }

  async enrich(request: EnrichmentRequest): Promise<EnrichmentResult> {
    if (!this.client) {
      return {
        ok: false,
        provider: this.name,
        model: this.model,
        error: "GEMINI_API_KEY is not set",
        retryable: false,
      };
    }

    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: buildEnrichmentPrompt(request),
        config: {
          responseMimeType: "application/json",
          responseSchema: AI_OUTPUT_JSON_SCHEMA,
        },
      });

      const data = parseEnrichment(response.text || "");

      const usage = response.usageMetadata;

      return {
        ok: true,
        provider: this.name,
        model: this.model,
        data,
        usage: {
          inputTokens: usage?.promptTokenCount ?? 0,
          outputTokens: usage?.candidatesTokenCount ?? 0,
          cacheReadTokens: usage?.cachedContentTokenCount ?? 0,
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

export function createGeminiProvider(): GeminiProvider {
  return new GeminiProvider(
    AI_CONFIG.geminiApiKey,
    AI_CONFIG.geminiModel,
  );
}
