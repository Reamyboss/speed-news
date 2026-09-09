import Link from "next/link";
import Image from "next/image";
import type { StoryView } from "@/lib/queries";
import { CATEGORY_META, SOURCE_TYPE_META, isCategory, isSourceType } from "@/lib/taxonomy";
import { isoDate, relativeTime } from "@/lib/format";

/**
 * Story cards.
 *
 * Three variants share one attribution treatment, because the source line is
 * the product's core promise — a reader must always be able to see who
 * reported something before deciding what to think of it.
 */

interface StoryCardProps {
  story: StoryView;
  /** Prioritise the image for the LCP element (the homepage lead only). */
  priority?: boolean;
  now?: Date;
}

export function SourceLine({
  story,
  className = "",
  showType = false,
}: {
  story: StoryView;
  className?: string;
  showType?: boolean;
}) {
  const typeMeta = isSourceType(story.source.type)
    ? SOURCE_TYPE_META[story.source.type]
    : null;

  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-xs ${className}`}>
      <span className="font-semibold text-accent">{story.source.name}</span>
      {showType && typeMeta ? (
        <span className="text-faint">{typeMeta.label}</span>
      ) : null}
      <span aria-hidden className="text-rule-strong">
        &middot;
      </span>
      <time dateTime={isoDate(story.publishedAt)} className="text-muted">
        {relativeTime(story.publishedAt)}
      </time>
    </div>
  );
}

export function CategoryKicker({ category }: { category: string }) {
  if (!isCategory(category)) return null;
  const meta = CATEGORY_META[category];
  return (
    <Link
      href={`/category/${meta.slug}`}
      className="kicker text-accent hover:underline"
      style={{ color: meta.accent }}
    >
      {meta.name}
    </Link>
  );
}

/**
 * The single largest story on the page.
 *
 * `asPageHeading` makes the headline the page's <h1>. The homepage has no
 * other candidate — its title is the lead story — and a page without an h1
 * gives screen-reader users no landmark to orient by and search engines no
 * primary heading. Pages that already own an <h1> (category, search) leave
 * this off so the document keeps a single top-level heading.
 */
export function LeadStoryCard({
  story,
  priority = true,
  asPageHeading = false,
}: StoryCardProps & { asPageHeading?: boolean }) {
  const Heading = asPageHeading ? "h1" : "h2";
  return (
    <article className="group">
      {story.imageUrl ? (
        <Link href={`/story/${story.slug}`} className="block" tabIndex={-1} aria-hidden>
          <div className="relative mb-4 aspect-[16/9] w-full overflow-hidden rounded-sm bg-sunken">
            <Image
              src={story.imageUrl}
              alt=""
              fill
              priority={priority}
              sizes="(max-width: 767px) 100vw, (max-width: 1023px) 100vw, 66vw"
              className="object-cover"
            />
          </div>
        </Link>
      ) : null}

      <CategoryKicker category={story.category} />

      <Heading className="mt-2 text-[1.75rem] leading-[1.12] sm:text-4xl">
        <Link href={`/story/${story.slug}`} className="headline-link">
          {story.headline}
        </Link>
      </Heading>

      <p className="mt-3 text-base leading-relaxed text-ink-soft clamp-3 sm:text-lg">
        {story.ai.summary ?? story.summary}
      </p>

      <SourceLine story={story} className="mt-3" showType />
    </article>
  );
}

/** Standard grid/list card with a small thumbnail. */
export function StoryCard({ story }: StoryCardProps) {
  return (
    <article className="group flex gap-3 sm:gap-4">
      <div className="min-w-0 flex-1">
        <CategoryKicker category={story.category} />
        <h3 className="mt-1 text-base leading-snug sm:text-lg">
          <Link href={`/story/${story.slug}`} className="headline-link">
            {story.headline}
          </Link>
        </h3>
        <p className="mt-1.5 hidden text-sm leading-snug text-muted clamp-2 sm:block">
          {story.ai.summary ?? story.summary}
        </p>
        <SourceLine story={story} className="mt-2" />
      </div>

      {story.imageUrl ? (
        <Link
          href={`/story/${story.slug}`}
          className="flex-none"
          tabIndex={-1}
          aria-hidden
        >
          <div className="relative h-[72px] w-[96px] overflow-hidden rounded-sm bg-sunken sm:h-[86px] sm:w-[128px]">
            <Image
              src={story.imageUrl}
              alt=""
              fill
              sizes="128px"
              loading="lazy"
              className="object-cover"
            />
          </div>
        </Link>
      ) : null}
    </article>
  );
}

/** Dense text-only row for "Latest" rails and long lists. */
export function StoryRow({ story }: StoryCardProps) {
  return (
    <article className="border-b border-rule pb-3 last:border-0 last:pb-0">
      <h3 className="text-[0.95rem] leading-snug">
        <Link href={`/story/${story.slug}`} className="headline-link">
          {story.headline}
        </Link>
      </h3>
      <SourceLine story={story} className="mt-1.5" />
    </article>
  );
}

/** Card used on category and search pages, where the image leads. */
export function StoryTile({ story }: StoryCardProps) {
  return (
    <article className="group flex flex-col">
      {story.imageUrl ? (
        <Link href={`/story/${story.slug}`} tabIndex={-1} aria-hidden>
          <div className="relative mb-3 aspect-[16/10] w-full overflow-hidden rounded-sm bg-sunken">
            <Image
              src={story.imageUrl}
              alt=""
              fill
              sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw"
              loading="lazy"
              className="object-cover"
            />
          </div>
        </Link>
      ) : null}

      <CategoryKicker category={story.category} />

      <h3 className="mt-1.5 text-lg leading-snug">
        <Link href={`/story/${story.slug}`} className="headline-link">
          {story.headline}
        </Link>
      </h3>

      <p className="mt-2 text-sm leading-snug text-muted clamp-3">
        {story.ai.summary ?? story.summary}
      </p>

      <SourceLine story={story} className="mt-3" />
    </article>
  );
}
