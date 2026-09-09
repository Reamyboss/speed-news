import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { NAV_CATEGORIES } from "@/lib/taxonomy";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="shell py-16 sm:py-24">
        <div className="mx-auto max-w-xl text-center">
          <p className="kicker text-accent">Error 404</p>
          <h1 className="mt-3 text-3xl sm:text-4xl">We can&rsquo;t find that page</h1>
          <p className="mt-3 text-base leading-relaxed text-muted">
            The story may have been removed, or the link may be wrong. Stories
            are retained for a limited period, so older links can expire.
          </p>

          <Link
            href="/"
            className="mt-6 inline-block rounded-sm bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-deep"
          >
            Go to the homepage
          </Link>

          <div className="mt-10 border-t border-rule pt-6">
            <h2 className="kicker text-faint">Or browse a section</h2>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {NAV_CATEGORIES.map((meta) => (
                <Link
                  key={meta.slug}
                  href={`/category/${meta.slug}`}
                  className="rounded-full border border-rule px-3 py-1.5 text-sm text-ink-soft hover:border-accent hover:text-accent"
                >
                  {meta.name}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
