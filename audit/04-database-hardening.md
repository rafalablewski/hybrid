# 04 — Database Hardening

Three categories of DB work, all shipped as reviewed, idempotent SQL (the sandbox could not reach the Supabase host). **All four scripts have been applied by the team.**

The one file to run is **`reference/sql-all.sql`** — it bundles everything below in dependency order, runs as a single transaction, and is safe to re-run.

---

## 1. Performance indexes — `reference/sql-perf-indexes.sql`

`Session` had only `@@index([userId])`, but the dominant query across History and every analytics engine is *"this user's sessions, newest first"* — a per-user sort. Added composite indexes that match the real query shapes:

| Index | Serves |
|-------|--------|
| `Session(userId, startedAt)` | History + all session-derived analytics |
| `Checkin(userId, sharedWithCoach)` | coach reading a client's shared check-ins |
| `Assignment(athleteId, date)` | calendar reads by date |

Mirrored in `prisma/schema.prisma` so the schema and DB stay in sync.

> **The `CONCURRENTLY` fix:** the initial file used `CREATE INDEX CONCURRENTLY`, which Postgres forbids inside a transaction block — and the Supabase SQL Editor wraps every run in one. Dropped `CONCURRENTLY` (a plain `CREATE INDEX` only briefly locks writes; negligible pre-launch). For a large live table you'd instead run each `CONCURRENTLY` statement on its own, outside a transaction.

---

## 2. Account-deletion cascade — `reference/sql-ondelete-cascade.sql`

**Finding (F1):** almost every relation to `User` had no `onDelete` rule (Prisma default `Restrict`), so a raw/RLS delete of an account would either hard-fail or orphan PII — a gap a schema-level security review flags even though the app already deletes children explicitly in the admin-delete and `/account/reset` routes.

**Fix:** `onDelete: Cascade` on every owned + relationship FK (and `SetNull` on the self-referential `Team.parent`), added to `prisma/schema.prisma` and emitted as exact drop/recreate SQL via `prisma migrate diff`.

- **Behaviour-preserving for the app** (children are already deleted first); pure defense-in-depth for the raw/RLS path.
- Tables that store `userId` as a plain `String` (no FK relation) were already orphan-safe.
- Idempotent: `DROP CONSTRAINT IF EXISTS` before each `ADD`.

> **Design note — why cascade, not an `orgId` column:** the original audit framed this as a missing tenant column. On inspection, athlete data here is **user-owned** (a user can belong to several orgs and have a coach simultaneously), so an `orgId` column would mis-model ownership. The correct boundary is relationship-based (Membership / CoachLink), which the API already enforces, backstopped by RLS (below).

---

## 3. Row-Level Security — `reference/rls-policies.sql` + `reference/sql-rls-extend.sql`

This was the most consequential database finding.

### 3.1 What was discovered (F2 / B6)

1. **The existing `rls-policies.sql` created policies but never ran `ENABLE ROW LEVEL SECURITY`.** A Postgres policy is **inert** until RLS is enabled on its table — so the entire defense-in-depth layer was doing **nothing**.
2. **~10 user-data tables had no policy at all** — including `Connection`, which stores OAuth access/refresh tokens. With the anon/PostgREST grants Supabase adds to the `public` schema, these were potentially directly readable by the anon key.

### 3.2 The fix (`sql-rls-extend.sql`)

- **Enables RLS** on every sensitive table (including the ones the original file wrote inert policies for).
- **Self-ownership policies** for the user-owned tables — `Signal`, `Checkin`, `WorkoutTemplate`, `Assignment`, `RtpProtocol`, `VideoAnalysis`, `Event`, `TalentProfile`, `RiskOutcome`, `Connection`, `OnboardingState`, `FeatureGrant`, `AccessRequest`, `CoachApplication` — plus **coach-read** where the product allows it (e.g. a coach reads a client's `Signal` via an ACTIVE `CoachLink`; reads a `Checkin` **only** when `sharedWithCoach`).
- **Deny-all baseline** (RLS on, no permissive policy) for the relational / org / admin / agent / email tables — anon/PostgREST gets nothing; Prisma (the privileged role) retains full access, so the app is unaffected.

Every referenced column was verified against the schema before shipping.

### 3.3 Why it's safe

The app reads/writes via Prisma using the **privileged postgres role, which bypasses RLS**, so none of this changes application behaviour. It strictly restricts **direct anon-key / PostgREST access**, which the app never uses for data. This is the canonical Supabase "lock the public schema, serve through your API" posture — which this codebase intended (the policy file existed) but had never actually activated.

---

## 4. The combined script — `reference/sql-all.sql`

One paste-and-run file, executed as a single transaction, in dependency order:

1. Performance indexes
2. ON DELETE cascade FKs
3. RLS helpers + base policies (defines `public.app_user_id()`, `public.is_active_coach()`)
4. RLS enable + extended coverage (depends on the helpers in step 3)

**Resilience:** every statement is guarded so a not-yet-migrated table is **skipped, not fatal**:
- `ALTER TABLE IF EXISTS …` (86 statements)
- `to_regclass('public."T"') IS NOT NULL` guards around the index + policy blocks, wrapped in `DO $$ … $$`
- `DROP CONSTRAINT IF EXISTS` for idempotent re-runs

**Verified before shipping:** 0 `CONCURRENTLY` statements, helper `$$`-bodies intact, all four part-boundaries clean, every policy column cross-checked against `schema.prisma`.

---

## 5. Net security posture change

| Before | After |
|--------|-------|
| RLS policies present but **inert** (never enabled) | RLS **enabled** on every sensitive table |
| `Connection` (OAuth tokens), `Signal`, `Checkin` etc. potentially anon-readable | self-ownership policies + deny-all baseline |
| Account deletion could orphan PII at the raw/DB level | FK cascades guarantee clean deletion |
| Hot reads doing per-user sorts | composite indexes matching the query shapes |
