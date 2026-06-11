# Runbook: applying a Prisma migration to production

Production is the Neon database behind `DATABASE_URL_UNPOOLED` in `.env.local`.
Nothing automated migrates it — applying a migration is always a deliberate,
manual step run by Andrew.

## 1. Verify what prod has (read-only, safe anytime)

```sh
npm run verify:prod-migration
```

Introspects prod (currently pinned to `20260429002752_phase2`) and prints:

- the `_prisma_migrations` ledger row for the migration
- per-object presence (enums, enum values, tables, columns, indexes)
- any local migration folders missing from the prod ledger
- a verdict: `APPLIED`, `NOT APPLIED`, or `PARTIAL/DRIFT`

It only ever runs `SELECT`s. Exit code 0 = applied, 2 = action needed.

## 2. Apply (the one command)

```sh
npx prisma migrate deploy
```

Forward-only: applies every unapplied folder under `prisma/migrations/` in
order, records each in `_prisma_migrations`, and never resets or rolls back.
It reads the datasource URL from the environment (`.env.local`).

Never run `prisma migrate dev`, `prisma migrate reset`, or `prisma db push`
against production.

## 3. After deploying

```sh
npm run verify:prod-migration   # confirm the verdict flips to APPLIED
npx prisma generate             # refresh the client if the schema changed
```

Restart the dev server if it was running, so it picks up regenerated types.

## If the verdict is PARTIAL/DRIFT

The ledger and the actual objects disagree (e.g. a migration failed halfway,
or something was created by hand). Do **not** run `migrate deploy` blindly —
read the per-object report, reconcile manually in the Neon console or with
`prisma migrate resolve`, and re-verify.
