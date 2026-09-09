import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AdSlot } from "@/components/ad-slot";
import { StoryCard, StoryRow, SourceLine } from "@/components/story-card";
import { getRelatedStories, getStoryBySlug, type StoryView } from "@/lib/queries";
import {
  CATEGORY_META,
  SOURCE_TYPE_META,
  TRUST_TIER_META,
  clampTrustTier,
  isCategory,
  isSourceType,
} from "@/lib/taxonomy";
import { breadcrumbJsonLd, newsArticleJsonLd, storyMetadata } from "@/lib/seo";
import { displayHost, formatDateTime, isoDate, relativeTime } from "@/lib/format";

export const revalidate = 600;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const story = await getStoryBySlug(slug);
  if (!story) {
    return { title: "Story not found", robots: { index: false, follow: true } };
  }
  return storyMetadata(story);
}

export default async function StoryPage({ params }: PageProps) {
  const { slug } = await params;
  const story = await getStoryBySlug(slug);
  if (!story) notFound();

  const related = await getRelatedStories(story);
  const categoryMeta = isCategory(story.category) ? CATEGORY_META[story.category] : null;

  return (
    <>
      <SiteHeader activeCategory={story.category} />

      <main id="main" className="shell py-5 sm:py-7">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(newsArticleJsonLd(story)) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(
              breadcrumbJsonLd([
                { name: "Home", path: "/" },
                ...(categoryMeta
                  ? [{ name: categoryMeta.name, path: `/category/${categoryMeta.slug}` }]
                  : []),
                { name: story.headline, path: `/story/${story.slug}` },
              ]),
            ),
          }}
        />

        <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
          <article className="lg:col-span-8">
            <Breadcrumbs story={story} />

            <header className="mt-3">
              {categoryMeta ? (
                <Link
                  href={`/category/${categoryMeta.slug}`}
                  className="kicker hover:underline"
                  style={{ color: categoryMeta.accent }}
                >
                  {categoryMeta.name}
                </Link>
              ) : null}

              <h1 className="mt-2 text-[1.875rem] leading-[1.13] sm:text-[2.5rem]">
                {story.headline}
              </h1>

              {story.dek ? (
                <p className="mt-3 font-serif text-lg leading-snug text-ink-soft sm:text-xl">
                  {story.dek}
                </p>
              ) : null}

              <Attribution story={story} />
            </header>

            {story.imageUrl ? (
              <figure className="mt-6">
                <div className="relative aspect-[16/9] w-full overflow-hidden rounded-sm bg-sunken">
                  <Image
                    src={story.imageUrl}
                    alt=""
                    fill
                    priority
                    sizes="(max-width: 1023px) 100vw, 66vw"
                    className="object-cover"
                  />
                </div>
                {story.imageCredit ? (
                  <figcaption className="mt-2 text-xs text-faint">
                    Photograph: {story.imageCredit}
                  </figcaption>
                ) : null}
              </figure>
            ) : null}

            <AiBriefing story={story} />

            <SourceExcerpt story={story} />

            <AdSlot slotKey="article-inline" className="my-8" />

            {related.sameEvent.length > 0 ? (
              <section className="mt-10">
                <div className="border-t-2 border-ink pt-3">
                  <h2 className="kicker text-ink">
                    Also reported by {related.sameEvent.length} other{" "}
                    {related.sameEvent.length === 1 ? "source" : "sources"}
                  </h2>
                </div>
                <p className="mt-2 text-sm text-muted">
                  Independent coverage of the same event. Comparing how
                  newsrooms report a story is often as informative as the story
                  itself.
                </p>
                <div className="mt-5 grid gap-6 sm:grid-cols-2 sm:gap-x-8">
                  {related.sameEvent.map((item) => (
                    <StoryCard key={item.id} story={item} />
                  ))}
                </div>
              </section>
            ) : null}

            {related.moreLikeThis.length > 0 ? (
              <section className="mt-10">
                <div className="border-t-2 border-ink pt-3">
                  <h2 className="kicker text-ink">
                    More in {categoryMeta?.name ?? "this section"}
                  </h2>
                </div>
                <div className="mt-5 grid gap-6 sm:grid-cols-2 sm:gap-x-8">
                  {related.moreLikeThis.map((item) => (
                    <StoryCard key={item.id} story={item} />
                  ))}
                </div>
              </section>
            ) : null}
          </article>

          <aside className="lg:col-span-4">
            <SourcePanel story={story} />

            {story.ai.entities.length > 0 ? (
              <section className="mt-8">
                <h2 className="kicker border-t-2 border-ink pt-3 text-ink">
                  In this story
                </h2>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {story.ai.entities.map((entity) => (
                    <li key={`${entity.type}-${entity.name}`}>
                      <Link
                        href={`/search?q=${encodeURIComponent(entity.name)}`}
                        className="inline-block rounded-full border border-rule bg-surface px-3 py-1 text-xs text-ink-soft hover:border-accent hover:text-accent"
                      >
                        {entity.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {related.moreLikeThis.length > 0 ? (
              <section className="mt-8">
                <h2 className="kicker border-t-2 border-ink pt-3 text-ink">Latest</h2>
                <div className="mt-4 space-y-3">
                  {related.moreLikeThis.slice(0, 5).map((item) => (
                    <StoryRow key={item.id} story={item} />
                  ))}
                </div>
              </section>
            ) : null}

            <AdSlot slotKey="sidebar-primary" className="mt-8" />
          </aside>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}

function Breadcrumbs({ story }: { story: StoryView }) {
  const meta = isCategory(story.category) ? CATEGORY_META[story.category] : null;
  return (
    <nav aria-label="Breadcrumb" className="text-xs text-faint">
      <ol className="flex flex-wrap items-center gap-1.5">
        <li>
          <Link href="/" className="hover:text-accent hover:underline">
            Home
          </Link>
        </li>
        {meta ? (
          <>
            <li aria-hidden>/</li>
            <li>
              <Link
                href={`/category/${meta.slug}`}
                className="hover:text-accent hover:underline"
              >
                {meta.name}
              </Link>
            </li>
          </>
        ) : null}
      </ol>
    </nav>
  );
}

/** The byline block. Attribution is the product's core promise. */
function Attribution({ story }: { story: StoryView }) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 border-y border-rule py-3 text-sm">
      <span className="text-muted">Reported by</span>
      <a
        href={story.source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-accent hover:underline"
      >
        {story.source.name}
      </a>
      {story.author ? <span className="text-muted">&middot; {story.author}</span> : null}
      <span aria-hidden className="text-rule-strong">
        &middot;
      </span>
      <time dateTime={isoDate(story.publishedAt)} className="text-muted">
        {formatDateTime(story.publishedAt)}
      </time>
      <span className="text-faint">({relativeTime(story.publishedAt)})</span>
    </div>
  );
}

/**
 * The AI layer.
 *
 * Rendered inside a visually distinct panel and explicitly labelled, because
 * the one thing an aggregator must never do is let a machine-written sentence
 * read as something the newsroom said. If enrichment has not run, or failed,
 * this returns null and the page is still complete.
 */
function AiBriefing({ story }: { story: StoryView }) {
  if (!story.ai.isEnriched) return null;

  return (
    <section
      aria-labelledby="ai-briefing-heading"
      className="mt-7 rounded-sm border border-rule bg-surface p-5 sm:p-6"
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full bg-accent"
        />
        <h2 id="ai-briefing-heading" className="kicker text-accent">
          AI briefing
        </h2>
      </div>

      {story.ai.summary ? (
        <p className="mt-3 font-serif text-lg leading-relaxed text-ink sm:text-xl">
          {story.ai.summary}
        </p>
      ) : null}

      {story.ai.bullets.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {story.ai.bullets.map((bullet) => (
            <li key={bullet} className="flex gap-2.5 text-sm leading-relaxed text-ink-soft">
              <span aria-hidden className="mt-[0.45rem] h-1 w-1 flex-none rounded-full bg-accent" />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {story.ai.whyItMatters ? (
        <div className="mt-5 border-t border-rule pt-4">
          <h3 className="kicker text-ink">Why this matters</h3>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-soft">
            {story.ai.whyItMatters}
          </p>
        </div>
      ) : null}

      <p className="mt-5 text-xs leading-relaxed text-faint">
        Written by AI from {story.source.name}&rsquo;s reporting, not by the
        newsroom. It is a summary of that report and may contain errors &mdash;
        the source article is authoritative.
      </p>
    </section>
  );
}

/**
 * A short attributed excerpt plus a prominent link out.
 *
 * We never reproduce a full article: the excerpt is capped at ingest, and the
 * call to action sends the reader to the publisher.
 */
function SourceExcerpt({ story }: { story: StoryView }) {
  const text = story.excerpt ?? story.summary;

  return (
    <section className="mt-8">
      <h2 className="kicker border-t-2 border-ink pt-3 text-ink">
        From the source
      </h2>

      <blockquote className="prose-editorial mt-4 border-l-2 border-rule-strong pl-4">
        <p>{text}</p>
      </blockquote>

      <p className="mt-3 text-xs text-faint">
        Excerpt from {story.source.name}. Reproduced in part for attribution and
        review; copyright remains with the publisher.
      </p>

      <a
        href={story.canonicalUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-5 inline-flex items-center gap-2 rounded-sm bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-deep"
      >
        Read the full story at {story.source.name}
        <span aria-hidden>&rarr;</span>
      </a>
      <p className="mt-2 text-xs text-faint">
        Opens {displayHost(story.canonicalUrl)} in a new tab.
      </p>
    </section>
  );
}

/** Sidebar panel explaining what kind of source this is. */
function SourcePanel({ story }: { story: StoryView }) {
  const typeMeta = isSourceType(story.source.type)
    ? SOURCE_TYPE_META[story.source.type]
    : null;
  const tier = clampTrustTier(story.source.trustTier);
  const tierMeta = TRUST_TIER_META[tier];

  return (
    <section className="rounded-sm border border-rule bg-surface p-5">
      <h2 className="kicker text-faint">About this source</h2>

      <a
        href={story.source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 block font-serif text-xl font-bold text-ink hover:text-accent"
      >
        {story.source.name}
      </a>

      {typeMeta ? (
        <>
          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-accent">
            {typeMeta.label}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            {typeMeta.description}
          </p>
        </>
      ) : null}

      <dl className="mt-4 border-t border-rule pt-3 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted">Confidence</dt>
          <dd className="font-semibold text-ink">{tierMeta.label}</dd>
        </div>
        <dd className="mt-1 text-xs leading-relaxed text-faint">
          {tierMeta.description}
        </dd>
      </dl>

      <Link
        href="/sources"
        className="mt-4 inline-block text-xs font-semibold text-accent hover:underline"
      >
        See all sources &rarr;
      </Link>
    </section>
  );
}
