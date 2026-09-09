# Migrations

These are **PostgreSQL** migrations, for production only.

Local development and CI run on SQLite via `npm run db:push`, which applies the
schema directly and needs no migration history. That split is deliberate: it
keeps local setup to zero infrastructure while production still gets a
reviewable, ordered schema history.

## Production

First deploy (creates every table):

```bash
DATABASE_URL="postgresql://..." DATABASE_PROVIDER=postgresql npm run db:deploy
```

If the database already has the schema (because it was created with
`db push` before migrations existed), baseline it instead so the initial
migration is not re-applied:

```bash
DATABASE_PROVIDER=postgresql npx prisma migrate resolve --applied 00000000000000_init
```

## Changing the schema

1. Edit `prisma/schema.prisma`, keeping the portability contract at the top of
   that file — no native enums, scalar lists or `Json` columns, or local SQLite
   development breaks.
2. Generate the migration against a Postgres URL:
   `DATABASE_PROVIDER=postgresql npx prisma migrate dev --name your_change`
3. Run `npm run db:push` locally to bring SQLite in line, and `npm test`.
