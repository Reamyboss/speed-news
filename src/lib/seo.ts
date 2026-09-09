import type { Metadata } from "next";
import { SITE_DESCRIPTION, SITE_LOCALE, SITE_NAME, SITE_URL, absoluteUrl } from "./env";
import { CATEGORY_META, type Category } from "./taxonomy";
import { truncate, toSingleLine } from "./text";
import type { StoryView } from "./queries";

/**
 * Metadata, canonical URLs and structured data.
 *
 * Aggregators live or die by search, so every page gets a canonical URL, a
 * real description, Open Graph and Twitter cards. Story pages additionally
 * emit NewsArticle JSON-LD that names the ORIGINAL publisher — misattributing
 * authorship to ourselves would be both wrong and a ranking risk.
 */

const OG_IMAGE = {
  url: absoluteUrl("/opengraph-image"),
  width: 1200,
  height: 630,
  alt: SITE_NAME,
};

export function buildMetadata(options: {
  title: string;
  description: string;
  path: string;
  type?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
  section?: string;
  images?: Array<{ url: string; width?: number; height?: number; alt?: string }>;
  noIndex?: boolean;
}): Metadata {
  const canonical = absoluteUrl(options.path);
  const description = truncate(toSingleLine(options.description), 300);
  const images = options.images?.length ? options.images : [OG_IMAGE];

  return {
    title: options.title,
    description,
    alternates: { canonical },
    robots: options.noIndex
      ? { index: false, follow: true }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            "max-image-preview": "large",
            "max-snippet": -1,
            "max-video-preview": -1,
          },
        },
    openGraph: {
      type: options.type ?? "website",
      title: options.title,
      description,
      url: canonical,
      siteName: SITE_NAME,
      locale: SITE_LOCALE,
      images,
      ...(options.type === "article"
        ? {
            publishedTime: options.publishedTime,
            modifiedTime: options.modifiedTime,
            section: options.section,
          }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: options.title,
      description,
      images: images.map((image) => image.url),
    },
  };
}

export function categoryMetadata(category: Category, page = 1): Metadata {
  const meta = CATEGORY_META[category];
  const suffix = page > 1 ? ` — Page ${page}` : "";

  return buildMetadata({
    title: `${meta.seoTitle}${suffix}`,
    description: meta.seoDescription,
    path: page > 1 ? `/category/${meta.slug}?page=${page}` : `/category/${meta.slug}`,
    section: meta.name,
    // Deep pagination adds no unique value for search.
    noIndex: page > 3,
  });
}

export function storyMetadata(story: StoryView): Metadata {
  const description = story.ai.summary ?? story.summary;

  return buildMetadata({
    title: story.headline,
    description,
    path: `/story/${story.slug}`,
    type: "article",
    publishedTime: story.publishedAt.toISOString(),
    modifiedTime: story.updatedAt.toISOString(),
    section: story.category,
    images: story.imageUrl
      ? [{ url: story.imageUrl, alt: story.headline }]
      : undefined,
  });
}

// ---------------------------------------------------------------------------
// Structured data
// ---------------------------------------------------------------------------

/**
 * NewsArticle for a story page.
 *
 * `author` and `publisher` are set to the ORIGINAL newsroom, and `isBasedOn`
 * points at their article, which is the accurate description of what this page
 * is: a summary of someone else's reporting.
 */
export function newsArticleJsonLd(story: StoryView) {
  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: truncate(story.headline, 110),
    description: truncate(toSingleLine(story.ai.summary ?? story.summary), 300),
    datePublished: story.publishedAt.toISOString(),
    dateModified: story.updatedAt.toISOString(),
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": absoluteUrl(`/story/${story.slug}`),
    },
    ...(story.imageUrl ? { image: [story.imageUrl] } : {}),
    author: [
      {
        "@type": story.author ? "Person" : "Organization",
        name: story.author ?? story.source.name,
        ...(story.author ? {} : { url: story.source.url }),
      },
    ],
    publisher: {
      "@type": "Organization",
      name: story.source.name,
      url: story.source.url,
    },
    isBasedOn: story.canonicalUrl,
    articleSection: CATEGORY_META[story.category as Category]?.name ?? story.category,
    inLanguage: "en-NG",
  };
}

export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "NewsMediaOrganization",
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    logo: { "@type": "ImageObject", url: absoluteUrl("/icon") },
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export function itemListJsonLd(stories: StoryView[], name: string) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    itemListElement: stories.slice(0, 20).map((story, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: absoluteUrl(`/story/${story.slug}`),
      name: truncate(story.headline, 110),
    })),
  };
}
