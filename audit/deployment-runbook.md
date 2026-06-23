# HYBRID Audit — Deployment Runbook

Operational checklist to ship the remediation branch `claude/enterprise-due-diligence-audit-00gidh`.

---

## 0. Pre-flight

```bash
git checkout claude/enterprise-due-diligence-audit-00gidh
pnpm install
pnpm --filter @hybrid/core test        # expect 560 passing
pnpm --filter @hybrid/web typecheck    # expect clean
pnpm --filter @hybrid/mobile typecheck # expect clean
```

---

## 1. Database migrations (Supabase SQL Editor)

The build sandbox cannot reach Supabase, so migrations are applied by hand. Run the **combined, idempotent** script once:

```
reference/sql-audit-migrations.sql
```

It applies, in one transaction:

1. **Performance indexes** — Session (×3), Biometric, Checkin, AgentRun, User.
2. **Stripe webhook** — `ProcessedWebhookEvent` table + `User.subscriptionStatusAt`.
3. **Apple IAP** — `User.appleOriginalTransactionId` + unique index.
4. **Email** — `EmailCampaign.sendCursor` + `lockedUntil`.

> ✅ **Status: applied** (operator-confirmed).

**If you see `25001: CREATE INDEX CONCURRENTLY cannot run inside a transaction block`:** you are running an older copy that still used `CONCURRENTLY`. Use `reference/sql-audit-migrations.sql` (plain `CREATE INDEX`), which is transaction-safe.

**Optional — trigram user search (run separately, NOT in a transaction):** the bottom of the combined file contains commented `pg_trgm` indexes using `CONCURRENTLY`; run each on its own only if admin user-search latency becomes a concern.

---

## 2. Environment variables

### Required for full effect

| Variable(s) | Purpose | Behavior if unset |
|-------------|---------|-------------------|
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` **or** `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | Shared, fleet-wide rate limiting (F-05) | Falls back to per-instance in-memory limiting (ineffective across multiple lambdas, but safe) |

Both pairs expose the same Redis REST API; set **one** pair. See `.env.example`.

### Already required by existing features (unchanged)

Stripe (`STRIPE_*`), Apple IAP (`APPLE_IAP_*`), Resend + `EMAIL_FROM`, `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` — these gate the billing/email subsystems the audit hardened but did not introduce. Each path soft-degrades to a "not configured" response until set.

---

## 3. Deploy

`main` auto-deploys `apps/web` to Vercel. To ship:

1. Open a PR from `claude/enterprise-due-diligence-audit-00gidh` (or fast-forward `main` per the project's workflow).
2. Confirm the migrations (Section 1) are applied **before** traffic hits the new code. The code soft-degrades if not, but the protections (idempotency ledger, IAP binding, resumable sends, indexes) are only fully active post-migration.
3. Set the rate-limit store env (Section 2) in the Vercel project.

Mobile ships via EAS Build → TestFlight (requires the Apple Developer account + Expo token — not part of this change).

---

## 4. Post-deploy verification

| Area | Check |
|------|-------|
| Entitlement (F-01) | A non-paying account cannot reach Full features by editing client state; entitlement reflects the `User.entitlement` column. |
| Stripe (F-08) | Re-deliver a test webhook event from the Stripe dashboard → second delivery is a no-op (`duplicate: true`); no second "upgraded" email. |
| Apple IAP (F-04) | Replaying a transaction id to a second account is rejected. |
| Rate limit (F-05) | With the store configured, a burst beyond the limit returns `429` consistently across instances. |
| Roster / stats (F-15/F-17) | Coach roster and admin stats load within budget for a large dataset; DB query counts are bounded. |
| Wearables (F-23) | A sync with an expired access token transparently refreshes and succeeds rather than returning "reconnect". |
| Email (F-10) | A large campaign progresses in batches across cron ticks; `sentCount` advances; no recipient is double-sent. |
| Logout (F-09/F-22) | After logout, `localStorage`/AsyncStorage retain only `hybrid.lang` / `hybrid.tourSeen` / `hybrid.announce.dismissed`; persona resets. |

---

## 5. Rollback

Every fix is an isolated commit (see the ledger in `remediation-report.md` §7), so an individual change can be reverted with `git revert <hash>` without disturbing the others.

The schema additions are **additive and nullable** (new columns/tables/indexes); leaving them in place after a code rollback is harmless. Do not drop `User.appleOriginalTransactionId`, `ProcessedWebhookEvent`, or the `EmailCampaign` columns while any version of the new code is live.
