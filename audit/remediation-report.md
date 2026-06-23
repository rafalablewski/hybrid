# HYBRID — Enterprise Due-Diligence Audit: Remediation Report

**Branch:** `claude/enterprise-due-diligence-audit-00gidh`
**Scope:** Security, access control, data integrity, concurrency, and scalability hardening across `packages/core`, `apps/web` (incl. the `/api` backend), `apps/mobile`, and `prisma/schema.prisma`.
**Outcome:** 25 findings remediated across 25 commits. `@hybrid/core` test suite green (560/560); `apps/web` and `apps/mobile` typecheck clean. Four database migrations authored (idempotent) and applied; one optional infrastructure item (shared rate-limit store) remains a deployment-time decision.

---

## 1. Executive summary

This engagement reviewed the HYBRID platform for the classes of defect that matter at enterprise scale: authorization bypasses, race conditions on money- and access-bearing state machines, multi-tenant data-integrity gaps, and query patterns that do not survive growth. Findings were triaged by exploitability and blast radius, then fixed one at a time with a verification gate (typecheck + unit tests) on every change.

The most material risks were **authorization and replay** defects that translated directly into revenue leakage or privilege escalation:

- A **paywall bypass** in which the paid entitlement was read from client-writable auth metadata rather than the database of record.
- **Replay / double-spend** windows on the agent-approval queue, the Apple in-app-purchase verifier, and the Stripe webhook — each a non-idempotent state transition under concurrent or retried delivery.
- A **privilege-escalation** path allowing an org `DIRECTOR` to mint or promote an `OWNER`.

Alongside these, a family of **lost-update** race conditions (coach-group membership, coach-link lifecycle, check-in replies) and **cross-tenant data leaks** (logout state retention, an unvalidated session reference) were closed. Finally, the highest-traffic read and fan-out paths were re-engineered to push aggregation into SQL, eliminate N+1 query loops, cache global config, and make the wearable-sync and email-campaign subsystems durable.

All fixes preserve the codebase's existing conventions: shared logic lives in `packages/core`, web↔mobile feature parity is maintained in the same change, and every database-dependent change degrades gracefully when its migration has not yet been applied.

---

## 2. Methodology

1. **Triage** — findings ranked by severity (Critical → High → Medium) and by whether they were exploitable today versus latent at scale.
2. **Single-finding commits** — each fix is an isolated, reviewable commit with an explicit rationale in the message, so the remediation is auditable and individually revertible.
3. **Verification gate** — `pnpm --filter @hybrid/core test`, `pnpm --filter @hybrid/web typecheck`, and `pnpm --filter @hybrid/mobile typecheck` were run after every change; new pure logic (e.g. `canAssignRole`) ships with unit tests.
4. **Migration discipline** — schema changes are authored as idempotent SQL the operator runs in the Supabase SQL Editor (the build sandbox cannot reach the database), and the application code soft-degrades until the migration lands.
5. **Parity rule** — any client-side fix is mirrored across web and mobile in the same commit, per the project's single-product-two-clients invariant.

---

## 3. Findings & remediations

Severity legend: **C** = Critical, **H** = High, **M** = Medium.

### 3.1 Authorization & access control

#### F-01 (C) — Paywall bypass: entitlement read from client-writable metadata
**Commit:** `7314d3e` · `fix(security): read paid entitlement from DB, not user-writable metadata`
The "paid" gate trusted `session.user_metadata.entitlement`, which a client can influence, rather than the `User.entitlement` column written only by the billing backend. A user could self-grant the Full (athlete) experience without paying.
**Fix:** Entitlement is resolved server-side from the database of record; auth metadata is treated as a non-authoritative mirror for UI only.

#### F-07 (H) — Org privilege escalation: DIRECTOR can create/promote an OWNER
**Commit:** `2f322f2` · `fix(org): only an OWNER may grant/promote the OWNER role`
`canManageOrg` admitted both `OWNER` and `DIRECTOR`, and assignable roles were validated only against the full role list (which includes `OWNER`). A `DIRECTOR` could `POST` a new `OWNER` member or `PATCH` an existing member up to `OWNER` and seize the organization.
**Fix:** Introduced `canAssignRole(actor, target)` in `packages/core` — managers may assign staff roles, but only an `OWNER` may grant `OWNER` — enforced on both the member-invite (`POST`) and role-change (`PATCH`) routes. Unit-tested.

#### F-24a (M) — Assignment session reference not ownership-validated
**Commit:** `cda6042` · `fix(integrity): guard checkin reply clobber + validate assignment session`
The assignment `PATCH` stored any `sessionId` supplied by the caller as the "completed session" without checking that the session belonged to the athlete, permitting a cross-tenant identifier to be persisted.
**Fix:** Validate that the linked session's `userId` matches the assignment's athlete before storing it.

### 3.2 Replay, idempotency & double-spend

#### F-02 (C) — Agent-approval double-spend
**Commit:** `4356158` · `fix(agents): claim approval atomically before executing (no double-spend)`
The approval handler checked status, then executed, then marked complete — a read-then-act window in which two concurrent approvals could both execute the same costly agent run.
**Fix:** Atomic claim-before-execute via a guarded `updateMany` (status transition as the gate); the loser is a no-op.

#### F-03 (C) — Cron double-run / double-send
**Commit:** `76a936e` · `fix(cron): claim before running/sending so overlapping crons can't duplicate`
Overlapping cron invocations could each pick up the same scheduled agent run, campaign, or automation step and process it twice.
**Fix:** Claim-before-acting across the cron paths (scheduled agents, email campaigns, lifecycle steps): only the invocation that wins the guarded status transition proceeds.

#### F-04 (H) — Apple IAP replay across accounts
**Commit:** `4ca7496` · `fix(billing): bind Apple IAP transaction to one account (no replay)`
A valid StoreKit `originalTransactionId` was not bound to a single account, so the same purchase could be replayed to grant entitlement on multiple accounts.
**Fix:** Added a unique `User.appleOriginalTransactionId`; verification binds a transaction to exactly one account and rejects reuse.

#### F-08 (H) — Stripe webhook: no idempotency, no ordering guarantee
**Commit:** `3743227` · `fix(billing): make Stripe webhook idempotent + reorder-safe`
The handler verified signatures but never deduplicated events. Stripe retries on any non-2xx and may redeliver/reorder events, so replays re-applied entitlement changes (and re-fired the "upgraded" email), and a late `subscription.deleted` retry landing after a re-subscribe could downgrade a paying user.
**Fix:** A `ProcessedWebhookEvent` idempotency ledger (event id as primary key) short-circuits redeliveries; on handler failure the claim is released so Stripe's retry still processes. An out-of-order guard (`User.subscriptionStatusAt`, set from `event.created`) ignores any subscription event older than the last applied one.

#### F-24b (M) — Coach program assignment not idempotent
**Commit:** `2473a40` · `fix(coach-programs): make program assignment idempotent`
`assign` did a `createMany` with no dedup and `Assignment` has no natural unique key, so a double-click or retry materialized the entire program onto the client's calendar twice.
**Fix:** Wrapped in a transaction that first deletes this coach's prior assignments to these clients on exactly the slots being written (same date + name), then inserts — re-assigning replaces rather than duplicates.

### 3.3 Concurrency & lost updates

#### F-06 (H) — User resolution: write-per-request + first-login race
**Commit:** `bbe4266` · `fix(auth): read-first user resolution; survive concurrent first-login race`
`getOrCreateDbUser` ran an unconditional `upsert` on every authenticated request (a row lock + WAL write on the hottest table before any real work) and, under the parallel request fan-out on first load, two requests could both `INSERT` and surface the loser's `P2002` as an intermittent 500.
**Fix:** Read-first — `findUnique` by `authId`, create only on first sight (catching `P2002` and re-reading to resolve the race), and update only when the email actually changed. The signup lifecycle fires on a precise `created` flag rather than a `createdAt`-within-30s heuristic.

#### F-12 (H) — Coach-group membership lost update
**Commit:** `2021c64` · `fix(coach-groups): atomic add/remove deltas instead of whole-array replace`
Group membership was a read-modify-write: the client computed a new `clientIds` array from a possibly-stale snapshot and `PATCH`ed the whole array, so concurrent toggles silently clobbered each other.
**Fix:** Atomic single-statement array operations server-side (`array_append` with dedup / `array_remove` under the row lock) via `addClientId`/`removeClientId`; web and mobile toggles send a delta with an optimistic local update. The membership-is-not-a-grant rule is preserved (add validates an `ACTIVE` link).

#### F-14 (M) — Coach-link accept/end transition race
**Commit:** `b767c64` · `fix(coach-link): guard accept/end transitions so terminate always wins`
`accept` and `end` both branched on a stale status read, so a client `accept` interleaved with a coach `end` could resurrect a link the coach had just terminated.
**Fix:** Guarded transitions — `accept` only `PENDING→ACTIVE` (409 if no longer pending); `end` moves from any non-`ENDED` state (idempotent). Both orderings converge; terminating intent cannot be overwritten.

#### F-24c (M) — Check-in reply clobber across multiple coaches
**Commit:** `cda6042` · `fix(integrity): guard checkin reply clobber + validate assignment session`
A client may have more than one `ACTIVE` coach; a blind update let a second coach's reply silently overwrite the first.
**Fix:** Claim the single-author field with `updateMany` where `coachReply` is null; a later reply receives 409.

#### F-21 (M) — Agent token spend lost on mid-run failure
**Commit:** `9fec163` · `fix(agents): record real token spend when a run fails mid-flight`
Failed runs were recorded as zero token usage, but a multi-turn executive may have already spent real tokens across several model calls — undercounting the 7-day budget and letting a repeatedly-failing agent exceed its cap.
**Fix:** `runExecutive` throws `AgentRunError` carrying the tokens accumulated so far (plus partial steps/output); every error-path `recordRun` (approvals, cron, admin run + stream) records `partialFromError(e)` instead of zero.

### 3.4 Data integrity, privacy & resilience

#### F-09 / F-22 (H) — User-scoped state retained across logout / user switch
**Commit:** `fa390a4` · `fix(session): clear user-scoped state on logout (web + mobile)`
`logout` removed only the session key and nulled the context, leaving the persona module singletons (module-scoped, shared across the tab) and every other `hybrid.*` key intact — persona, sport, in-progress workout draft, onboarding answers, coach-invite token. On a shared device the next user inherited the previous user's state and could save a draft into the wrong account; a cached fetch guard also suppressed the fresh active-coach lookup.
**Fix:** Added `resetPersona()` (web + mobile) and a `clearClientState()` that wipes the whole `hybrid.*` namespace except device-level prefs (`lang`, `tourSeen`, `announce.dismissed`), invoked on explicit logout **and** on token-expiry / cross-tab `SIGNED_OUT`. Mobile `signOut` clears AsyncStorage + persona to match (parity).

#### F-19 (M) — Suppression check fails open on a live DB error
**Commit:** `1df26ba` · `fix(email): suppression check fails CLOSED on a live DB error`
`isSuppressed` returned `false` on any error, so a transient database blip made the system treat an opted-out address as mailable — emailing unsubscribed users (CAN-SPAM / GDPR exposure).
**Fix:** Fail-open is retained only for "table not migrated" (`P2021`/`P2010`); any other error fails closed (skips the send) and is logged.

#### F-20 (M) — Valid OAuth refresh token nulled on re-auth
**Commit:** `160ed36` · `fix(connect): don't null a valid refresh token on OAuth re-auth`
Providers often omit `refresh_token` on a subsequent grant; the upsert wrote `protectToken(undefined) → null`, wiping a still-valid refresh token (and could blank scope).
**Fix:** Only overwrite `refreshToken`/`scope` when the provider actually returns them.

#### F-23 (H) — Wearable sync dies on token expiry (no refresh)
**Commit:** `ca6e4c1` · `fix(connect): refresh wearable OAuth tokens instead of dying on expiry`
`refreshToken`/`expiresAt` were stored but never used; on a 401 the sync simply marked the connection `error` and asked the user to reconnect. WHOOP/Oura access tokens expire in hours/days, so every athlete's wearable feed silently stopped (readiness/HPI quietly degrading) until they noticed.
**Fix:** Added `refreshAccessToken()` (the OAuth `refresh_token` grant — persists rotated tokens encrypted, only overwrites the refresh token when the provider returns a new one) wired into sync proactively when the token is at/near expiry and reactively on a 401 (refresh once + retry) before falling back to the reconnect prompt.

#### F-10 (H) — Email campaign fan-out: unbounded, non-resumable, double-send risk
**Commit:** `6bc63cd` · `fix(email): resumable, leased campaign fan-out (no timeout / double-send)`
`sendCampaign` loaded the entire audience and sent sequentially in one request, marking the campaign sent in a single shot — guaranteed to time out at 100k recipients, with no way to resume (the campaign stuck in `sending`, which the cron never re-picked) and a risk of re-sending on a manual re-drive.
**Fix:** A sequence of bounded, resumable batches: `sendCampaign` processes `CAMPAIGN_BATCH` (500) recipients from an id cursor, persists progress atomically (increment tallies, advance `sendCursor`, flip to `sent` only on the final batch) and releases its lease; the cron now also picks up in-progress `sending` campaigns and lease-claims each (`lockedUntil`) so overlapping workers cannot process the same batch twice; the inline admin send uses the same lease and defers status to `sendCampaign`.

### 3.5 Scalability & performance

#### F-11 (H) — Missing indexes on hot query patterns
**Commit:** `cb0c3b3` · `perf(db): add composite indexes for hot query patterns`
Outside `userId`, the columns the application filters/sorts on were unindexed, so the hottest reads table-scanned and sorted in memory at scale (Session history/engine reads, Biometric and Checkin per-user time-ordered reads, global `User.createdAt` and `AgentRun` sorts).
**Fix:** Composite `@@index` definitions matching the real query shapes, delivered as an idempotent migration (see §4).

#### F-17 (H) — Coach roster N+1
**Commit:** `40b6edf` · `perf(coach-roster): collapse N+1 into one windowed query`
The roster ran one `session.findMany` per `ACTIVE` client inside `Promise.all` — a coach with hundreds of clients fired hundreds of concurrent queries and could exhaust the connection pool.
**Fix:** A single windowed query (`ROW_NUMBER()` partitioned per client, top 60) served by the new `Session(userId, startedAt)` index, then group/aggregate in memory. Same statistics, bounded work, one round trip.

#### F-15 (M/H) — admin/stats aggregates in JS over full-table fetches
**Commit:** `f34bbfa` · `perf(admin-stats): aggregate in SQL instead of full-table fetch + JS reduce`
The dashboard pulled every user/session in a 12-week window and bucketed them with a 12-iteration JS filter, fetched every distinct active user/coach merely to `.length` them, and loaded every agent run in 30 days to reduce cost in memory — all of which OOM/timeout at scale and transfer megabytes per page view.
**Fix:** Pushed it into SQL — growth buckets via `GROUP BY` on the 7-day-window index (≤12 rows), `COUNT(DISTINCT)` for MAU/active-coaches, and `agentRun.groupBy` with `_sum` tokens per agent (one row each) before applying the per-agent model price.

#### F-16 (M/H) — datanet/snapshot N+1
**Commit:** `7e430cf` · `perf(datanet): batch snapshot eligibility lookups + single createMany`
The snapshot looped over up to 500 users doing two queries each plus a per-user create — roughly 1,500 sequential queries per run.
**Fix:** Batched the two eligibility checks into one query each (active-RTP set + already-sampled set), filtered in memory, and persisted all samples in a single `createMany`. The per-athlete `athleteState` engine compute remains (inherent) but runs only for eligible athletes. A full queue/chunked job remains the right shape beyond 500 athletes and is noted in code.

#### F-18 (M) — No caching of global config reads
**Commit:** `08a8091` · `perf(cache): cache global config reads (flags, translations, exercises)`
Three endpoints serve identical global data to every client on nearly every app load but hit Postgres directly — hundreds of thousands of identical queries per day at 100k DAU.
**Fix:** Wrapped the global portion of each in `unstable_cache` with a 60s TTL (per-user logic such as flag grants stays a live read). Staleness is bounded to a minute with no fragile manual invalidation. (Tag-based busting was evaluated and deliberately omitted: Next.js 16 changed `revalidateTag` semantics and the behavior could not be verified in-sandbox; the short TTL is the safe choice.)

### 3.6 Infrastructure & maintainability

#### F-05 (H) — Rate limiter is per-instance (ineffective on a serverless fleet)
**Commit:** `41fc232` · `fix(guard): enforce rate limits fleet-wide via shared Upstash/KV store`
The limiter kept its counter in a per-instance in-memory `Map`; on a serverless platform each warm lambda has its own map, so a "20/min" limit effectively became `20 × instances` and reset on every cold start — no real protection on the expensive routes it guards (admin user-create, agent runs, email/campaign send, IAP, auth).
**Fix:** Backed by a shared store over the Redis REST API (reads either `KV_REST_API_*` or `UPSTASH_REDIS_REST_*`; no client library needed). Atomic fixed window via pipelined `INCR` + `PEXPIRE NX` + `PTTL`. Falls back to the in-process map when unconfigured or on a store blip (fail-open — a store outage must not 500 every protected route). `rateLimit` is now async; all 49 call sites were updated. Documented in `.env.example`.

#### F-25 (Debt) — Duplicated access-control normalization across clients
**Commit:** `8944e8e` · `refactor(core): share role/entitlement normalization across web + mobile`
The role + entitlement normalization in web and mobile `session.tsx` was byte-identical copy-paste — and it is access-control logic, so any drift would make the two clients disagree on who is admin/paid.
**Fix:** Lifted into `@hybrid/core` as `AuthRole` + `normalizeAuthRole`/`normalizeEntitlement` (named to avoid the existing server-side `security.normalizeRole`, which yields the uppercase `SecurityRole`). Both clients now consume the single source of truth.

#### Operational — Combined, transaction-safe migration
**Commit:** `ad989a0` · `docs(sql): combined audit migration + drop CONCURRENTLY for the SQL Editor`
The Supabase SQL Editor runs a script inside a transaction, where `CREATE INDEX CONCURRENTLY` errors (`25001: cannot run inside a transaction block`). The index DDL was switched to plain `CREATE INDEX` (brief lock, acceptable at current scale) and all four audit migrations were bundled into `reference/sql-audit-migrations.sql` to run in one pass. The optional `pg_trgm` user-search indexes remain `CONCURRENTLY` with a note to run them separately.

---

## 4. Database migrations

All four schema changes are reflected in `prisma/schema.prisma` and are delivered as **idempotent** SQL for the Supabase SQL Editor. The combined script is the recommended entry point:

| File | Contents |
|------|----------|
| **`reference/sql-audit-migrations.sql`** | **All four migrations in one pass (run this).** |
| `reference/sql-performance-indexes.sql` | Composite indexes (F-11), standalone. |
| `reference/sql-webhook-idempotency.sql` | `ProcessedWebhookEvent` + `User.subscriptionStatusAt` (F-08). |
| `reference/sql-apple-iap-binding.sql` | `User.appleOriginalTransactionId` + unique index (F-04). |
| `reference/sql-email-resumable-send.sql` | `EmailCampaign.sendCursor` + `lockedUntil` (F-10). |

> **Status: applied.** The operator confirmed the combined migration ran successfully.

**Note on `CONCURRENTLY`:** the indexes ship as plain `CREATE INDEX` so they run inside the editor's transaction. At present table sizes the build is near-instant. If a table later grows large enough that the brief write lock matters, rebuild that single index with `CREATE INDEX CONCURRENTLY` executed on its own (outside any transaction).

The application soft-degrades on each of these until the migration is applied (e.g. the webhook idempotency ledger logs and proceeds, suppression treats a missing table as fail-open), consistent with the codebase's existing pattern.

---

## 5. Outstanding / deployment-time items

1. **Shared rate-limit store (optional, recommended).** Provision a Vercel KV or Upstash Redis store and set `KV_REST_API_URL` + `KV_REST_API_TOKEN` (or the `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` pair). Until then the limiter falls back to per-instance in-memory enforcement. Documented in `.env.example`.
2. **`account/reset` atomicity — intentionally unchanged.** The destructive self-service reset deletes per table inside individual `try/catch` blocks so it tolerates not-yet-migrated tables. Wrapping it in a single transaction would trade that resilience for atomicity (one missing table would abort the entire reset). This was a conscious design choice in the codebase; it is flagged here rather than silently altered. If full atomicity is later preferred, it should be paired with a guarantee that all referenced tables exist.
3. **Queue-backed batch jobs (future scale).** `datanet/snapshot` (F-16) is batched but still bounded at 500 athletes per run; beyond that, a queue/chunked job is the correct shape. Similarly, the email fan-out (F-10) is now resumable across cron ticks — adequate for current scale, with a dedicated job runner the natural next step.

---

## 6. Verification

Run from the repository root:

```bash
pnpm --filter @hybrid/core test        # 560 passing
pnpm --filter @hybrid/web typecheck    # clean
pnpm --filter @hybrid/mobile typecheck # clean
```

Every commit on the branch passed these gates at the time it was authored. New pure logic (`canAssignRole`) is covered by unit tests in `packages/core/src/org.test.ts`.

---

## 7. Commit ledger

Oldest first, on `claude/enterprise-due-diligence-audit-00gidh` (25 commits; 87 files; +1209 / −305):

| # | Commit | Summary |
|---|--------|---------|
| 1 | `7314d3e` | fix(security): read paid entitlement from DB, not user-writable metadata |
| 2 | `4356158` | fix(agents): claim approval atomically before executing (no double-spend) |
| 3 | `76a936e` | fix(cron): claim before running/sending so overlapping crons can't duplicate |
| 4 | `4ca7496` | fix(billing): bind Apple IAP transaction to one account (no replay) |
| 5 | `41fc232` | fix(guard): enforce rate limits fleet-wide via shared Upstash/KV store |
| 6 | `bbe4266` | fix(auth): read-first user resolution; survive concurrent first-login race |
| 7 | `2f322f2` | fix(org): only an OWNER may grant/promote the OWNER role |
| 8 | `3743227` | fix(billing): make Stripe webhook idempotent + reorder-safe |
| 9 | `fa390a4` | fix(session): clear user-scoped state on logout (web + mobile) |
| 10 | `cb0c3b3` | perf(db): add composite indexes for hot query patterns |
| 11 | `2021c64` | fix(coach-groups): atomic add/remove deltas instead of whole-array replace |
| 12 | `b767c64` | fix(coach-link): guard accept/end transitions so terminate always wins |
| 13 | `1df26ba` | fix(email): suppression check fails CLOSED on a live DB error |
| 14 | `160ed36` | fix(connect): don't null a valid refresh token on OAuth re-auth |
| 15 | `40b6edf` | perf(coach-roster): collapse N+1 into one windowed query |
| 16 | `cda6042` | fix(integrity): guard checkin reply clobber + validate assignment session |
| 17 | `2473a40` | fix(coach-programs): make program assignment idempotent |
| 18 | `8944e8e` | refactor(core): share role/entitlement normalization across web + mobile |
| 19 | `9fec163` | fix(agents): record real token spend when a run fails mid-flight |
| 20 | `08a8091` | perf(cache): cache global config reads (flags, translations, exercises) |
| 21 | `f34bbfa` | perf(admin-stats): aggregate in SQL instead of full-table fetch + JS reduce |
| 22 | `ca6e4c1` | fix(connect): refresh wearable OAuth tokens instead of dying on expiry |
| 23 | `7e430cf` | perf(datanet): batch snapshot eligibility lookups + single createMany |
| 24 | `6bc63cd` | fix(email): resumable, leased campaign fan-out (no timeout / double-send) |
| 25 | `ad989a0` | docs(sql): combined audit migration + drop CONCURRENTLY for the SQL Editor |
