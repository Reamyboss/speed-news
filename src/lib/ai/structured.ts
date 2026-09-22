import { aiEnrichmentSchema } from "../validation";
import { EDITORIAL_RULES, type EnrichmentRequest } from "./types";

export const AI_OUTPUT_JSON_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "A concise factual summary based only on supplied material.",
    },
    whyItMatters: {
      type: "string",
      description: "Why the reported development matters, using only supplied material.",
    },
    bullets: {
      type: "array",
      items: { type: "string" },
      maxItems: 6,
    },
    entities: {
      type: "array",
      maxItems: 12,
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

export function buildEnrichmentPrompt(request: EnrichmentRequest): string {
  return `${EDITORIAL_RULES}

Return ONLY JSON matching the supplied schema.

STORY MATERIAL
Headline: ${request.headline}
Extractive summary: ${request.summary}
Attributed excerpt: ${request.excerpt || "(none)"}
Source: ${request.sourceName}
Source type: ${request.sourceType}
Category: ${request.category}
Published at: ${request.publishedAt.toISOString()}

OTHER HEADLINES COVERING THE SAME EVENT:
${
  request.relatedHeadlines?.length
    ? request.relatedHeadlines.map((headline) => `- ${headline}`).join("\n")
    : "(none)"
}

TASK
Produce:
1. summary — a factual explanation of the reported story.
2. whyItMatters — explain its significance only from information available in the supplied material.
3. bullets — up to 6 useful factual points.
4. entities — people, organisations, places, events or policies explicitly present in the material.

Never fill gaps using outside knowledge.`;
}

export function parseEnrichment(
  raw: string,
): ReturnType<typeof aiEnrichmentSchema.parse> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("AI provider returned invalid JSON");
  }

  const result = aiEnrichmentSchema.safeParse(parsed);

  if (!result.success) {
    throw new Error(`AI output failed schema validation: ${result.error.message}`);
  }

  return result.data;
}
