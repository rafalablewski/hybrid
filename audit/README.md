# HYBRID — Audit Dossier

This directory holds the records of **two complementary audit engagements** run against the HYBRID platform. They covered different (mostly non-overlapping) ground and were merged together; where they touched the same code, the stronger fix was kept (see "Reconciliation" below).

---

## Engagement A — Enterprise Due-Diligence Audit
*Security · data integrity · concurrency · scalability* — merged via **PR #86** (`claude/enterprise-due-diligence-audit-00gidh`).

| Document | Covers |
|----------|--------|
| [`remediation-report.md`](./remediation-report.md) | Full report: 25 findings with severity / root cause / fix / commit, migrations, outstanding items, commit ledger. |
| [`deployment-runbook.md`](./deployment-runbook.md) | Operator checklist — migrations, env vars, deploy, post-deploy verification, rollback. |
| [`findings.md`](./findings.md) | One-line-per-finding index. |

**Headline fixes:** paywall bypass via client-writable metadata (F-01), agent-approval & cron double-spend (F-02/F-03), Apple IAP replay (F-04), Stripe webhook idempotency/ordering (F-08), org DIRECTOR→OWNER escalation (F-07, `canAssignRole`), fleet-wide rate limiting (F-05), coach-roster N+1 (F-17), resumable email fan-out (F-10).

## Engagement B — Production-Readiness Audit
*Architecture · stale-data · performance · mobile · DB hardening* — this branch (`claude/production-readiness-audit-cshqbi`).

| Document | Covers |
|----------|--------|
| [`01-audit-findings.md`](./01-audit-findings.md) | Every finding by domain, severity, root cause, impact, fix. |
| [`02-remediation-log.md`](./02-remediation-log.md) | All 41 commits grouped + mapped to hashes. |
| [`03-architecture-data-layer.md`](./03-architecture-data-layer.md) | The keystone: TanStack Query cache, mutation invalidation, code-splitting, web↔mobile parity. |
| [`04-database-hardening.md`](./04-database-hardening.md) | Indexes, deletion cascades, and the inert-RLS discovery + the SQL. |
| [`05-scorecard-and-roadmap.md`](./05-scorecard-and-roadmap.md) | Before/after scores, gate verdicts, the path to >90. |

**Headline work:** the web client had **no data layer** (one 939-line component remounting every screen) → introduced a shared query cache on both clients; **code-split** the 80-screen monolith (recharts out of the entry bundle); discovered the **RLS policies were never enabled** (inert) with ~10 sensitive tables uncovered → completed + enabled RLS; **GDPR deletion cascades**; four **engine correctness bugs** (incl. the flagship "peak on event day" mis-dating).

---

## Reconciliation (where the two engagements overlapped)

Both audits independently found and fixed several of the same issues. On merge, the stronger/already-reviewed version was kept and the additive work combined:

| Area | Resolution |
|------|------------|
| Org DIRECTOR→OWNER escalation | Kept Engagement A's `canAssignRole` (core helper + unit test). |
| First-login user resolution | Kept A's read-first pattern **and** applied B's anti-escalation (new rows are always `CLIENT`, never seeded from `user_metadata.role`). |
| Session-resolution race | Combined — B's monotonic sequence guard **and** A's `clearClientState()` on sign-out. |
| Assignment `sessionId` IDOR | Equivalent fixes; kept A's. |
| Composite indexes (Session/Checkin) | Union of both index sets (the live DB has both). |
| `coach.tsx` | Combined — A's atomic group-membership deltas **and** B's `useQuery` migration. |

---

## Database scripts

Two combined, idempotent migration scripts were produced and **applied** in the Supabase SQL Editor:
- `reference/sql-audit-migrations.sql` (Engagement A) — webhook idempotency, IAP binding, resumable send, A's indexes.
- `reference/sql-all.sql` (Engagement B) — B's indexes, deletion-cascade FKs, and **RLS enable + completion**.

Both are safe to re-run.

---

## Net result

Overall production-readiness moved from **C+ (≈58/100)** to **B / B+ (≈80–82/100)** with the DB scripts applied. Remaining path to >90 is the operational-maturity layer (CI gates, observability/Sentry, load-test evidence) — detailed in [`05-scorecard-and-roadmap.md`](./05-scorecard-and-roadmap.md) §2.
