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
- ~40% of registry feeds are unreachable from the build environment and were
  never confirmed working end-to-end. Most Nigerian government agency sites
  (CBN, NCC, NAFDAC, NDLEA, FRSC, SEC, FIRS, Customs, Immigration, JAMB, WAEC,
  NECO, NNPC, NERC, National Assembly, INEC, State House) either 404 on
  `/feed/` or are unreachable. These are seeded as `PENDING`/`BROKEN` and skip
  cleanly. **Each needs its real feed URL, an API, or an HTML scraper.**
- Cloudflare-fronted publishers return 403 to our user agent from this network
  (Guardian Nigeria, The Nation, TheCable, FIJ, Daily Independent). They may
  work from a datacenter IP — verify after first deploy and, if not, negotiate
  access or use a compliant fetch path.
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
- **Structured outputs.** The Anthropic provider prompts for JSON and validates
  with Zod. Move to `output_config.format` for schema-guaranteed responses.
- No prompt caching, so the system prompt is re-billed on every story.
- No batch API usage — enrichment would be ~50% cheaper via Message Batches.
- Only one provider implemented behind the abstraction. Add a second to prove
  the seam holds.
- No evaluation set for summary quality or hallucination rate. **This should be
  the first thing built before AI output is trusted at scale.**
- Enrichment is not incremental: a story is enriched once and never revisited
  when the cluster gains corroborating sources.

### Ranking
- Importance scoring is hand-tuned heuristics. It is transparent and adjustable
  but has never been measured against human editorial judgement.
- No personalisation, no reading history, no trending detection.
- Cluster quality is untested at scale — thresholds in `src/lib/dedupe.ts` were
  set by inspection and one failing test, not by a labelled dataset.

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
