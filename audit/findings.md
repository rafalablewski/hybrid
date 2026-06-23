# Findings Index

Condensed reference. Full detail in [`remediation-report.md`](./remediation-report.md). Severity: **C**ritical / **H**igh / **M**edium / **D**ebt.

| ID | Sev | Area | Finding | Fix (one line) | Commit |
|----|-----|------|---------|----------------|--------|
| F-01 | C | AuthZ | Paid entitlement read from client-writable auth metadata (paywall bypass) | Resolve entitlement server-side from the DB of record | `7314d3e` |
| F-02 | C | Replay | Agent-approval read-then-act lets two approvals double-execute | Atomic claim-before-execute (guarded status transition) | `4356158` |
| F-03 | C | Replay | Overlapping crons run/send the same item twice | Claim-before-acting across cron paths | `76a936e` |
| F-04 | H | Replay | Apple IAP transaction replayable across accounts | Unique `appleOriginalTransactionId`; bind to one account | `4ca7496` |
| F-05 | H | Infra | Rate limiter per-instance → ineffective on serverless fleet | Shared Upstash/KV REST store; in-memory fallback | `41fc232` |
| F-06 | H | Concurrency | Auth upsert-per-request + first-login P2002 → 500 | Read-first; create-on-miss with P2002 re-read | `bbe4266` |
| F-07 | H | AuthZ | Org DIRECTOR can create/promote an OWNER | `canAssignRole`: only OWNER grants OWNER (+ tests) | `2f322f2` |
| F-08 | H | Replay | Stripe webhook not idempotent; reorder downgrades payer | Idempotency ledger + `subscriptionStatusAt` ordering guard | `3743227` |
| F-09 | H | Privacy | Logout retains user-scoped local state (shared device) | `clearClientState()` wipes `hybrid.*` except device prefs | `fa390a4` |
| F-22 | H | Privacy | Persona module singletons survive logout/user switch | `resetPersona()` (web + mobile) | `fa390a4` |
| F-11 | H | Scale | Hot reads unindexed outside userId | Composite indexes matching query shapes | `cb0c3b3` |
| F-12 | H | Concurrency | Coach-group membership whole-array replace → lost update | Atomic `array_append`/`array_remove` deltas (web + mobile) | `2021c64` |
| F-14 | M | Concurrency | Coach-link accept/end race resurrects ended link | Guarded transitions; terminate always wins | `b767c64` |
| F-19 | M | Privacy | Suppression check fails open on a live DB error | Fail closed except "table not migrated" | `1df26ba` |
| F-20 | M | Resilience | Valid OAuth refresh token nulled on re-auth | Overwrite refresh/scope only when returned | `160ed36` |
| F-17 | H | Scale | Coach roster N+1 (one query per client) | Single windowed query (`ROW_NUMBER` top-60) | `40b6edf` |
| F-24a | M | Integrity | Assignment `sessionId` not ownership-validated | Verify session belongs to the athlete | `cda6042` |
| F-24c | M | Concurrency | Check-in reply clobbered across multiple coaches | Claim single-author field (`coachReply` null guard) | `cda6042` |
| F-24b | M | Replay | Coach program assignment duplicates calendar on retry | Transactional delete-then-insert of exact slots | `2473a40` |
| F-25 | D | Maintainability | Role/entitlement normalization duplicated web/mobile | Lift to `@hybrid/core` (`normalizeAuthRole`/`normalizeEntitlement`) | `8944e8e` |
| F-21 | M | Integrity | Failed agent run records zero token spend | `AgentRunError` carries partial usage; record real spend | `9fec163` |
| F-18 | M | Scale | Global config reads hit Postgres on every load | `unstable_cache` 60s TTL on flags/translations/exercises | `08a8091` |
| F-15 | M/H | Scale | admin/stats aggregates in JS over full-table fetches | Push to SQL (GROUP BY, COUNT DISTINCT, groupBy sum) | `f34bbfa` |
| F-23 | H | Resilience | Wearable sync dies on token expiry (no refresh) | `refreshAccessToken()` proactive + reactive on 401 | `ca6e4c1` |
| F-16 | M/H | Scale | datanet/snapshot ~1,500 sequential queries | Batch eligibility sets + single `createMany` | `7e430cf` |
| F-10 | H | Scale | Email fan-out unbounded, non-resumable, double-send risk | Cursor batches + lease; cron resumes in-progress sends | `6bc63cd` |
| — | Ops | Tooling | `CREATE INDEX CONCURRENTLY` fails in SQL Editor transaction | Combined migration; plain `CREATE INDEX` | `ad989a0` |
