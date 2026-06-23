# HYBRID — Enterprise Due-Diligence Audit

This directory documents the security, data-integrity, concurrency, and
scalability remediation performed on the HYBRID platform.

**Branch:** `claude/enterprise-due-diligence-audit-00gidh`
**Result:** 25 findings remediated across 25 commits · core tests 560/560 · web + mobile typecheck clean · 4 DB migrations applied.

## Contents

| Document | What it covers |
|----------|----------------|
| [`remediation-report.md`](./remediation-report.md) | The full report — executive summary, methodology, every finding with severity / root cause / fix / commit, migrations, outstanding items, and the commit ledger. |
| [`deployment-runbook.md`](./deployment-runbook.md) | Operator checklist — migrations, environment variables, deploy, post-deploy verification, and rollback. |
| [`findings.md`](./findings.md) | Condensed one-line-per-finding index for quick scanning. |

## At a glance

- **Critical:** paywall bypass via client-writable metadata; agent-approval double-spend; cron double-run/double-send.
- **High:** Apple IAP replay; Stripe webhook idempotency/ordering; org DIRECTOR→OWNER escalation; per-instance rate limiter; auth write-per-request + first-login race; coach-group lost update; logout state leak; wearable token refresh; missing indexes; coach-roster N+1; email fan-out durability.
- **Medium:** coach-link race; suppression fail-open; OAuth refresh-token nulling; check-in reply clobber; assignment session validation; program-assign idempotency; agent cost accounting; admin-stats & datanet aggregation; global-config caching.
- **Debt:** shared auth-normalization lifted into `@hybrid/core`.

## Conventions honored

- Shared logic added to `packages/core`; web↔mobile parity maintained in the same change.
- Schema changes are idempotent SQL applied via the Supabase SQL Editor; code soft-degrades until applied.
- One reviewable, individually-revertible commit per finding.

## Source artifacts (outside this directory)

- `prisma/schema.prisma` — schema changes.
- `reference/sql-audit-migrations.sql` — combined migration (recommended).
- `reference/sql-performance-indexes.sql`, `sql-webhook-idempotency.sql`, `sql-apple-iap-binding.sql`, `sql-email-resumable-send.sql` — individual migrations.
- `.env.example` — rate-limit store variables.
