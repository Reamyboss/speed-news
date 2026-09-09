# NaijaPulse

An AI-native Nigerian news and intelligence platform. It aggregates reporting
from a structured registry of sources, deduplicates it, groups independent
coverage of the same event, and publishes original summaries that always link
back to the newsroom that did the work.

---

## Quick start

```bash
npm install
cp .env.example .env      # defaults work with zero infrastructure
npm run bootstrap         # generate client, create schema, seed sources, ingest
npm run dev
```

`npm run bootstrap` pulls live feeds, so the first run takes about a minute and
needs outbound network access. Open <http://localhost:3000>.

---

## What is built (V1)

| Requirement | Where |
|---|---|
| Mobile-first responsive homepage | `src/app/page.tsx` |
| Nigeria, World, Business, Technology, Sports, Entertainment, Politics | `src/lib/taxonomy.ts`, `src/app/category/[slug]` |
| Search | `src/app/search/page.tsx` |
| Category pages | `src/app/category/[slug]/page.tsx` |
| Individual story pages | `src/app/story/[slug]/page.tsx` |
| Source attribution | `src/components/story-card.tsx`, story page `Attribution` + `SourcePanel` |
| Related stories | `getRelatedStories` in `src/lib/queries.ts` |
| AI story summary | `src/lib/ai/`, rendered by `AiBriefing` |
| "Why this matters" | same |
| Advertisement slots | `src/components/ad-slot.tsx`, `AdSlot` table |
| SEO metadata | `src/lib/seo.ts` |
| Open Graph / social | `src/lib/seo.ts`, `src/app/opengraph-image.tsx` |
| Analytics-ready | `src/components/analytics.tsx` |
| Error handling | `error.tsx`, `global-error.tsx`, `not-found.tsx`, `safeQuery` |
| Production deployment | `vercel.json`, `/api/health`, `/api/cron/pipeline` |

Deliberately deferred work is in [`BACKLOG.md`](./BACKLOG.md).

---

## Architecture

A single Next.js application. No microservices.

```
SOURCE → INGEST → NORMALIZE → DEDUPLICATE → STORE → CLUSTER → AI ENRICH → PUBLISH
```

- **Ingest** (`src/lib/ingest.ts`) — one source failing never fails the run.
  Errors are recorded on the registry row and a source is marked `BROKEN`
  after five consecutive failures, then reinstated automatically when it
  recovers.
- **Normalize** (`src/lib/feed.ts`, `src/lib/text.ts`) — RSS 2.0, RSS 1.0/RDF
  and Atom. All markup is stripped to text; script/style/iframe bodies are
  dropped wholesale. URLs are canonicalised (tracking params, AMP, casing) so
  the same article always produces the same key.
- **Deduplicate** (`src/lib/dedupe.ts`) — deduplication and clustering are
  separate operations and must stay that way. The same item twice is a
  duplicate; two newsrooms covering one event is a **cluster**, and both are
  kept because cross-source corroboration is the product.
- **Cluster** — links coverage of one event, powering "also reported by N other
  sources" and the corroboration input to ranking. The thresholds are fitted
  to a hand-labelled set, not guessed: see `tools/README.md` for the tuning
  loop and `src/lib/dedupe.ts` for the measured precision/recall. Display
  collapses each cluster to one story, so the front page shows an event once
  and states how many newsrooms carry it.
- **AI enrich** (`src/lib/ai/`) — runs *after* publishing, never before.

### AI is optional by construction

Every story carries a non-AI `summary` extracted from the publisher's feed, so
pages render completely with no provider configured. The AI layer only adds to
that. Providers sit behind the `AiProvider` interface (`src/lib/ai/types.ts`);
`NullProvider` is the honest no-op — it produces nothing rather than
synthesising a significance claim with no model behind it.

AI output passes a Zod schema before it is stored, and is rendered in a
labelled panel that states it was written by AI and that the source article is
authoritative.

### Database portability

One Prisma schema serves **SQLite** (local/CI, zero infrastructure) and
**PostgreSQL** (production). This is deliberate and constrains the schema: no
native enums, no scalar lists, no `Json` columns. Those vocabularies live in
`src/lib/taxonomy.ts` and are enforced by Zod in `src/lib/validation.ts`.

`scripts/set-db-provider.mjs` rewrites the datasource provider from
`DATABASE_PROVIDER`, or infers it from `DATABASE_URL`. It runs automatically on
`predev`, `prebuild` and `pretest`.

---

## The Source Registry

87 seeded sources in `src/data/sources.ts`, each typed and given a confidence
tier. 52 are active and pulling; the rest carry a status explaining why not
(see `scripts/discover-feeds.ts` and the Source coverage note below). **Sources are not treated as equally reliable.** Type and tier drive
ranking, display treatment, and whether an item may be presented as
established reporting at all.

Types: `PRIMARY_OFFICIAL`, `PROFESSIONAL_MEDIA`, `SPECIALIST_MEDIA`,
`DIGITAL_PUBLISHER`, `INTERNATIONAL_MEDIA`, `BROADCAST`, `RADIO`, `HISTORICAL`,
`EXPERT`, `CREATOR`, `SOCIAL_SIGNAL`, `UNVERIFIED`.

Tiers run 1 (primary source or wire) to 5 (unverified signal).

The registry is public at `/sources` — a reader who can see what feeds the
platform can calibrate their own trust.

```bash
npx tsx scripts/probe-sources.ts --json   # check every feed against the live web
```

### Licensing posture

We ingest feed metadata (headline, standfirst, link, image, timestamp) and
publish an original summary plus attribution and a link out. Excerpts are
capped at ingest (`MAX_EXCERPT_CHARS`). **Full articles are never mirrored.**

---

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm test` | Full test suite (156 tests) |
| `npm run typecheck` | TypeScript, no emit |
| `npm run bootstrap` | Schema + seed + first ingest, from scratch |
| `npm run seed:sources` | Seed/refresh the registry and ad inventory (idempotent) |
| `npm run ingest` | Pull feeds once (`--slugs punch,thecable`, `--max 25`) |
| `npm run enrich` | Run AI enrichment once (`--limit`, `--include-failed`) |
| `npm run pipeline` | Ingest then enrich |
| `npm run db:push` | Apply schema |
| `npm run db:studio` | Browse the database |
| `npx tsx scripts/rescore.ts` | Recompute ranking after tuning |
| `npx tsx scripts/stats.ts` | Data-quality readout |

---

## Testing

```bash
npm test
```

156 tests across seven suites. The critical logic named in the brief is covered:

- **Source normalization** — `tests/normalization.test.ts` (HTML sanitisation,
  entity decoding, URL canonicalisation, slugs, fingerprints, RSS/Atom parsing)
- **Duplicate detection** — `tests/dedupe.test.ts`, including the invariant
  that a second source covering the same event is *not* a duplicate
- **Story creation** and **source attribution** — `tests/pipeline.test.ts`,
  end-to-end against a real SQLite database with a local HTTP feed server
- **Category assignment** — `tests/classify.test.ts`
- **AI enrichment failure handling** — `tests/ai.test.ts` and
  `tests/pipeline.test.ts` (unavailable provider, upstream error, malformed
  JSON, schema rejection, retryable vs terminal)
- **Clustering accuracy** — `tests/cluster-quality.test.ts`, measured against
  `tests/fixtures/cluster-eval.ts`: 88 cross-source headline pairs taken from
  real production data and labelled by hand. Asserts precision stays at 1.000
  (no two different events ever merged) and names the offending pair when it
  does not.
- **Cron authorisation and production config** — `tests/cron-auth.test.ts`

Tests run against their own database (`prisma/test.db`), created and destroyed
per run. They never touch the development database.

---

## Deployment

### 1. Provision Postgres

Any managed Postgres (Neon, Supabase, RDS). Then:

```bash
DATABASE_URL="postgresql://..." DATABASE_PROVIDER=postgresql npm run db:push
DATABASE_URL="postgresql://..." DATABASE_PROVIDER=postgresql npm run seed:sources
```

### 2. Environment variables

Required:

```
DATABASE_URL=postgresql://...
DATABASE_PROVIDER=postgresql
NEXT_PUBLIC_SITE_URL=https://your-domain.com
CRON_SECRET=<random string>
```

Optional — the site works fully without them:

```
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
AI_MODEL=claude-opus-5
NEXT_PUBLIC_ANALYTICS_PROVIDER=plausible
NEXT_PUBLIC_ANALYTICS_DOMAIN=your-domain.com
```

`AI_MODEL` defaults to `claude-opus-5`. For high-volume enrichment
`claude-sonnet-5` or `claude-haiku-4-5` cost materially less — that is a cost
decision, so it is left explicit rather than silently downgraded.

### 3. Deploy

```bash
vercel --prod
```

`vercel.json` registers a two-hourly cron on `/api/cron/pipeline`. Vercel signs
its own cron calls; any other caller needs
`Authorization: Bearer $CRON_SECRET`. **The endpoint refuses to run
unauthenticated in production** — without it, anyone could force outbound
fetches and AI spend on your account.

### 4. Verify

```bash
curl https://your-domain.com/api/health
```

Returns `ok` (fresh content), `stale` (nothing new in 6h) or `empty` (503, no
content) plus source and pipeline counts. No secrets are exposed.

---

## Security

- Secrets are environment variables only. `.env` is gitignored; `.env.example`
  carries no real values.
- All external data is validated with Zod before it is stored
  (`src/lib/validation.ts`).
- Feed content is stripped to plain text and rendered as React strings, never
  via `dangerouslySetInnerHTML`. The single exception is operator-configured ad
  HTML, which has no public write path — see `BACKLOG.md`.
- Only `http(s)` URLs are accepted; `javascript:`, `data:` and `file:` are
  rejected at normalisation.
- The cron endpoint uses a constant-time secret comparison.
- Security headers are set in `next.config.ts`.

---

## Editorial rules

Encoded in `src/lib/ai/types.ts` and enforced in the prompt:

1. Use only the facts in the material provided.
2. Never state or imply that a source said something it did not.
3. If the reporting is too thin to establish significance, say so.
4. Do not speculate about motives, guilt, or future events.
5. AI inference is never presented as an original source's statement.
