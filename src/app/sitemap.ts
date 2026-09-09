import type { MetadataRoute } from "next";
import { CATEGORIES } from "@/lib/taxonomy";
import { getRecentStorySlugs } from "@/lib/queries";
import { absoluteUrl } from "@/lib/env";

/**
 * Sitemap.
 *
 * Story URLs are capped: search engines penalise bloated sitemaps, and older
 * aggregated summaries have little standalone crawl value.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: absoluteUrl("/sources"), lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: absoluteUrl("/about"), lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: absoluteUrl("/advertise"), lastModified: now, changeFrequency: "monthly", priority: 0.4 },
  ];

  const categoryRoutes: MetadataRoute.Sitemap = CATEGORIES.map((slug) => ({
    url: absoluteUrl(`/category/${slug}`),
    lastModified: now,
    changeFrequency: "hourly",
    priority: 0.8,
  }));

  const stories = await getRecentStorySlugs(1500);
  const storyRoutes: MetadataRoute.Sitemap = stories.map((story) => ({
    url: absoluteUrl(`/story/${story.slug}`),
    lastModified: story.updatedAt,
    changeFrequency: "daily",
    priority: 0.7,
  }));

  return [...staticRoutes, ...categoryRoutes, ...storyRoutes];
}
