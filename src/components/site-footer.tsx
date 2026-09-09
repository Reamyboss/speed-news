import Link from "next/link";
import { NAV_CATEGORIES } from "@/lib/taxonomy";
import { SITE_NAME } from "@/lib/env";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-12 border-t border-rule bg-surface">
      <div className="shell py-8 sm:py-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="font-serif text-xl font-bold">{SITE_NAME}</p>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">
              Nigerian news and intelligence. Every story is attributed to the
              newsroom that reported it, summarised, and linked back in full.
            </p>
          </div>

          <nav aria-label="Sections">
            <h2 className="kicker text-faint">Sections</h2>
            <ul className="mt-3 space-y-2">
              {NAV_CATEGORIES.map((category) => (
                <li key={category.slug}>
                  <Link
                    href={`/category/${category.slug}`}
                    className="text-sm text-ink-soft hover:text-accent hover:underline"
                  >
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="About">
            <h2 className="kicker text-faint">About</h2>
            <ul className="mt-3 space-y-2">
              <li>
                <Link href="/about" className="text-sm text-ink-soft hover:text-accent hover:underline">
                  How this works
                </Link>
              </li>
              <li>
                <Link href="/sources" className="text-sm text-ink-soft hover:text-accent hover:underline">
                  Source registry
                </Link>
              </li>
              <li>
                <Link href="/advertise" className="text-sm text-ink-soft hover:text-accent hover:underline">
                  Advertise
                </Link>
              </li>
              <li>
                <Link href="/search" className="text-sm text-ink-soft hover:text-accent hover:underline">
                  Search
                </Link>
              </li>
            </ul>
          </nav>

          <div>
            <h2 className="kicker text-faint">Attribution</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              We publish original summaries and link to the source. Copyright in
              the underlying reporting remains with the publisher. Rights
              holders can contact us to amend or remove an entry.
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-2 border-t border-rule pt-5 text-xs text-faint sm:flex-row sm:items-center sm:justify-between">
          <p>
            &copy; {year} {SITE_NAME}. Summaries and analysis are ours; reporting
            belongs to the sources named on each story.
          </p>
          <p>Times shown in West Africa Time (WAT).</p>
        </div>
      </div>
    </footer>
  );
}
