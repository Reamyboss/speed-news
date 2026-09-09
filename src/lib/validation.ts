import { z } from "zod";
import {
  AI_STATUSES,
  CATEGORIES,
  LICENSE_MODES,
  REGIONS,
  SOURCE_STATUSES,
  SOURCE_TYPES,
  STORY_STATUSES,
  AD_PLACEMENTS,
  AD_PROVIDERS,
} from "./taxonomy";

/**
 * Runtime validation for everything that crosses a trust boundary: feed
 * payloads, seed data, API query strings and AI provider responses.
 *
 * The database has no enums (for SQLite/Postgres portability), so these
 * schemas are the enforcement point. Nothing writes a controlled-vocabulary
 * column without passing through here.
 */

export const sourceTypeSchema = z.enum(SOURCE_TYPES);
export const sourceStatusSchema = z.enum(SOURCE_STATUSES);
export const storyStatusSchema = z.enum(STORY_STATUSES);
export const aiStatusSchema = z.enum(AI_STATUSES);
export const licenseModeSchema = z.enum(LICENSE_MODES);
export const categorySchema = z.enum(CATEGORIES);
export const regionSchema = z.enum(REGIONS);
export const adPlacementSchema = z.enum(AD_PLACEMENTS);
export const adProviderSchema = z.enum(AD_PROVIDERS);

/** Only http(s) is ever accepted — blocks javascript:, data: and file: URLs. */
export const httpUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine((value) => {
    try {
      const { protocol } = new URL(value);
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  }, "must be an absolute http(s) URL");

export const sourceSeedSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be a lowercase kebab-case slug"),
  type: sourceTypeSchema,
  country: z.string().trim().length(2).toUpperCase(),
  region: z.string().trim().min(2).max(20),
  language: z.string().trim().min(2).max(10),
  categories: z
    .string()
    .trim()
    .min(1)
    .refine(
      (value) =>
        value
          .split(",")
          .map((c) => c.trim())
          .every((c) => (CATEGORIES as readonly string[]).includes(c)),
      "every entry must be a known category slug",
    ),
  url: httpUrlSchema,
  rssUrl: httpUrlSchema.optional(),
  apiUrl: httpUrlSchema.optional(),
  socialUrls: z.record(z.string(), httpUrlSchema).optional(),
  trustTier: z.number().int().min(1).max(5),
  status: sourceStatusSchema.optional(),
  license: licenseModeSchema.optional(),
  weight: z.number().int().min(0).max(100),
});

export type SourceSeedInput = z.infer<typeof sourceSeedSchema>;

/** The shape the ingest pipeline hands to the store. */
export const storyDraftSchema = z.object({
  headline: z.string().trim().min(12).max(240),
  summary: z.string().trim().min(1).max(1000),
  excerpt: z.string().trim().max(1200).nullable(),
  canonicalUrl: httpUrlSchema,
  sourceId: z.string().min(1),
  author: z.string().trim().max(120).nullable(),
  publishedAt: z.date(),
  category: categorySchema,
  region: regionSchema,
  imageUrl: httpUrlSchema.nullable(),
  importance: z.number().int().min(0).max(100),
  language: z.string().trim().min(2).max(10).default("en"),
});

export type StoryDraft = z.infer<typeof storyDraftSchema>;

/**
 * The contract an AI provider must satisfy. A response that fails this is
 * discarded and the story falls back to its extractive summary — a malformed
 * or hallucinated shape must never reach the page.
 */
export const aiEnrichmentSchema = z.object({
  summary: z.string().trim().min(20).max(900),
  whyItMatters: z.string().trim().min(20).max(900),
  bullets: z.array(z.string().trim().min(3).max(300)).max(6).default([]),
  entities: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        type: z
          .enum(["PERSON", "ORGANISATION", "PLACE", "EVENT", "POLICY", "OTHER"])
          .default("OTHER"),
      }),
    )
    .max(12)
    .default([]),
});

export type AiEnrichment = z.infer<typeof aiEnrichmentSchema>;

// ---------------------------------------------------------------------------
// Public request validation
// ---------------------------------------------------------------------------

/** Search input. Bounded length so a huge query cannot be used to stress the DB. */
export const searchQuerySchema = z.object({
  q: z.string().trim().max(120).default(""),
  category: z.string().trim().max(40).optional(),
  page: z.coerce.number().int().min(1).max(100).catch(1).default(1),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(500).catch(1).default(1),
});

/**
 * Strips characters that are meaningless for our LIKE-based search and could
 * otherwise widen a scan unnecessarily.
 */
export function sanitizeSearchTerm(input: string): string {
  return input
    .trim()
    .slice(0, 120)
    .replace(/[%_\\]/g, " ")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
