"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Route-level error boundary.
 *
 * Shows a usable page rather than a stack trace, and never renders the error
 * message itself — that can leak internal detail to the reader.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[page error]", error);
  }, [error]);

  return (
    <main className="shell py-16 sm:py-24">
      <div className="mx-auto max-w-xl text-center">
        <p className="kicker text-accent">Something went wrong</p>
        <h1 className="mt-3 font-serif text-3xl font-bold sm:text-4xl">
          This page didn&rsquo;t load
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted">
          A temporary problem stopped this page from rendering. Trying again
          usually works.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-sm bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-deep"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-sm border border-rule px-5 py-2.5 text-sm font-semibold text-ink-soft hover:border-accent hover:text-accent"
          >
            Go to the homepage
          </Link>
        </div>

        {error.digest ? (
          <p className="mt-6 text-xs text-faint">Reference: {error.digest}</p>
        ) : null}
      </div>
    </main>
  );
}
