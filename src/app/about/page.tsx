import Link from "next/link";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { buildMetadata } from "@/lib/seo";
import { SITE_NAME } from "@/lib/env";

export const metadata: Metadata = buildMetadata({
  title: "How this works",
  description:
    "How NaijaPulse aggregates Nigerian and international news: what we ingest, how sources are ranked, how AI is used, and what we do not do.",
  path: "/about",
});

export default function AboutPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="shell py-5 sm:py-7">
        <article className="mx-auto max-w-2xl">
          <header className="border-b-2 border-ink pb-4">
            <h1 className="text-3xl sm:text-4xl">How {SITE_NAME} works</h1>
            <p className="mt-3 text-base leading-relaxed text-muted">
              We aggregate Nigerian and international reporting, summarise it,
              and always send you to the newsroom that did the work.
            </p>
          </header>

          <div className="prose-editorial mt-8">
            <h2 className="mt-8 font-serif text-2xl font-bold text-ink">
              What we publish
            </h2>
            <p>
              For each story we store the headline, a short excerpt, the
              publication time, the image the publisher supplied, and a link to
              the original. We write our own summary. We do not reproduce full
              articles, and we do not present anyone else&rsquo;s reporting as
              our own.
            </p>
            <p>
              Copyright in the underlying reporting stays with the publisher.
              Rights holders who want an entry amended or removed can get in
              touch and we will act on it.
            </p>

            <h2 className="mt-8 font-serif text-2xl font-bold text-ink">
              Where it comes from
            </h2>
            <p>
              We pull from public feeds, official releases and licensed APIs
              &mdash; national newsrooms, investigative and specialist outlets,
              broadcasters, government agencies, and international wires. The
              full list is public on the{" "}
              <Link href="/sources" className="text-accent hover:underline">
                source registry
              </Link>
              .
            </p>

            <h2 className="mt-8 font-serif text-2xl font-bold text-ink">
              Not all sources are equal
            </h2>
            <p>
              Every source carries a type and a confidence tier. A statement
              published by an institution about itself, a wire report, an
              investigative newsroom and an unverified social signal are
              different kinds of evidence, and we label them differently.
              Confidence, corroboration across independent sources, recency and
              Nigerian relevance all feed the ranking you see on the homepage.
            </p>
            <p>
              When several newsrooms cover the same event we group them, so you
              can see who else reported it and how their accounts differ.
            </p>

            <h2 className="mt-8 font-serif text-2xl font-bold text-ink">
              How we use AI
            </h2>
            <p>
              AI writes the summary and the &ldquo;why this matters&rdquo;
              explanation on story pages, working only from the reporting we
              already hold. It is instructed never to add facts, never to
              speculate, and to say so plainly when the available reporting is
              too thin to establish significance.
            </p>
            <p>
              AI blocks are always labelled. Nothing a model writes is ever
              presented as a statement by the source. The source article is
              authoritative; if the two disagree, trust the source.
            </p>
            <p>
              The site does not depend on AI. If enrichment is unavailable,
              stories still publish with summaries drawn directly from the
              publisher&rsquo;s own feed.
            </p>

            <h2 className="mt-8 font-serif text-2xl font-bold text-ink">
              Corrections
            </h2>
            <p>
              If we have mis-summarised something, mis-attributed a source, or
              placed a story in the wrong section, tell us and we will fix it.
            </p>
          </div>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
