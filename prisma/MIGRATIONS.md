# Prisma migrations — baseline & operations

## What changed (and why)

`prisma/migrations/` previously held a single `0_init` migration that created only
**7 of the 64 tables**. Every other table was added by hand-running scripts in
`reference/*.sql`, so the schema was **not reproducible from migration history**:

- `prisma migrate deploy` on a fresh database produced a broken 7-table DB.
- There was no rollback, no disaster-recovery rebuild, no staging/preview branch,
  and `prisma migrate status` reported permanent drift.
- It is also *why* the live RLS/cascade state can't be trusted — nobody could
  diff deployed-vs-declared (audit finding C-3).

`0_init/migration.sql` has been **regenerated from `prisma/schema.prisma`** as a
complete **64-table baseline** (all tables, enums, indexes, and the 47
`ON DELETE CASCADE` FKs), via:

```bash
prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
```

So now `prisma migrate deploy` reproduces the entire schema on any fresh
environment.

> **Scope:** the baseline covers the Prisma **datamodel** (tables/columns/indexes/
> FKs). It does **not** contain the Row-Level-Security policies, `GRANT`/`REVOKE`
> statements, `SECURITY DEFINER` helper functions, or the extra performance
> indexes — those aren't part of the Prisma model and remain in `reference/*.sql`
> (run `reference/sql-all.sql`). Think of it as two layers: **Prisma owns the
> schema; the reference SQL owns the security/policy layer.** See "The security
> layer" below.

---

## Fresh environment (staging, preview, DR rebuild)

A brand-new, empty database:

```bash
cd apps/web            # DATABASE_URL / DIRECT_URL point at the new DB
pnpm prisma migrate deploy      # applies 0_init → full 64-table schema
# then apply the security layer:
#   run reference/sql-all.sql in the Supabase SQL Editor (RLS + grants + indexes + cascade)
```

That's it — the schema and the security layer are both reproducible.

---

## Reconciling the EXISTING production database (do this once, carefully)

⚠️ **Never run `prisma migrate deploy` against production before doing this.**
Production already has all 64 tables (created via the manual scripts) and has the
*old* `0_init` recorded in its `_prisma_migrations` table with the *old* checksum.
Because `0_init/migration.sql` now has different content, Prisma would either
report the migration as "modified after applied" or try to re-create tables that
already exist. The tables must be left in place; we only fix the **bookkeeping**
so Prisma agrees the baseline is already applied.

This requires direct DB access (the CI sandbox cannot reach Supabase). Run from a
machine that can reach `DIRECT_URL`:

1. **Back up first** (Supabase dashboard → Database → Backups, or `pg_dump`).

2. **Confirm the schema already matches the baseline** — this should report *no
   difference*; if it does show a diff, resolve that first (it means prod drifted
   from `schema.prisma`):

   ```bash
   cd apps/web
   pnpm prisma migrate diff \
     --from-url "$DIRECT_URL" \
     --to-schema-datamodel ../../prisma/schema.prisma \
     --exit-code        # exit 0 = no drift; exit 2 = drift (inspect the printed diff)
   ```

3. **Clear the stale migration bookkeeping** (the tables stay; only the ledger row
   goes). In the Supabase SQL Editor:

   ```sql
   delete from "_prisma_migrations" where migration_name = '0_init';
   ```

4. **Mark the new baseline as applied WITHOUT running it** (prod already has the
   tables):

   ```bash
   cd apps/web
   pnpm prisma migrate resolve --applied 0_init
   ```

5. **Verify** a clean state:

   ```bash
   pnpm prisma migrate status      # should say "Database schema is up to date!"
   ```

6. **Apply/refresh the security layer** if you haven't: run `reference/sql-all.sql`
   in the Supabase SQL Editor (idempotent).

---

## Going forward — stop hand-running DDL

For any future schema change, let Prisma own it:

```bash
cd apps/web
# edit prisma/schema.prisma, then:
pnpm prisma migrate dev --name <change>     # generates + applies a new migration locally
# commit prisma/migrations/<ts>_<change>/, then in prod:
pnpm prisma migrate deploy
```

- New **table/column/index/FK** changes → Prisma migration (above).
- New **RLS policy / grant / function / policy-only index** → add to `reference/`
  and keep `reference/sql-all.sql` current (these live outside the datamodel).
- Gate CI on a clean `prisma migrate status` once prod is reconciled, so drift
  can't silently return.

## The security layer (`reference/*.sql`)

The Prisma baseline creates the tables with the correct **cascade** behavior, but
Supabase-specific concerns stay in `reference/`:

- `reference/sql-all.sql` — RLS enable + policies + `GRANT`/`REVOKE` + the
  `SECURITY DEFINER` helpers + extra performance indexes + FK-cascade
  reconciliation. **Run it after `migrate deploy` on any environment.**
- After running, verify RLS is actually on:
  ```sql
  select relname, relrowsecurity from pg_class
  where relnamespace = 'public'::regnamespace and relkind = 'r'
  order by relrowsecurity, relname;   -- every row must be true
  ```

Once prod is reconciled and the reference SQL is applied, the database is
reproducible (Prisma) *and* correctly secured (reference SQL), with no drift.
