import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AdSlot } from "@/components/ad-slot";
import { StoryTile, StoryCard } from "@/components/story-card";
import { getCategoryPage } from "@/lib/queries";
import { CATEGORIES, CATEGORY_META, isCategory } from "@/lib/taxonomy";
import { categoryMetadata, breadcrumbJsonLd, itemListJsonLd } from "@/lib/seo";

export const revalidate = 300;

/** Category pages are a fixed, known set — prerender all of them. */
export function generateStaticParams() {
  return CATEGORIES.map((slug) => ({ slug }));
}

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

function parsePage(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 500) : 1;
}

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  if (!isCategory(slug)) {
    return { title: "Section not found", robots: { index: false, follow: true } };
  }
  const { page } = await searchParams;
  return categoryMetadata(slug, parsePage(page));
}

export default async function CategoryPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  if (!isCategory(slug)) notFound();

  const { page: pageParam } = await searchParams;
  const page = parsePage(pageParam);
  const meta = CATEGORY_META[slug];
  const { stories, total, totalPages } = await getCategoryPage(slug, page);

  // A page number past the end is a dead end, not a soft-empty list.
  if (page > 1 && stories.length === 0) notFound();

  const [lead, ...rest] = stories;

  return (
    <>
      <SiteHeader activeCategory={slug} />

      <main id="main" className="shell py-5 sm:py-7">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(
              breadcrumbJsonLd([
                { name: "Home", path: "/" },
                { name: meta.name, path: `/category/${meta.slug}` },
              ]),
            ),
          }}
        />
        {stories.length > 0 ? (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(itemListJsonLd(stories, meta.name)),
            }}
          />
        ) : null}

        <header className="border-b-2 pb-4" style={{ borderColor: meta.accent }}>
          <h1 className="text-3xl sm:text-4xl">{meta.name}</h1>
          <p className="mt-2 text-base text-muted">{meta.tagline}</p>
          {total > 0 ? (
            <p className="mt-1 text-xs text-faint">
              {total.toLocaleString("en-NG")} stories
              {totalPages > 1 ? ` · page ${page} of ${totalPages}` : ""}
            </p>
          ) : null}
        </header>

        <AdSlot slotKey="home-top-banner" className="mt-6" />

        {stories.length === 0 ? (
          <div className="py-16 text-center">
            <h2 className="text-2xl">Nothing here yet</h2>
            <p className="mt-2 text-muted">
              No stories have been published in {meta.name} yet. Run the ingest
              pipeline, or try another section.
            </p>
            <Link
              href="/"
              className="mt-5 inline-block text-sm font-semibold text-accent hover:underline"
            >
              Back to the homepage
            </Link>
          </div>
        ) : (
          <>
            {page === 1 && lead ? (
              <div className="mt-7 border-b border-rule pb-8">
                <div className="grid gap-8 lg:grid-cols-12">
                  <div className="lg:col-span-8">
                    <StoryTile story={lead} />
                  </div>
                  <div className="space-y-5 lg:col-span-4">
                    {rest.slice(0, 4).map((story) => (
                      <StoryCard key={story.id} story={story} />
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-8 grid gap-8 sm:grid-cols-2 sm:gap-x-8 lg:grid-cols-3">
              {(page === 1 ? rest.slice(4) : stories).map((story, index) => (
                <div key={story.id} className="contents">
                  <StoryTile story={story} />
                  {index === 2 ? (
                    <AdSlot
                      slotKey="home-in-feed-1"
                      className="sm:col-span-2 lg:col-span-3"
                    />
                  ) : null}
                </div>
              ))}
            </div>

            <Pagination slug={slug} page={page} totalPages={totalPages} />
          </>
        )}
      </main>

      <SiteFooter />
    </>
  );
}

function Pagination({
  slug,
  page,
  totalPages,
}: {
  slug: string;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;

  const base = `/category/${slug}`;
  const prevHref = page === 2 ? base : `${base}?page=${page - 1}`;

  return (
    <nav
      aria-label="Pagination"
      className="mt-10 flex items-center justify-between border-t border-rule pt-5"
    >
      {page > 1 ? (
        <Link
          href={prevHref}
          rel="prev"
          className="rounded-sm border border-rule px-4 py-2 text-sm font-semibold text-ink-soft hover:border-accent hover:text-accent"
        >
          &larr; Newer
        </Link>
      ) : (
        <span />
      )}

      <span className="text-xs text-faint">
        Page {page} of {totalPages}
      </span>

      {page < totalPages ? (
        <Link
          href={`${base}?page=${page + 1}`}
          rel="next"
          className="rounded-sm border border-rule px-4 py-2 text-sm font-semibold text-ink-soft hover:border-accent hover:text-accent"
        >
          Older &rarr;
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

