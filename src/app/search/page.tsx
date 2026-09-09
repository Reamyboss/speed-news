import Link from "next/link";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AdSlot } from "@/components/ad-slot";
import { StoryCard } from "@/components/story-card";
import { searchStories } from "@/lib/queries";
import { NAV_CATEGORIES, CATEGORY_META, isCategory } from "@/lib/taxonomy";
import { buildMetadata } from "@/lib/seo";

/**
 * Search results are user-specific and must never be cached at the edge, nor
 * indexed — thin, near-duplicate result pages are a classic SEO liability.
 */
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ q?: string; page?: string; category?: string }>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const { q } = await searchParams;
  const term = (q ?? "").trim().slice(0, 80);

  return buildMetadata({
    title: term ? `Search: ${term}` : "Search",
    description: term
      ? `Stories matching “${term}” across Nigerian and international sources.`
      : "Search Nigerian and international news across every source in the registry.",
    path: "/search",
    noIndex: true,
  });
}

export default async function SearchPage({ searchParams }: PageProps) {
  const { q, page: pageParam, category } = await searchParams;
  const term = (q ?? "").trim();
  const parsed = Number.parseInt(pageParam ?? "1", 10);
  const page = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 100) : 1;
  const activeCategory = category && isCategory(category) ? category : undefined;

  const results = term
    ? await searchStories(term, page, activeCategory)
    : { stories: [], total: 0, page: 1, totalPages: 0, term: "" };

  return (
    <>
      <SiteHeader />

      <main id="main" className="shell py-5 sm:py-7">
        <header className="border-b-2 border-ink pb-4">
          <h1 className="text-3xl sm:text-4xl">Search</h1>
          <p className="mt-2 text-sm text-muted">
            Search headlines and summaries across every source in the registry.
          </p>
        </header>

        <form action="/search" method="get" role="search" className="mt-6">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex-1">
              <label htmlFor="q" className="sr-only">
                Search term
              </label>
              <input
                id="q"
                name="q"
                type="search"
                defaultValue={term}
                maxLength={120}
                placeholder="Try: naira, ASUU, Super Eagles, Dangote"
                autoComplete="off"
                className="h-11 w-full rounded-sm border border-rule bg-surface px-3.5 text-base text-ink placeholder:text-faint focus:border-accent focus:outline-none"
              />
            </div>

            <div className="flex gap-2">
              <label htmlFor="category" className="sr-only">
                Section
              </label>
              <select
                id="category"
                name="category"
                defaultValue={activeCategory ?? ""}
                className="h-11 rounded-sm border border-rule bg-surface px-3 text-sm text-ink focus:border-accent focus:outline-none"
              >
                <option value="">All sections</option>
                {NAV_CATEGORIES.map((meta) => (
                  <option key={meta.slug} value={meta.slug}>
                    {meta.name}
                  </option>
                ))}
              </select>

              <button
                type="submit"
                className="h-11 rounded-sm bg-accent px-6 text-sm font-semibold text-white hover:bg-accent-deep"
              >
                Search
              </button>
            </div>
          </div>
        </form>

        {term ? (
          <section className="mt-8">
            <p className="text-sm text-muted">
              {results.total > 0 ? (
                <>
                  <strong className="text-ink">
                    {results.total.toLocaleString("en-NG")}
                  </strong>{" "}
                  {results.total === 1 ? "result" : "results"} for{" "}
                  <strong className="text-ink">&ldquo;{results.term}&rdquo;</strong>
                  {activeCategory ? ` in ${CATEGORY_META[activeCategory].name}` : ""}
                </>
              ) : (
                <>
                  No results for{" "}
                  <strong className="text-ink">&ldquo;{term}&rdquo;</strong>
                  {activeCategory ? ` in ${CATEGORY_META[activeCategory].name}` : ""}.
                </>
              )}
            </p>

            {results.stories.length > 0 ? (
              <>
                <div className="mt-6 space-y-6 border-t border-rule pt-6">
                  {results.stories.map((story, index) => (
                    <div key={story.id}>
                      <StoryCard story={story} />
                      {index === 4 ? <AdSlot slotKey="home-in-feed-1" className="mt-6" /> : null}
                    </div>
                  ))}
                </div>

                {results.totalPages > 1 ? (
                  <nav
                    aria-label="Pagination"
                    className="mt-10 flex items-center justify-between border-t border-rule pt-5"
                  >
                    {page > 1 ? (
                      <Link
                        href={buildSearchHref(term, page - 1, activeCategory)}
                        rel="prev"
                        className="rounded-sm border border-rule px-4 py-2 text-sm font-semibold text-ink-soft hover:border-accent hover:text-accent"
                      >
                        &larr; Previous
                      </Link>
                    ) : (
                      <span />
                    )}
                    <span className="text-xs text-faint">
                      Page {page} of {results.totalPages}
                    </span>
                    {page < results.totalPages ? (
                      <Link
                        href={buildSearchHref(term, page + 1, activeCategory)}
                        rel="next"
                        className="rounded-sm border border-rule px-4 py-2 text-sm font-semibold text-ink-soft hover:border-accent hover:text-accent"
                      >
                        Next &rarr;
                      </Link>
                    ) : (
                      <span />
                    )}
                  </nav>
                ) : null}
              </>
            ) : (
              <div className="mt-6 rounded-sm border border-rule bg-surface p-6">
                <h2 className="font-serif text-lg font-bold">Try a different search</h2>
                <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-muted">
                  <li>Check the spelling, or use fewer words.</li>
                  <li>Search covers headlines and summaries, not full articles.</li>
                  <li>
                    Very recent stories appear as soon as the pipeline ingests them.
                  </li>
                </ul>
                <div className="mt-4 flex flex-wrap gap-2">
                  {NAV_CATEGORIES.slice(0, 5).map((meta) => (
                    <Link
                      key={meta.slug}
                      href={`/category/${meta.slug}`}
                      className="rounded-full border border-rule px-3 py-1 text-xs font-semibold text-ink-soft hover:border-accent hover:text-accent"
                    >
                      {meta.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </section>
        ) : (
          <section className="mt-8">
            <h2 className="kicker text-faint">Browse by section</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {NAV_CATEGORIES.map((meta) => (
                <Link
                  key={meta.slug}
                  href={`/category/${meta.slug}`}
                  className="rounded-sm border border-rule bg-surface p-4 hover:border-accent"
                >
                  <span
                    className="kicker"
                    style={{ color: meta.accent }}
                  >
                    {meta.name}
                  </span>
                  <p className="mt-1.5 text-sm text-muted">{meta.tagline}</p>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>

      <SiteFooter />
    </>
  );
}

function buildSearchHref(term: string, page: number, category?: string): string {
  const params = new URLSearchParams({ q: term });
  if (category) params.set("category", category);
  if (page > 1) params.set("page", String(page));
  return `/search?${params.toString()}`;
}
