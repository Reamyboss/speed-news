import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { buildMetadata } from "@/lib/seo";
import { SITE_NAME } from "@/lib/env";

export const metadata: Metadata = buildMetadata({
  title: "Advertise",
  description:
    "Advertising placements on NaijaPulse — banner, in-feed, article and sidebar inventory across Nigerian news, business, technology and sport.",
  path: "/advertise",
});

const PLACEMENTS = [
  {
    name: "Top banner",
    detail: "Above the fold on the homepage and every section page.",
    size: "970x90 desktop, 320x50 mobile",
  },
  {
    name: "In-feed",
    detail: "Between stories in the main river, clearly marked as sponsored.",
    size: "Responsive",
  },
  {
    name: "Article",
    detail:
      "Inline on story pages, below the summary and above related coverage.",
    size: "728x90, responsive",
  },
  {
    name: "Sidebar",
    detail: "Persistent on desktop story and homepage layouts.",
    size: "300x250",
  },
];

export default function AdvertisePage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="shell py-5 sm:py-7">
        <div className="mx-auto max-w-2xl">
          <header className="border-b-2 border-ink pb-4">
            <h1 className="text-3xl sm:text-4xl">Advertise on {SITE_NAME}</h1>
            <p className="mt-3 text-base leading-relaxed text-muted">
              Reach readers who follow Nigerian politics, business, technology
              and sport closely enough to care where a story came from.
            </p>
          </header>

          <section className="mt-8">
            <h2 className="kicker text-faint">Available inventory</h2>
            <dl className="mt-4 space-y-4">
              {PLACEMENTS.map((placement) => (
                <div
                  key={placement.name}
                  className="rounded-sm border border-rule bg-surface p-4"
                >
                  <dt className="font-serif text-lg font-bold text-ink">
                    {placement.name}
                  </dt>
                  <dd className="mt-1 text-sm leading-relaxed text-muted">
                    {placement.detail}
                  </dd>
                  <dd className="mt-1.5 text-xs text-faint">{placement.size}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="mt-8 rounded-sm border border-rule bg-surface p-5">
            <h2 className="font-serif text-xl font-bold">Our commitments</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted">
              <li>Every paid placement is labelled. Always.</li>
              <li>
                No interstitials, no pop-ups, no auto-playing audio or video.
              </li>
              <li>
                Advertising never appears inside a story&rsquo;s summary or
                between a headline and its source attribution.
              </li>
              <li>Editorial ranking is never for sale.</li>
            </ul>
          </section>

          <section className="mt-8">
            <h2 className="font-serif text-xl font-bold">Get in touch</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Send your campaign dates, target sections and formats, and
              we&rsquo;ll come back with availability and rates.
            </p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
