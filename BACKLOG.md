# Backlog

Everything deliberately deferred past the first production release. V1 scope is
in `README.md`; if it is listed here, it is **not** built yet.

---

## Deferred from V1 scope

### Search quality
- **Postgres full-text search.** Search is currently `LIKE` over a denormalised
  `searchText` column. This is portable across SQLite and Postgres and is fine
  at current volume, but it does not rank by relevance, only recency. Move to
  `tsvector` + GIN with a `websearch_to_tsquery` parser once on Postgres.
- No typo tolerance, stemming, or synonyms ("Naira" vs "NGN", "Buhari" vs
  "President Buhari").
- No search suggestions or autocomplete.

### Database
- No read replica or connection pooling config (add PgBouncer/Prisma Accelerate
  when traffic justifies it).
- No retention policy. Stories accumulate indefinitely; add an archival job.

### Ingest
- 52 of 87 sources are active. `scripts/discover-feeds.ts` recovered NCC, SEC,
  WAEC, Dataphyte, CNBC Africa and Pulse Nigeria via feed autodiscovery. The
  remaining 26 publish no discoverable feed at all — mostly Nigerian government
  agencies (CBN, NAFDAC, NDLEA, FRSC, FIRS, Customs, JAMB, NECO, NNPC, National
  Assembly, INEC, State House). **Each needs an API, a real endpoint, or
  nothing.** They skip cleanly.
- Cloudflare-fronted publishers return 403 to our user agent from this network
  (Guardian Nigeria, The Nation, TheCable, FIJ, Daily Independent) and are
  marked `PAUSED` rather than broken. Verify from a datacenter IP after first
  deploy; if they still refuse, that is a licensing conversation, not a
  technical one. **Do not work around an access control.**
- AFP was found at afp.com/rss.xml but it is their French-language corporate
  newsroom, not an English wire. Left `PENDING` with the reason recorded.
- No conditional requests (`ETag`/`If-Modified-Since`), so every run refetches
  every feed in full.
- No per-source rate limiting or backoff schedule beyond the failure counter.
- No API-based sources (only RSS). `apiUrl` exists on the model but is unused.
- No social signal ingestion, despite `SOCIAL_SIGNAL`/`CREATOR` source types
  existing in the taxonomy.

### Intelligence layer
Only the V1 minimum is built (concise summary, why it matters, related-story
assistance). Not built:
- Claim extraction and evidence mapping
- Source comparison ("what each newsroom said differently")
- Event timelines
- Entity pages and entity relationship graphs
- Confidence scoring surfaced to the reader
- "How does this affect me?" personalisation
- Ask AI / conversational query over the corpus

### AI
- Three providers are implemented behind the `AiProvider` abstraction
  (`src/lib/ai/anthropic.ts`, `gemini.ts`, `groq.ts`), with automatic fallback
  to a second provider when the primary rate-limits or errors
  (`src/lib/ai/enrich.ts`). This proved its worth immediately: Groq's free
  tier allows ~4 enrichments/minute and Gemini intermittently 503s, so a
  single-provider run fails constantly at any real batch size.
- Gemini and Groq have both run against the live API and produced real
  enrichment for the first 54 published stories this product ever enriched —
  this is no longer an untested path. `scripts/ai-smoke.ts` still only
  exercises Anthropic end to end (grounding, cost, cache-hit checks); extend
  it to Gemini/Groq, or fold it into `tools/eval-ai.ts`.
- No batch API usage — enrichment would be ~50% cheaper via Message Batches.
- Enrichment is not incremental: a story is enriched once and never revisited
  when the cluster gains corroborating sources.
- **Evaluation set for hallucination rate: built.** `tests/fixtures/ai-eval.ts`
  (19 real cases + 6 cases with a single fabricated figure or name injected)
  and `tools/eval-ai.ts` / `npm test -- ai-quality` measure the grounding
  checker (`src/lib/ai/grounding.ts`) at precision 1.000 / recall 1.000 as of
  writing. Building it caught three real defects in the checker before they
  shipped further (source name and sibling headlines excluded from the
  material; bullets scanned as one run-on sentence; standard abbreviations
  like "LGA"/"US" flagged as invented) — see the fixture file's header. Real
  caveats, same honest spirit as clustering's eval set below:
  - Every real case so far came back clean. The set has never seen a genuine
    hallucination, only synthetic ones. If production ever produces a real
    one, it should replace an injected case rather than sit alongside it.
  - It is a *grounding* check — numbers and proper nouns present in the
    supplied material — not a judge of whether correctly-grounded output is
    actually a *good* summary. Fluency, completeness, and whether
    "why it matters" is genuinely insightful are still unmeasured.
  - 25 cases from the first batch Gemini/Groq ever enriched. Grow it as more
    real output accumulates, the same way the clustering set should grow.

### Ranking
- Importance scoring is hand-tuned heuristics. It is transparent and adjustable
  but has never been measured against human editorial judgement. Clustering
  now has a labelled eval set; ranking still does not, and it is the more
  valuable of the two to build next.
- No personalisation, no reading history, no trending detection.
- The clustering eval set is 88 pairs from a single 793-story snapshot. It is
  real data and it caught real defects, but it is small and drawn from one news
  cycle. Grow it as the corpus grows, especially with pairs that a human finds
  genuinely ambiguous — those were deliberately excluded rather than guessed.
- Recall is 0.710 at precision 1.000. The misses are known and listed by
  `npx tsx tools/tune-thresholds.ts`; most are events described in entirely
  different words ("Kano loses district head" vs "Tears as popular Kano
  district head dies"), which needs embeddings rather than token overlap.

### Product surface
- No user accounts, saved stories, or newsletters.
- No comments.
- No push notifications or breaking-news alerts.
- No dedicated region pages (state-level Nigerian news).
- No `/source/[slug]` pages — the registry is one flat page.
- No admin UI. Sources and ad slots are edited directly in the database.
- No image proxying/self-hosting; images hotlink to publisher CDNs, which will
  break when they rotate URLs and gives us no control over bandwidth.

### Advertising
- Ad slots render but nothing is wired to a real network. `GAM`/`ADSENSE`
  render a correctly-sized reserved container; the network loader script still
  needs adding to the layout once an account exists.
- No frequency capping, viewability tracking, or revenue reporting.
- `CUSTOM_HTML` injects operator-supplied markup via `dangerouslySetInnerHTML`.
  This is safe today because the `AdSlot` table has no public write path. **If
  an admin UI is ever added, that write path must be authenticated and this
  field restricted**, or it becomes stored XSS.

### Operations
- No error tracking (Sentry or equivalent).
- No structured logging or log aggregation.
- No alerting on `/api/health` returning `stale`/`empty`.
- No CI pipeline. Tests and build are run manually.
- No load testing.
- No backup or restore procedure for the production database.

### Accessibility & performance
- Not yet audited with a screen reader.
- No Lighthouse/Core Web Vitals baseline captured.
- Dark mode is implemented via `prefers-color-scheme` only — no manual toggle.

### Legal
- Attribution and excerpt limits are implemented, but the licensing posture has
  not been reviewed by a lawyer. Do that before scaling traffic.
- No takedown request workflow beyond the note on `/about`.
- No privacy policy or terms of service pages.
