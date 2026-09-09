import Link from "next/link";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getSourceDirectory } from "@/lib/queries";
import {
  SOURCE_TYPES,
  SOURCE_TYPE_META,
  TRUST_TIER_META,
  clampTrustTier,
} from "@/lib/taxonomy";
import { buildMetadata } from "@/lib/seo";

export const revalidate = 1800;

export const metadata: Metadata = buildMetadata({
  title: "Source Registry",
  description:
    "Every newsroom, official body and specialist publisher we aggregate — grouped by source type, with the confidence tier we apply to each.",
  path: "/sources",
});

/**
 * The public source registry.
 *
 * Publishing this is a deliberate editorial choice: a reader who can see
 * exactly which sources feed the platform, and how each is weighted, can
 * calibrate their own trust rather than taking ours on faith.
 */
export default async function SourcesPage() {
  const sources = await getSourceDirectory();

  const grouped = SOURCE_TYPES.map((type) => ({
    type,
    meta: SOURCE_TYPE_META[type],
    sources: sources.filter((source) => source.type === type),
  })).filter((group) => group.sources.length > 0);

  const live = sources.filter((s) => s.status === "ACTIVE").length;
  const contributing = sources.filter((s) => s.storyCount > 0).length;

  return (
    <>
      <SiteHeader activeCategory="sources" />

      <main id="main" className="shell py-5 sm:py-7">
        <header className="border-b-2 border-ink pb-4">
          <h1 className="text-3xl sm:text-4xl">Source registry</h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
            Every story on this site is traced to one of the sources below. We
            do not treat them as equally reliable: each carries a type and a
            confidence tier that affect how prominently its reporting appears
            and how it is labelled.
          </p>
          <p className="mt-2 text-xs text-faint">
            {sources.length} registered &middot; {live} active &middot;{" "}
            {contributing} currently contributing stories
          </p>
        </header>

        <section className="mt-8 rounded-sm border border-rule bg-surface p-5">
          <h2 className="kicker text-faint">Confidence tiers</h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {([1, 2, 3, 4, 5] as const).map((tier) => (
              <div key={tier} className="border-l-2 border-rule pl-3">
                <dt className="text-sm font-semibold text-ink">
                  {TRUST_TIER_META[tier].label}
                </dt>
                <dd className="mt-0.5 text-xs leading-relaxed text-muted">
                  {TRUST_TIER_META[tier].description}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {grouped.map((group) => (
          <section key={group.type} className="mt-10">
            <div className="border-t-2 border-ink pt-3">
              <h2 className="font-serif text-xl font-bold sm:text-2xl">
                {group.meta.label}
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-muted">
                {group.meta.description}
              </p>
            </div>

            <ul className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.sources.map((source) => {
                const tier = clampTrustTier(source.trustTier);
                return (
                  <li
                    key={source.slug}
                    className="flex items-baseline justify-between gap-3 border-b border-rule pb-2"
                  >
                    <div className="min-w-0">
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-semibold text-ink hover:text-accent hover:underline"
                      >
                        {source.name}
                      </a>
                      <p className="mt-0.5 text-xs text-faint">
                        {source.country} &middot; Tier {tier}
                        {source.storyCount > 0
                          ? ` · ${source.storyCount} stories`
                          : ""}
                        {source.status !== "ACTIVE" ? ` · ${source.status.toLowerCase()}` : ""}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        <p className="mt-12 border-t border-rule pt-5 text-sm text-muted">
          Are you a publisher who would like to be added, corrected or removed?{" "}
          <Link href="/about" className="text-accent hover:underline">
            Read how this works
          </Link>
          .
        </p>
      </main>

      <SiteFooter />
    </>
  );
}

