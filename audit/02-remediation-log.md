# 02 — Remediation Log

Every change shipped in this engagement, grouped by theme and mapped to its commit on `claude/production-readiness-audit-cshqbi`. **40 commits · 78 files · +1,996 / −579.**

Verification per commit: web `tsc --noEmit`, mobile `tsc --noEmit`, and `@hybrid/core` tests (562 passing) as applicable. Build-level verification noted where run.

---

## Security (7 commits)

| Commit | Change |
|--------|--------|
| `2cde177` | **Org OWNER privesc closed** — only an `OWNER` may grant the `OWNER` role; a `DIRECTOR` can no longer self-promote and seize the org. |
| `6777379` | **Assignment IDOR fixed** — a linked `sessionId` must belong to the assignment's athlete before it's written. |
| `659a7fb` | **Timing-safe cron auth + fail-closed unsubscribe secret** — `verifyBearerSecret` (constant-time, rejects when the secret is unset, killing the `Bearer undefined` bypass) across all four cron workers; the email-unsubscribe HMAC now fails closed instead of using a hardcoded constant. |
| `3843020` | **Role-seed escalation closed** — new users are always created `CLIENT`; role is never seeded from client-controllable `user_metadata`. |
| `faf1ab7` | **ON DELETE cascade** added to every user/relationship FK (GDPR safety net); SQL generated via `prisma migrate diff`. |
| `affc13b` | **RLS completed + enabled** — discovered the existing policies were inert (never `ENABLE`d) and 10 tables had none; `sql-rls-extend.sql` fixes both. |
| `39aef06` | **One-shot `sql-all.sql`** — fixed `CREATE INDEX CONCURRENTLY` in-transaction error; bundled all four migrations, every statement guarded for missing tables. |

## Engine correctness (6 commits, +3 tests)

| Commit | Change |
|--------|--------|
| `d496dbb` | **Macrocycle lands exactly on the event** — largest-remainder week distribution replaces independent rounding. Invariant test across horizons 1…52. |
| `ab5996f` | Follow-up: index-safe week distribution (strict `noUncheckedIndexedAccess`). |
| `dce33eb` | **Readiness NaN guard** + **progression/prescription sort by recency** (removes a latent trend-inversion landmine). |
| `5a09bfd` | **Accountability banding** — a recently-active high-risk athlete is `at-risk`, not `dormant`. Regression test. |
| `af87638` | **Force-plate units** — Newton "Weight" columns no longer ingested as kg body mass. Regression test. |

## Stale data & state (6 commits)

| Commit | Change |
|--------|--------|
| `6b87010` | Check-in/nutrition revalidate the shell's biometrics (later superseded by `useRevalidate`). |
| `9a0d471` | **Session-resolution race** fixed with a monotonic sequence guard. |
| `a8647ee` | **Cold-start flash** gated on first-load (Today renders a skeleton, not the empty state). |
| `2909c6c` | **Shared `/api/flags`** — one fetch across all consumers (was N). |
| `9f964ce` | **Mobile stale-on-focus** — 16 data screens refetch on focus (`useFocusEffect`). |
| `e079305` | **Agent HQ fetch race** — sequence-guarded so a stale overview can't overwrite a newer one. |

## Reliability & mobile native-feel (4 commits)

| Commit | Change |
|--------|--------|
| `c1ffd6f` | **Error + 404 boundaries** — `error.tsx`, `global-error.tsx`, `not-found.tsx` (on-brand, provider-independent). No more white-screen-of-death. |
| `90c731a` | **44pt touch targets** on workout reorder/remove + coach actions. |
| `47dbf19` | **Haptics** on the global nav (tab select + Train FAB), gated by the existing preference. |
| `143815f` | **Atomic agent budget pause** — `updateMany(WHERE status != paused)`; notification only on the call that performed the flip. |

## Performance — indexes & code-split (2 commits)

| Commit | Change |
|--------|--------|
| `6062e97` | **Composite indexes** — `Session(userId,startedAt)`, `Checkin(userId,sharedWithCoach)`, `Assignment(athleteId,date)` + migration SQL. |
| `2f3772f` | **Code-split** — `next/dynamic` over ~75 screens; default Aurora landing + chrome stay static. Build-verified: recharts out of the always-loaded entry; ~100 lazy chunks. |

## Keystone: web data layer (8 commits)

| Commit | Change |
|--------|--------|
| `6f80c2c` | Add `@tanstack/react-query` + app-wide `QueryClientProvider` (created in state; never module-scope). |
| `5aaff47` | `useSessions` → `useQuery` (6 call sites dedupe to 1 fetch). |
| `c289b96` | `useBiometrics` + `useSignals` → `useQuery`. |
| `611d625` | `useMacrocycle` → `useQuery`. |
| `a0cafd1` | `useRoster` → `useQuery`. |
| `3188fd9` | **`useRevalidate`** mutation→invalidate helper; removed the `onSaved`/`refreshBio` prop-plumbing. |
| `d58fa3a` | `useExercises` → `useQuery` (10-min static-catalog cache; picker stops re-fetching). |
| `87ecb66` / `518dcb6` | `coach.tsx` (links + groups) and `connections.tsx` → `useQuery`. |

## Keystone: mobile query parity (6 commits)

| Commit | Change |
|--------|--------|
| `0784118` | TanStack Query provider with RN-correct wiring — `focusManager` ↔ `AppState`, `useRefreshOnFocus`. |
| `1934fe1` | **12 session screens** read from the shared cache (was 12 independent fetches). |
| `60cc4a5` | Workout save invalidates `['sessions']`. |
| `3459ab6` | Nutrition + check-in on the signals cache; invalidate recovery on save. |
| `c60c969` | **History** ×2 on the cache (archived-aware key; archive/restore/delete invalidate). |
| `2cea0f4` | **Home** ×2 read sessions+signals from the cache (home-specific fetches stay local). |

## Process

| Commit | Change |
|--------|--------|
| `ba09778` | Recorded the deferred backlog as `planned`/`blocked` entries in `capabilities.ts` (per the project rule that deferred work is never buried in prose). |

---

## New files introduced

```
apps/web/components/query-provider.tsx   web QueryClientProvider
apps/web/lib/use-invalidate.ts           useRevalidate() mutation→invalidate helper
apps/web/app/error.tsx                    route error boundary
apps/web/app/global-error.tsx             root error boundary
apps/web/app/not-found.tsx                404
apps/mobile/lib/query.tsx                 RN QueryProvider + focusManager + useRefreshOnFocus
apps/mobile/lib/queries.ts               shared query hooks + useRevalidate
reference/sql-all.sql                     one-shot DB hardening (the file to run)
reference/sql-perf-indexes.sql           indexes
reference/sql-ondelete-cascade.sql        FK cascades
reference/sql-rls-extend.sql             RLS enable + extended coverage
```
