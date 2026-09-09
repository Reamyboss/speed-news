import Link from "next/link";
import { NAV_CATEGORIES } from "@/lib/taxonomy";
import { SITE_NAME } from "@/lib/env";

/**
 * Site masthead.
 *
 * Deliberately zero client-side JavaScript: the category bar is a horizontally
 * scrollable strip on phones (native, momentum-scrolled) and search is a plain
 * GET form. No hamburger menu means no hydration cost and nothing to break.
 */
export function SiteHeader({ activeCategory }: { activeCategory?: string }) {
  return (
    <header className="border-b border-rule bg-surface">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-sm focus:bg-accent focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>

      <div className="shell">
        <div className="flex items-center justify-between gap-3 py-3 sm:py-4">
          <Link href="/" className="flex items-baseline gap-1.5">
            <span
              className="font-serif text-2xl font-bold tracking-tight sm:text-3xl"
              style={{ letterSpacing: "-0.03em" }}
            >
              {SITE_NAME}
            </span>
            <span
              aria-hidden
              className="hidden h-2 w-2 rounded-full bg-accent sm:inline-block"
            />
          </Link>

          <form action="/search" method="get" role="search" className="flex items-center">
            <label htmlFor="site-search" className="sr-only">
              Search stories
            </label>
            <input
              id="site-search"
              type="search"
              name="q"
              placeholder="Search"
              maxLength={120}
              autoComplete="off"
              className="h-9 w-28 rounded-l-sm border border-rule bg-paper px-3 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none sm:w-56"
            />
            <button
              type="submit"
              className="h-9 rounded-r-sm border border-l-0 border-rule bg-sunken px-3 text-sm font-semibold text-ink-soft hover:bg-accent hover:text-white"
            >
              Go
            </button>
          </form>
        </div>
      </div>

      <nav aria-label="Sections" className="border-t border-rule bg-surface">
        <div className="shell">
          <ul className="scroll-x flex items-stretch gap-1 py-0.5">
            <NavItem href="/" label="Home" active={!activeCategory} />
            {NAV_CATEGORIES.map((category) => (
              <NavItem
                key={category.slug}
                href={`/category/${category.slug}`}
                label={category.name}
                active={activeCategory === category.slug}
                accent={category.accent}
              />
            ))}
            <NavItem href="/sources" label="Sources" active={activeCategory === "sources"} />
          </ul>
        </div>
      </nav>
    </header>
  );
}

function NavItem({
  href,
  label,
  active,
  accent,
}: {
  href: string;
  label: string;
  active?: boolean;
  accent?: string;
}) {
  return (
    <li className="flex-none">
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={`inline-block whitespace-nowrap border-b-2 px-2.5 py-2.5 text-[0.8125rem] font-semibold transition-colors sm:px-3 sm:text-sm ${
          active
            ? "border-current text-ink"
            : "border-transparent text-muted hover:text-ink"
        }`}
        style={active && accent ? { color: accent, borderColor: accent } : undefined}
      >
        {label}
      </Link>
    </li>
  );
}
