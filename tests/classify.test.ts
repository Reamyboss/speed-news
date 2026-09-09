import { describe, expect, it } from "vitest";
import { classifyStory, looksLikeOpinion, scoreImportance } from "@/lib/classify";
import { CATEGORIES } from "@/lib/taxonomy";

/**
 * CATEGORY ASSIGNMENT.
 *
 * Category pages are core navigation, so classification must be deterministic
 * and must never depend on the AI provider being up.
 */

describe("classifyStory", () => {
  it("always returns a category from the controlled vocabulary", () => {
    const result = classifyStory({ headline: "Something entirely ambiguous happened today" });
    expect(CATEGORIES).toContain(result.category);
  });

  it("classifies monetary policy as business", () => {
    const result = classifyStory({
      headline: "CBN raises benchmark interest rate to 27.5% to fight inflation",
      summary: "The Monetary Policy Committee voted to raise the rate.",
      sourceCategories: "business",
    });
    expect(result.category).toBe("business");
  });

  it("classifies elections and the National Assembly as politics", () => {
    const result = classifyStory({
      headline: "INEC announces timetable for 2027 governorship election",
      summary: "The electoral commission published the schedule.",
    });
    expect(result.category).toBe("politics");
  });

  it("classifies football as sports", () => {
    const result = classifyStory({
      headline: "Super Eagles name 23-man squad for AFCON qualifier against Benin",
      summary: "The coach named his squad ahead of the qualifier.",
    });
    expect(result.category).toBe("sports");
  });

  it("classifies startups and funding as technology", () => {
    const result = classifyStory({
      headline: "Lagos fintech startup raises $12m Series A led by venture capital fund",
      summary: "The payments company will expand across West Africa.",
    });
    expect(result.category).toBe("technology");
  });

  it("classifies Nollywood and music as entertainment", () => {
    const result = classifyStory({
      headline: "Burna Boy announces new album and Lagos concert dates",
      summary: "The Afrobeats star revealed the tracklist.",
    });
    expect(result.category).toBe("entertainment");
  });

  it("classifies foreign affairs as world", () => {
    const result = classifyStory({
      headline: "United Nations Security Council votes on Gaza ceasefire resolution",
      summary: "Members debated the draft text in New York.",
      sourceType: "INTERNATIONAL_MEDIA",
      sourceCountry: "GB",
    });
    expect(result.category).toBe("world");
  });

  it("uses the feed's own section label as strong evidence", () => {
    const result = classifyStory({
      headline: "A short ambiguous headline about a thing",
      feedCategories: ["Sports"],
    });
    expect(result.category).toBe("sports");
  });

  it("uses the URL path as evidence when the text is ambiguous", () => {
    const result = classifyStory({
      headline: "A short ambiguous headline about a thing",
      url: "https://punchng.com/entertainment/some-story",
    });
    expect(result.category).toBe("entertainment");
  });

  it("does not let the residual nigeria bucket swallow topical stories", () => {
    // Mentions Nigeria heavily but is unmistakably a football story.
    const result = classifyStory({
      headline: "Nigeria's Super Eagles beat Ghana 2-0 in Lagos friendly",
      summary: "Nigeria won the match played in Lagos, Nigeria.",
    });
    expect(result.category).toBe("sports");
  });

  it("uses the source's PRIMARY beat when a multi-category source gives no evidence", () => {
    // Regression: Punch declares "nigeria,politics,business,sports". Adding an
    // equal prior to all four made them tie, and the tie-break order — not the
    // story — picked the section, filing general news under sports.
    const result = classifyStory({
      headline: "Fund family planning to fight insecurity in West Africa, gynaecologists tell govts",
      summary: "Doctors asked governments to increase funding.",
      sourceCategories: "nigeria,politics,business,sports",
      sourceCountry: "NG",
    });
    expect(result.category).toBe("nigeria");
  });

  it("lets real content evidence beat the source prior", () => {
    // Same multi-category source, but the story is unmistakably about football.
    const result = classifyStory({
      headline: "Super Eagles beat Ghana 2-0 in AFCON qualifier at the national stadium",
      summary: "Two second-half goals settled the qualifier.",
      sourceCategories: "nigeria,politics,business,sports",
      sourceCountry: "NG",
    });
    expect(result.category).toBe("sports");
  });

  it("falls back to the source's declared category when there is no evidence", () => {
    const result = classifyStory({
      headline: "An utterly featureless string of ordinary words",
      sourceCategories: "technology",
    });
    expect(result.category).toBe("technology");
  });

  it("marks Nigerian stories as region ng and foreign ones as world", () => {
    expect(
      classifyStory({ headline: "Lagos residents protest over power tariff increase" }).region,
    ).toBe("ng");

    expect(
      classifyStory({
        headline: "United Nations Security Council debates Gaza ceasefire resolution",
        sourceType: "INTERNATIONAL_MEDIA",
        sourceCountry: "GB",
      }).region,
    ).toBe("world");
  });

  it("reports a confidence between 0 and 1", () => {
    const result = classifyStory({
      headline: "CBN raises benchmark interest rate to 27.5% to fight inflation",
    });
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("never throws on hostile or empty input", () => {
    expect(() => classifyStory({ headline: "" })).not.toThrow();
    expect(() => classifyStory({ headline: "<script>x</script>", url: "not a url" })).not.toThrow();
    expect(() => classifyStory({ headline: "x".repeat(5000) })).not.toThrow();
  });
});

/**
 * IMPORTANCE SCORING — drives homepage ranking.
 */
describe("scoreImportance", () => {
  const base = {
    headline: "Government announces new policy on fuel imports",
    summary: "The policy takes effect next month.",
    trustTier: 2,
    sourceType: "PROFESSIONAL_MEDIA" as const,
    sourceWeight: 70,
    publishedAt: new Date("2026-09-08T11:00:00Z"),
    hasImage: true,
    now: new Date("2026-09-08T12:00:00Z"),
  };

  it("always returns a value in 0..100", () => {
    for (const tier of [1, 2, 3, 4, 5]) {
      const score = scoreImportance({ ...base, trustTier: tier });
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it("does not saturate at the ceiling for a strong story", () => {
    // If everything maxes out, ordering silently degenerates to publish time.
    const best = scoreImportance({
      ...base,
      trustTier: 1,
      sourceWeight: 100,
      corroboratingSources: 6,
      region: "ng",
      headline: "Breaking: explosion kills 20 as building collapses in Lagos",
    });
    expect(best).toBeLessThan(100);
  });

  it("ranks higher-trust sources above lower-trust ones", () => {
    expect(scoreImportance({ ...base, trustTier: 1 })).toBeGreaterThan(
      scoreImportance({ ...base, trustTier: 4 }),
    );
  });

  it("ranks Nigerian stories above equivalent world stories", () => {
    expect(scoreImportance({ ...base, region: "ng" })).toBeGreaterThan(
      scoreImportance({ ...base, region: "world" }),
    );
  });

  it("rewards corroboration across independent sources", () => {
    expect(scoreImportance({ ...base, corroboratingSources: 5 })).toBeGreaterThan(
      scoreImportance({ ...base, corroboratingSources: 1 }),
    );
  });

  it("decays with age", () => {
    const fresh = scoreImportance(base);
    const old = scoreImportance({
      ...base,
      publishedAt: new Date("2026-09-01T11:00:00Z"),
    });
    expect(fresh).toBeGreaterThan(old);
  });

  it("penalises source types that are signals rather than reporting", () => {
    expect(scoreImportance({ ...base, sourceType: "SOCIAL_SIGNAL", trustTier: 5 })).toBeLessThan(
      scoreImportance({ ...base, sourceType: "PROFESSIONAL_MEDIA", trustTier: 2 }),
    );
  });

  it("penalises shouty all-caps headlines", () => {
    expect(
      scoreImportance({ ...base, headline: "BREAKING NEWS SHOCKING REVELATION TODAY" }),
    ).toBeLessThan(
      scoreImportance({ ...base, headline: "Breaking news: shocking revelation today" }),
    );
  });

  it("ranks routine ceremonial wire copy below a real event", () => {
    const routine = scoreImportance({
      ...base,
      headline: "Minister urges youths to embrace agriculture at summit",
    });
    const event = scoreImportance({
      ...base,
      headline: "Twenty killed as building collapses in Lagos",
    });
    expect(event).toBeGreaterThan(routine);
  });
});

describe("looksLikeOpinion", () => {
  it("detects the 'By Author' column suffix", () => {
    expect(
      looksLikeOpinion("Afrilition: the blackness challenge, By Adéwálé Àjàdí"),
    ).toBe(true);
    expect(looksLikeOpinion("Why the naira keeps falling, by Jane Doe")).toBe(true);
  });

  it("detects opinion sections in the URL", () => {
    expect(
      looksLikeOpinion("A headline", "https://punchng.com/opinion/some-column"),
    ).toBe(true);
    expect(
      looksLikeOpinion("A headline", "https://guardian.ng/columnist/abc"),
    ).toBe(true);
  });

  it("does not flag ordinary news", () => {
    expect(
      looksLikeOpinion(
        "CBN holds benchmark rate at 27.5 per cent",
        "https://punchng.com/news/cbn-holds-rate",
      ),
    ).toBe(false);
    // "by" inside a normal sentence must not trigger it.
    expect(looksLikeOpinion("Man rescued by police after Lagos crash")).toBe(false);
  });

  it("ranks an opinion column below equivalent hard news", () => {
    const base = {
      summary: "Body text.",
      trustTier: 1,
      sourceType: "SPECIALIST_MEDIA" as const,
      sourceWeight: 94,
      publishedAt: new Date("2026-09-08T11:00:00Z"),
      hasImage: true,
      region: "ng" as const,
      now: new Date("2026-09-08T12:00:00Z"),
    };

    const opinion = scoreImportance({
      ...base,
      headline: "Afrilition: the blackness challenge, By Adéwálé Àjàdí",
    });
    const news = scoreImportance({
      ...base,
      headline: "TCN declares force majeure as tower collapses on Kainji line",
    });

    expect(news).toBeGreaterThan(opinion);
  });
});
