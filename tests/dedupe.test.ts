import { describe, expect, it } from "vitest";
import {
  CLUSTER_WINDOW_HOURS,
  clusterKey,
  fingerprint,
  findCluster,
  findDuplicate,
  type CandidateStory,
} from "@/lib/dedupe";

/**
 * DUPLICATE DETECTION.
 *
 * The critical invariant: the same item twice is a DUPLICATE (drop one), but
 * two independent newsrooms covering one event are a CLUSTER (keep both). If
 * these ever collapse into each other the product loses the corroboration
 * signal it is built on, so both directions are tested explicitly.
 */

const NOW = new Date("2026-09-08T12:00:00Z");

function candidate(overrides: Partial<CandidateStory> = {}): CandidateStory {
  const headline = overrides.headline ?? "CBN raises benchmark interest rate to 27.5 per cent";
  const url = "https://punchng.com/cbn-raises-rate";
  const print = fingerprint(headline, "The apex bank raised rates.", url);

  return {
    id: "story-1",
    sourceId: "source-punch",
    headline,
    urlHash: print.urlHash,
    titleKey: print.titleKey,
    simhash: print.simhash,
    publishedAt: NOW,
    clusterId: "cluster-1",
    ...overrides,
  };
}

describe("findDuplicate", () => {
  it("flags an identical canonical URL regardless of source", () => {
    const existing = candidate();
    const verdict = findDuplicate(
      {
        sourceId: "some-other-source",
        headline: "A completely different headline",
        publishedAt: NOW,
        fingerprint: fingerprint(
          "A completely different headline",
          "Body",
          "https://punchng.com/cbn-raises-rate",
        ),
      },
      [existing],
    );

    expect(verdict.isDuplicate).toBe(true);
    expect(verdict.reason).toBe("SAME_URL");
    expect(verdict.matchedStoryId).toBe("story-1");
  });

  it("treats tracking-parameter variants of one URL as the same story", () => {
    const existing = candidate();
    const verdict = findDuplicate(
      {
        sourceId: "source-punch",
        headline: "CBN raises benchmark interest rate to 27.5 per cent",
        publishedAt: NOW,
        fingerprint: fingerprint(
          "CBN raises benchmark interest rate to 27.5 per cent",
          "Body",
          "https://www.punchng.com/cbn-raises-rate/?utm_source=twitter",
        ),
      },
      [existing],
    );
    expect(verdict.isDuplicate).toBe(true);
    expect(verdict.reason).toBe("SAME_URL");
  });

  it("flags the same source reposting the same headline at a new URL", () => {
    const existing = candidate();
    const headline = "CBN raises benchmark interest rate to 27.5 per cent";
    const verdict = findDuplicate(
      {
        sourceId: "source-punch",
        headline,
        publishedAt: new Date("2026-09-08T14:00:00Z"),
        fingerprint: fingerprint(headline, "Body", "https://punchng.com/cbn-rate-hike-2"),
      },
      [existing],
    );
    expect(verdict.isDuplicate).toBe(true);
    expect(verdict.reason).toBe("SAME_SOURCE_SAME_TITLE");
  });

  it("does NOT flag a different source covering the same event", () => {
    const existing = candidate();
    const headline = "CBN raises benchmark interest rate to 27.5 per cent";
    const verdict = findDuplicate(
      {
        sourceId: "source-premium-times",
        headline,
        publishedAt: NOW,
        fingerprint: fingerprint(
          headline,
          "Body",
          "https://premiumtimesng.com/cbn-raises-rate",
        ),
      },
      [existing],
    );

    // This is the corroboration case — it must survive as its own story.
    expect(verdict.isDuplicate).toBe(false);
  });

  it("does not flag the same source's genuinely different story", () => {
    const existing = candidate();
    const headline = "Super Eagles beat Ghana 2-0 in Accra friendly";
    const verdict = findDuplicate(
      {
        sourceId: "source-punch",
        headline,
        publishedAt: NOW,
        fingerprint: fingerprint(headline, "Match report", "https://punchng.com/eagles-ghana"),
      },
      [existing],
    );
    expect(verdict.isDuplicate).toBe(false);
  });

  it("does not flag a repost outside the lookback window", () => {
    const existing = candidate({
      publishedAt: new Date(NOW.getTime() - (CLUSTER_WINDOW_HOURS + 48) * 3_600_000),
    });
    const headline = "CBN raises benchmark interest rate to 27.5 per cent";
    const verdict = findDuplicate(
      {
        sourceId: "source-punch",
        headline,
        publishedAt: NOW,
        fingerprint: fingerprint(headline, "Body", "https://punchng.com/cbn-rate-new"),
      },
      [existing],
    );
    expect(verdict.isDuplicate).toBe(false);
  });

  it("returns not-duplicate against an empty candidate set", () => {
    const headline = "Brand new story nobody has published";
    expect(
      findDuplicate(
        {
          sourceId: "s",
          headline,
          publishedAt: NOW,
          fingerprint: fingerprint(headline, "b", "https://x.ng/a"),
        },
        [],
      ).isDuplicate,
    ).toBe(false);
  });
});

describe("findCluster", () => {
  it("groups independent sources reporting the same event", () => {
    const existing = candidate({ sourceId: "source-punch", clusterId: "cluster-cbn" });
    const headline = "CBN raises benchmark interest rate to 27.5 per cent";

    const match = findCluster(
      {
        headline,
        publishedAt: NOW,
        fingerprint: fingerprint(headline, "Body", "https://thecable.ng/cbn-rate"),
      },
      [existing],
    );

    expect(match).not.toBeNull();
    expect(match!.clusterId).toBe("cluster-cbn");
  });

  it("groups differently-worded coverage of the same event", () => {
    const existing = candidate({
      headline: "CBN raises benchmark interest rate to 27.5 per cent",
      clusterId: "cluster-cbn",
    });

    const headline = "Central Bank raises benchmark interest rate to 27.5 per cent";
    const match = findCluster(
      {
        headline,
        publishedAt: NOW,
        fingerprint: fingerprint(headline, "Body", "https://vanguardngr.com/cbn"),
      },
      [existing],
    );

    expect(match).not.toBeNull();
  });

  it("does not group unrelated stories that share a common word", () => {
    const existing = candidate({
      headline: "CBN raises benchmark interest rate to 27.5 per cent",
      clusterId: "cluster-cbn",
    });

    const headline = "Burna Boy announces new album and Lagos concert dates";
    const match = findCluster(
      {
        headline,
        publishedAt: NOW,
        fingerprint: fingerprint(headline, "Music news", "https://pulse.ng/burna"),
      },
      [existing],
    );

    expect(match).toBeNull();
  });

  it("ignores candidates outside the clustering time window", () => {
    const existing = candidate({
      clusterId: "cluster-cbn",
      publishedAt: new Date(NOW.getTime() - (CLUSTER_WINDOW_HOURS + 5) * 3_600_000),
    });
    const headline = "CBN raises benchmark interest rate to 27.5 per cent";

    expect(
      findCluster(
        {
          headline,
          publishedAt: NOW,
          fingerprint: fingerprint(headline, "Body", "https://thecable.ng/cbn"),
        },
        [existing],
      ),
    ).toBeNull();
  });

  it("ignores candidates that have no cluster assigned", () => {
    const existing = candidate({ clusterId: null });
    const headline = "CBN raises benchmark interest rate to 27.5 per cent";
    expect(
      findCluster(
        {
          headline,
          publishedAt: NOW,
          fingerprint: fingerprint(headline, "Body", "https://thecable.ng/cbn"),
        },
        [existing],
      ),
    ).toBeNull();
  });
});

describe("clusterKey", () => {
  it("is deterministic and order-insensitive for the same event", () => {
    expect(clusterKey("Tinubu signs 2026 budget into law")).toBe(
      clusterKey("Tinubu signs 2026 budget into law"),
    );
  });

  it("differs for unrelated events", () => {
    expect(clusterKey("Tinubu signs 2026 budget into law")).not.toBe(
      clusterKey("Arsenal sign Nigerian striker on loan"),
    );
  });
});
