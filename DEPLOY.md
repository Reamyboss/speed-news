# Deploying NaijaPulse

Everything below is verified except the steps that need credentials this
machine does not have. Those are marked **[NEEDS CREDENTIAL]**.

Current state: `npm test` 156 passed, `npm run build` clean, production smoke
test passed locally (see the bottom of this file for what was checked).

---

## What you need to supply

| Credential | Why | Where to get it |
|---|---|---|
| **Vercel login** | To deploy at all. The CLI is installed (59.13.1) but logged out. | `npx vercel login` in this directory |
| **PostgreSQL `DATABASE_URL`** | Production data. SQLite cannot be used — serverless instances share no filesystem, so writes are silently lost. `/api/health` reports this as a blocker. | Neon, Supabase, or RDS. Free tiers are fine to start. |
| **`ANTHROPIC_API_KEY`** | AI briefings. Optional — the site is complete without it, every story has a non-AI summary. | console.anthropic.com |

`CRON_SECRET` you generate yourself: `openssl rand -hex 32`.

---

## 1. Provision Postgres — **[NEEDS CREDENTIAL]**

```bash
export DATABASE_URL="postgresql://...?sslmode=require"
export DATABASE_PROVIDER=postgresql

npm run db:deploy      # applies prisma/migrations (reviewable, ordered)
npm run seed:sources   # 87 sources + 6 ad slots, idempotent
```

If the database already has the schema from an earlier `db push`, baseline it
instead so the initial migration is not re-applied:

```bash
DATABASE_PROVIDER=postgresql npx prisma migrate resolve --applied 00000000000000_init
```

Then fill it with content before the first visitor arrives:

```bash
npm run ingest    # ~20s across 52 active sources
```

## 2. Set environment variables in Vercel

Required:

```
DATABASE_URL=postgresql://...
DATABASE_PROVIDER=postgresql
NEXT_PUBLIC_SITE_URL=https://your-domain.com
CRON_SECRET=<openssl rand -hex 32>
```

Optional (the site works fully without these):

```
# Pick one primary; an optional second is used automatically when the
# primary rate-limits or is overloaded (Gemini 503s and Groq free-tier
# 429s are routine). Providers: gemini | groq | anthropic.
AI_PROVIDER=gemini
AI_FALLBACK_PROVIDER=groq
GEMINI_API_KEY=...
AI_GEMINI_MODEL=gemini-3.6-flash
GROQ_API_KEY=gsk_...
AI_GROQ_MODEL=openai/gpt-oss-20b
# Or Anthropic: ANTHROPIC_API_KEY=sk-ant-... and AI_MODEL=claude-opus-5
NEXT_PUBLIC_ANALYTICS_PROVIDER=plausible
NEXT_PUBLIC_ANALYTICS_DOMAIN=your-domain.com
```

**`CRON_SECRET` is not optional in production.** Without it the pipeline
endpoint refuses every request and no new content is ever ingested. Vercel adds
`Authorization: Bearer $CRON_SECRET` to its own cron invocations automatically
once the variable is set in the project, so nothing else needs wiring.

## 3. Deploy — **[NEEDS CREDENTIAL]**

```bash
npx vercel login
npx vercel --prod
```

`vercel.json` registers a two-hourly cron on `/api/cron/pipeline`.

## 4. Verify

```bash
curl https://your-domain.com/api/health
```

Expect `"status": "ok"` and `"config": {"ok": true, "issues": []}`.

The endpoint returns **503** and `"status": "misconfigured"` while any blocker
is outstanding, so this single request tells you whether the deploy is
actually working. Blockers it detects:

- `CRON_SECRET` missing, or shorter than 16 characters
- `DATABASE_URL` missing, or still pointing at a SQLite file
- no content at all

Then confirm the cron path works with the secret you set:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  https://your-domain.com/api/cron/pipeline
```

Expect `{"ok":true,...}` with a non-zero `sourcesSucceeded`.

## 5. Confirm the AI path against the live API — **[NEEDS CREDENTIAL]**

Never yet run against a real model. Run it against a small batch first:

```bash
ANTHROPIC_API_KEY=sk-ant-... npx tsx scripts/ai-smoke.ts --n 5
```

It checks summary and why-it-matters generation, Zod enforcement, failure
handling, grounding (every figure and proper noun in the output must appear in
the source material), attribution, and prints token usage with a per-story cost
projection. Read the output before enabling enrichment in the cron — a
grounding flag means the model added something the source did not say.

Then backfill:

```bash
npm run enrich    # AI_ENRICH_BATCH_SIZE caps each run, default 25
```

---

## Post-deploy checks worth doing once

Two assumptions cannot be tested from this network and should be confirmed from
the datacenter:

1. **Cloudflare-fronted publishers.** Guardian Nigeria, The Nation, TheCable and
   FIJ return 403 to our user agent from here. They are marked `PAUSED`, not
   broken. If they respond from Vercel's IPs, reactivate them:
   ```bash
   npx tsx scripts/discover-feeds.ts --slugs=guardian-nigeria,the-nation,thecable,fij --apply
   ```
   If they still refuse, that is a licensing conversation, not a technical one.
   Do not work around it.

2. **Rate-limited sources.** HumAngle and the Nigeria Police site returned 429.
   They should recover on their own; check `/api/health` `sources.broken` after
   a few cron cycles.

---

## What was verified locally

Production build, `NODE_ENV=production`, real Next server:

- `/api/cron/pipeline` returns **401** for: no credential, a wrong bearer
  token, and a spoofed `x-vercel-cron: 1` header.
- With the correct bearer token: **200**, and a real pipeline run
  (52 sources attempted, 38 succeeded, 23 stories created, 602 duplicates
  correctly rejected).
- `/api/health` returned **503 / "misconfigured"** with both blockers named
  while `CRON_SECRET` was empty and `DATABASE_URL` was SQLite, and cleared the
  secret blocker once it was set.
- `/`, `/category/business`, `/sources`, `/search?q=cbn` all **200**.
- Postgres provider switch and `prisma validate` both clean.
- `.env` is untracked and has never been committed; no secrets in tracked files.
