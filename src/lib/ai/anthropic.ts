import { aiEnrichmentSchema } from "../validation";
import { toSingleLine, truncate } from "../text";
import {
  EDITORIAL_RULES,
  type AiProvider,
  type EnrichmentRequest,
  type EnrichmentResult,
} from "./types";

/**
 * Anthropic-backed enrichment.
 *
 * The SDK is an optional dependency and is imported dynamically, so a
 * deployment without it (or without an API key) still builds and serves —
 * `isAvailable` simply reports false and the pipeline uses the fallback.
 */

/** Bounded so a pathological feed item cannot blow up a request. */
const MAX_INPUT_CHARS = 4_000;

interface AnthropicResponseLike {
  content: Array<{ type: string; text?: string }>;
  stop_reason?: string | null;
  stop_details?: { category?: string | null; explanation?: string | null } | null;
  model?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

interface AnthropicClientLike {
  messages: {
    create(body: Record<string, unknown>): Promise<AnthropicResponseLike>;
  };
}

/**
 * The response shape we ask the model for, as a JSON Schema.
 *
 * This is the same contract `aiEnrichmentSchema` enforces, expressed for
 * `output_config.format` so the API constrains generation rather than us
 * hoping the model returns clean JSON. Zod still validates the result
 * afterwards: structured output guarantees the SHAPE, but the length limits
 * and the entity-type vocabulary are ours to enforce, and a schema the model
 * satisfies is not automatically a schema we accept.
 */
const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "2-3 sentences, max 600 characters. What happened, in plain language.",
    },
    whyItMatters: {
      type: "string",
      description:
        "2-3 sentences, max 600 characters. Why a Nigerian reader should care — the practical " +
        "consequence. If the material is too limited to establish significance, say exactly that.",
    },
    bullets: {
      type: "array",
      description: "Up to 4 short factual key points drawn only from the material provided.",
      items: { type: "string" },
    },
    entities: {
      type: "array",
      description: "People, organisations and places named in the material provided.",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          type: {
            type: "string",
            enum: ["PERSON", "ORGANISATION", "PLACE", "EVENT", "POLICY", "OTHER"],
          },
        },
        required: ["name", "type"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "whyItMatters", "bullets", "entities"],
  additionalProperties: false,
} as const;

export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";
  readonly model: string;
  private client: AnthropicClientLike | null = null;
  private clientPromise: Promise<AnthropicClientLike | null> | null = null;
  private readonly apiKey: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  get isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  /**
   * Loads the SDK lazily and only once. A missing package is a normal,
   * expected state rather than an error — enrichment is optional.
   */
  private async getClient(): Promise<AnthropicClientLike | null> {
    if (this.client) return this.client;
    if (!this.apiKey) return null;

    this.clientPromise ??= (async () => {
      try {
        const mod = await import("@anthropic-ai/sdk");
        const Anthropic = (mod.default ?? mod) as unknown as new (options: {
          apiKey: string;
          maxRetries?: number;
          timeout?: number;
        }) => AnthropicClientLike;
        return new Anthropic({
          apiKey: this.apiKey,
          maxRetries: 2,
          timeout: 60_000, // milliseconds in the TypeScript SDK
        });
      } catch (error) {
        console.error(
          "[ai] @anthropic-ai/sdk unavailable:",
          error instanceof Error ? error.message : error,
        );
        return null;
      }
    })();

    this.client = await this.clientPromise;
    return this.client;
  }

  async enrich(request: EnrichmentRequest): Promise<EnrichmentResult> {
    const client = await this.getClient();
    if (!client) {
      return {
        ok: false,
        provider: this.name,
        model: this.model,
        error: "anthropic client unavailable (missing api key or sdk)",
        retryable: false,
      };
    }

    try {
      const response = await client.messages.create({
        model: this.model,
        max_tokens: 8_000,
        // The editorial rules are byte-identical on every story, so they are
        // cached rather than re-billed several hundred times a day. This is
        // the whole prefix: `system` is rendered before `messages`, and the
        // per-story prompt sits after it, so the cache stays warm across the
        // batch. Verified via usage.cache_read_input_tokens below.
        system: [
          {
            type: "text",
            text: `${EDITORIAL_RULES}\n\n${OUTPUT_CONTRACT}`,
            cache_control: { type: "ephemeral" },
          },
        ],
        // Bulk enrichment over short inputs: low effort is the right cost /
        // quality point and keeps the pipeline fast.
        output_config: {
          effort: "low",
          // Constrain generation to the contract instead of asking politely
          // for JSON and parsing whatever comes back.
          format: { type: "json_schema", schema: OUTPUT_SCHEMA },
        },
        messages: [{ role: "user", content: buildPrompt(request) }],
      });

      // A policy refusal is a normal outcome, not an exception.
      if (response.stop_reason === "refusal") {
        return {
          ok: false,
          provider: this.name,
          model: this.model,
          error: `refused: ${response.stop_details?.category ?? "unspecified"}`,
          retryable: false,
        };
      }

      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text ?? "")
        .join("")
        .trim();

      if (!text) {
        return {
          ok: false,
          provider: this.name,
          model: this.model,
          error: "empty response",
          retryable: true,
        };
      }

      const parsed = extractJson(text);
      if (!parsed) {
        return {
          ok: false,
          provider: this.name,
          model: this.model,
          error: "response was not valid JSON",
          retryable: true,
        };
      }

      // The schema is the gate: a malformed or over-long response is
      // discarded rather than rendered.
      const validated = aiEnrichmentSchema.safeParse(parsed);
      if (!validated.success) {
        return {
          ok: false,
          provider: this.name,
          model: this.model,
          error: `schema rejected: ${validated.error.issues[0]?.message ?? "unknown"}`,
          retryable: true,
        };
      }

      return {
        ok: true,
        data: validated.data,
        provider: this.name,
        model: response.model ?? this.model,
        usage: {
          inputTokens: response.usage?.input_tokens ?? 0,
          outputTokens: response.usage?.output_tokens ?? 0,
          cacheReadTokens: response.usage?.cache_read_input_tokens ?? 0,
          cacheWriteTokens: response.usage?.cache_creation_input_tokens ?? 0,
        },
      };
    } catch (error) {
      return {
        ok: false,
        provider: this.name,
        model: this.model,
        ...classifyError(error),
      };
    }
  }
}

const OUTPUT_CONTRACT = `Respond with a single JSON object and nothing else. No
markdown fences, no commentary before or after.

{
  "summary": "2-3 sentences, max 600 characters. What happened, in plain language.",
  "whyItMatters": "2-3 sentences, max 600 characters. Why a Nigerian reader should care — the practical consequence. If the material is too limited to establish significance, say exactly that.",
  "bullets": ["up to 4 short factual key points drawn only from the material"],
  "entities": [{"name": "...", "type": "PERSON|ORGANISATION|PLACE|EVENT|POLICY|OTHER"}]
}`;

function buildPrompt(request: EnrichmentRequest): string {
  const parts = [
    `SOURCE: ${request.sourceName} (${request.sourceType})`,
    `CATEGORY: ${request.category}`,
    `PUBLISHED: ${request.publishedAt.toISOString()}`,
    "",
    `HEADLINE: ${truncate(toSingleLine(request.headline), 300)}`,
    "",
    `REPORTED MATERIAL:\n${truncate(toSingleLine(request.excerpt || request.summary), MAX_INPUT_CHARS)}`,
  ];

  if (request.relatedHeadlines?.length) {
    parts.push(
      "",
      "OTHER SOURCES REPORTING THE SAME EVENT (headlines only — use as corroboration, do not treat their wording as facts):",
      ...request.relatedHeadlines.slice(0, 5).map((h) => `- ${truncate(toSingleLine(h), 200)}`),
    );
  }

  return parts.join("\n");
}

/**
 * Pulls a JSON object out of a model response, tolerating a stray code fence
 * or a leading sentence without accepting arbitrary prose.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();

  const direct = tryParse(trimmed);
  if (direct !== undefined) return direct;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const parsed = tryParse(fenced[1].trim());
    if (parsed !== undefined) return parsed;
  }

  // Fall back to the outermost balanced object.
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) {
    const parsed = tryParse(trimmed.slice(start, end + 1));
    if (parsed !== undefined) return parsed;
  }

  return null;
}

function tryParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/**
 * Maps SDK errors onto our retryable/terminal split without string-matching
 * message text. Rate limits and 5xx are worth another pass; 400/401 are not.
 */
function classifyError(error: unknown): { error: string; retryable: boolean } {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status?: unknown }).status)
      : undefined;
  const message = error instanceof Error ? error.message : String(error);

  if (status === 429) return { error: `rate limited: ${message}`, retryable: true };
  if (status !== undefined && status >= 500) {
    return { error: `upstream ${status}: ${message}`, retryable: true };
  }
  if (status === 401 || status === 403) {
    return { error: `auth failed: ${message}`, retryable: false };
  }
  if (status === 400) return { error: `bad request: ${message}`, retryable: false };

  // Network/timeout errors have no status and are worth retrying.
  return { error: message, retryable: status === undefined };
}
