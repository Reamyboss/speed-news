import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AdSlot } from "@/components/ad-slot";
import {
  LeadStoryCard,
  StoryCard,
  StoryRow,
  StoryTile,
} from "@/components/story-card";
import { getHomepage } from "@/lib/queries";
import { CATEGORY_META } from "@/lib/taxonomy";
import { itemListJsonLd } from "@/lib/seo";
import { formatDate } from "@/lib/format";

/**
 * The homepage.
 *
 * Server-rendered with no client JavaScript beyond Next's own runtime, and
 * revalidated on a short interval so a news front page stays current without
 * hitting the database on every request.
 */
export const revalidate = 180;

export default async function HomePage() {
  const { lead, topStories, latest, byCategory, totalStories } = await getHomepage();

  if (!lead) return <EmptyHomepage />;

  const allShown = [lead, ...topStories, ...latest];

  return (
    <>
      <SiteHeader />

      <main id="main" className="shell py-5 sm:py-7">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(itemListJsonLd(allShown, "Top stories")),
          }}
        />

        <AdSlot slotKey="home-top-banner" className="mb-6" />

        {/* --- Lead block ------------------------------------------------- */}
        <div className="grid gap-8 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-8">
            <LeadStoryCard story={lead} priority asPageHeading />

            {topStories.length > 0 ? (
              <div className="mt-8 grid gap-6 border-t border-rule pt-6 sm:grid-cols-2 sm:gap-x-8">
                {topStories.map((story) => (
                  <StoryCard key={story.id} story={story} />
                ))}
              </div>
            ) : null}
          </div>

          {/* --- Latest rail --------------------------------------------- */}
          <aside className="lg:col-span-4">
            <div className="border-t-2 border-ink pt-3">
              <h2 className="kicker text-ink">Latest</h2>
              <p className="mt-1 text-xs text-faint">{formatDate(new Date())}</p>
            </div>

            {latest.length > 0 ? (
              <div className="mt-4 space-y-3">
                {latest.map((story) => (
                  <StoryRow key={story.id} story={story} />
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted">No further stories yet.</p>
            )}

            <AdSlot slotKey="sidebar-primary" className="mt-6" />
          </aside>
        </div>

        <AdSlot slotKey="home-in-feed-1" className="my-8 sm:my-10" />

        {/* --- Category sections ------------------------------------------ */}
        {byCategory.map((group, index) => {
          const meta = CATEGORY_META[group.category];
          const [first, ...rest] = group.stories;

          return (
            <section key={group.category} className="mt-10 first:mt-0">
              <div
                className="flex items-baseline justify-between border-t-2 pt-3"
                style={{ borderColor: meta.accent }}
              >
                <h2 className="font-serif text-xl font-bold sm:text-2xl">
                  <Link href={`/category/${meta.slug}`} className="headline-link">
                    {meta.name}
                  </Link>
                </h2>
                <Link
                  href={`/category/${meta.slug}`}
                  className="text-xs font-semibold text-accent hover:underline"
                >
                  More &rarr;
                </Link>
              </div>
              <p className="mt-1 text-sm text-muted">{meta.tagline}</p>

              <div className="mt-5 grid gap-6 sm:grid-cols-2 sm:gap-x-8 lg:grid-cols-4">
                <div className="sm:col-span-2 lg:col-span-2">
                  <StoryTile story={first} />
                </div>
                <div className="space-y-5 sm:col-span-2 lg:col-span-2 lg:pl-2">
                  {rest.map((story) => (
                    <StoryCard key={story.id} story={story} />
                  ))}
                </div>
              </div>

              {/* One in-feed unit mid-page, never between every section. */}
              {index === 1 ? (
                <AdSlot slotKey="home-in-feed-2" className="mt-10" />
              ) : null}
            </section>
          );
        })}

        <p className="mt-12 border-t border-rule pt-5 text-xs text-faint">
          Tracking {totalStories.toLocaleString("en-NG")} stories across{" "}
          {byCategory.length} sections. Every summary links back to the newsroom
          that reported it — see the{" "}
          <Link href="/sources" className="text-accent hover:underline">
            source registry
          </Link>
          .
        </p>
      </main>

      <SiteFooter />
    </>
  );
}

/**
 * Shown before the first successful ingest. A blank page would read as a bug,
 * so this states plainly what is happening and how to fix it.
 */
function EmptyHomepage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="shell py-16">
        <div className="mx-auto max-w-lg text-center">
          <h1 className="text-3xl">No stories yet</h1>
          <p className="mt-3 text-base text-muted">
            The source registry is ready, but no stories have been ingested. Run
            the pipeline to pull the latest reporting from the configured feeds.
          </p>
          <pre className="mt-5 overflow-x-auto rounded-sm border border-rule bg-sunken px-4 py-3 text-left text-sm text-ink-soft">
            npm run pipeline
          </pre>
          <p className="mt-5 text-sm">
            <Link href="/sources" className="text-accent hover:underline">
              View the source registry
            </Link>
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
