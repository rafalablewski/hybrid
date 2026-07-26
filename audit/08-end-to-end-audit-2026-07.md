# 08 — End-to-End Audit — July 2026

**Engagement:** Complete end-to-end audit of the HYBRID platform (monorepo @ `fb8eb00`, branch `claude/hybrid-audit-report-lfqr9z`).
**Date:** 2026-07-26.
**Auditor:** Claude Code (automated audit engagement, six parallel work-streams + first-hand build/test verification).

---

## 1. Executive Summary

HYBRID is a hybrid-athlete training platform: a shared TypeScript core (`packages/core`), a Next.js web app that also hosts the API for both clients (`apps/web`), an Expo mobile app (`apps/mobile`), and a Supabase Postgres database described by `prisma/schema.prisma`. The codebase is ~130k lines of application code: 167 API routes, 67 Prisma models, 97 core test files.

**Overall assessment: strong engineering fundamentals with a small number of launch-gating operational gaps.** This is the third audit engagement recorded against this codebase (see `audit/README.md`); the large majority of the previous engagements' fixes were re-verified in this audit and **held** — no security regressions were found.

**Verified strengths (first-hand this engagement):**

- **All checks green.** `@hybrid/core`: 1,122 tests across 97 files pass. Web: 48 tests pass, `tsc --noEmit` clean, full `next build` succeeds. Mobile: `tsc --noEmit` clean, iOS JS bundle exports successfully.
- **Sound security architecture.** Server-side Supabase token verification; role never seeded from client-controllable metadata; DB-role admin gating with a written **AdminAudit** trail; timing-safe, fail-closed secret checks on all four cron workers; Slack signature verification; parameterized raw SQL only; zero `dangerouslySetInnerHTML`; no hardcoded secrets (enforced by a static secret-scan test in CI); mobile tokens in SecureStore.
- **Unusually mature privacy plumbing.** A single shared account-wipe routine backs all three deletion paths (self-serve, admin, reset), deletes the Supabase auth user, and deliberately preserves the email-suppression list; a data-export (portability) endpoint exists on both clients.
- **Clean modularity.** `packages/core` has zero runtime dependencies, zero `process.env` reads, and zero imports from app code.

**Critical risks (launch-gating):**

1. **Database defense-in-depth is pending a manual step.** The RLS-enable + FK-cascade script (`reference/sql-all.sql`) has not been run in production, and Prisma connects via the direct Postgres URL (bypassing RLS regardless) — so API-layer authorization is currently the *only* enforcement layer.
2. **Known-vulnerable dependencies.** `next@16.2.7` carries 4 high-severity advisories (middleware/proxy bypass, SSRF in Server Actions) fixed in 16.2.11; 19 advisories total (12 high) across `next`, `sharp`, `postcss`, `js-yaml`, and others.
3. **Silent security-control failure modes.** `TOKEN_ENCRYPTION_KEY` (wearable OAuth token encryption) and the shared rate-limit store (`KV_REST_API_*`) both degrade silently when unset — and `TOKEN_ENCRYPTION_KEY` is absent from `.env.example`, so it plausibly was never set in Vercel.
4. **No client-version kill switch.** Mobile binaries live for months against an auto-deploying API with no versioning, no minimum-build check, and a hardcoded `hybrid-web-rosy.vercel.app` origin — unfixable retroactively once binaries are in the wild.
5. **One environment for everything.** No staging; preview deploys and tests hit production data; Vercel deploys are not gated on CI.

**Verdict (detail in §5): conditionally production-ready** — appropriate for the current TestFlight/beta stage; the five items above should land before public launch.

---

## 2. Scope & Methodology

### In scope

| Component | Contents |
|---|---|
| `packages/core` | Brand tokens, engines (fatigue/readiness/progression/periodization/prescription), plan library, sport engine, capabilities registry (~44k LoC) |
| `apps/web` | Next.js App Router app + the `/api/*` backend serving both clients (~50k LoC, 167 routes) |
| `apps/mobile` | Expo / React Native app (~36k LoC) |
| `prisma/schema.prisma` + `reference/sql-*.sql` | Data model (67 models) and the hand-run SQL companions |
| `.github/workflows/*`, `turbo.json`, `vercel.json` | CI/CD, TestFlight pipeline, cron |
| `audit/01–07` | Prior engagements — used as a regression baseline |

Out of scope: the live Supabase database and Vercel deployment themselves (this sandbox blocks the Supabase host — env-var *presence* in production could not be verified, only what code does when a var is unset), on-device testing, load testing, and pen-testing against the live deployment.

### Methods

1. **Code review** — six parallel audit streams (architecture/environment, code quality, data integrity, security, performance, compliance), each re-verifying the prior audits' claimed fixes against current code (regression check) before assessing new ground.
2. **Functional testing** — first-hand runs: `pnpm --filter @hybrid/core test` (1,122 pass), web `vitest` (48 pass), `tsc --noEmit` on web and mobile (clean), full `next build` (success), `expo export --platform ios` (success).
3. **Data validation** — engine boundary-condition review; plan-library rule conformance greps; Prisma-schema vs `reference/sql-*.sql` drift review; capabilities-registry accuracy spot-checks.
4. **Security assessment** — route-by-route auth coverage scan (167 routes), secrets grep, injection/XSS/SSRF surface review, `pnpm audit --prod` dependency scan, secret-handling and token-storage review.
5. **Performance profiling (static)** — unbounded-query scan, code-splitting verification, build-output review; plus verification of audit 07's performance remediations.
6. **Compliance check** — deletion/export/consent flows, Apple App Store rules, email compliance, audit-trail coverage; honest applicability analysis of the financial-services regimes named in the engagement brief (§3f).

Severity scale: **Critical** (launch-blocking / data corruption / account takeover) → **High** → **Medium** → **Low**.

---

## 3. Detailed Findings by Area

### 3a. Architecture & Environment

**Strengths (verified):**
- `packages/core` is genuinely clean: zero runtime dependencies (`packages/core/package.json`), zero `process.env` reads, zero imports from `apps/*`; strict apps→core dependency direction with tidy subpath exports.
- The TanStack Query data layer shipped on **both** clients (`apps/web/components/query-provider.tsx`, `apps/web/lib/use-*.tsx`; mobile `lib/query.tsx` + `lib/queries.ts` with `AppState`→`focusManager` wiring) — the prior audit's keystone fix is real and held.
- CI (`.github/workflows/ci.yml`) typechecks all three packages, runs core + web tests, generates the Prisma client before typecheck, and smoke-tests the actual iOS bundle via `expo export`. A parity test (`apps/web/__tests__/parity.test.ts`) enforces web↔mobile screen parity in CI.
- The TestFlight pipeline (`.github/workflows/mobile-release.yml`) is self-contained (no EAS service dependency), with a stateless monotonic build-number scheme.
- Env handling degrades gracefully by design; `/api/admin/system` surfaces per-var presence; no server secret is readable client-side.

**Findings:**

| ID | Sev | Finding |
|---|---|---|
| A-1 | **High** | **No API versioning or client-version kill switch.** 167 unversioned routes; `apps/mobile/lib/api.ts` sends no client-version header; no `minSupportedBuild` check anywhere. `main` auto-deploys the API while binaries live for months — an incompatible response-shape change breaks fielded binaries with no detect/warn/force-upgrade path. Must ship *before* public release; cannot be retrofitted onto already-shipped binaries. |
| A-2 | **High** | **Single environment; deploys not gated on CI.** One Supabase project + one Vercel deployment serves dev+prod (self-reported at `capabilities.ts` `staging-environment`); `apps/web/vercel.json` has no CI gating, so a commit that fails core tests in CI still auto-deploys; preview deploys of feature branches run against the production DB. |
| A-3 | Medium | **Hardcoded production hostnames baked into binaries.** `apps/mobile/lib/api.ts:9` falls back to `https://hybrid-web-rosy.vercel.app`; `lib/supabase.ts:8` falls back to the production Supabase URL; `email-cron.yml` defaults to the same host. Renaming the Vercel project bricks shipped binaries (compounds A-1); dev builds without `.env` silently talk to production Supabase. |
| A-4 | Medium | **`.env.example` gaps + one wrong value.** Read-by-code but undocumented: `TOKEN_ENCRYPTION_KEY` (see S-2), `SLACK_WEBHOOK_URL`, `SLACK_SIGNING_SECRET`, `AGENT_OPERATOR_EMAILS`, `WHOOP_/OURA_CLIENT_ID/SECRET` (built dynamically in `lib/connectors.ts` — ungreppable), `NEXT_PUBLIC_SITE_URL`. And `.env.example:44` documents `APPLE_IAP_BUNDLE_ID="com.hybrid.app"` while the real bundle id is `com.hybriddomain.xyz` (`app.json`) — copying the example breaks IAP receipt verification. |
| A-5 | Medium | **Web navigation is in-memory only.** `app-shell.tsx:169` — screen state is `useState`; no URL sync, so browser Back exits the app, refresh loses place, and nothing is deep-linkable (mobile, by contrast, has ~45 real expo-router routes). Untracked in the capabilities registry. |
| A-6 | Medium | **`mobile-release.yml` ships without running any tests** — a `mobile-v*` tag on a red commit goes straight to testers' phones. Add a typecheck+core-test step (or a `workflow_run` gate on CI). |
| A-7 | Low | **Per-client store forks** (`persona.ts`, `plan-maxes.ts`, `plan-overrides.ts` duplicated web/mobile with only the storage primitive differing) — hoist into core behind a `{get,set}` adapter, as `logger-prefs.ts` already demonstrates. |
| A-8 | Low | **`typecheck` script doesn't generate the Prisma client.** A fresh checkout fails `pnpm --filter @hybrid/web typecheck` with phantom `prisma.foodLog` errors until `prisma generate` runs (verified first-hand; CI and the Vercel build both generate first, so this is a local/agent footgun only). Add `db:generate` as a pre-step. |

### 3b. Code Quality & Maintainability

**Strengths (verified):** Exceptional type discipline for the size — exactly **2** `as any` and **1** `ts-ignore/ts-expect-error` across all non-test application source; only 4 TODO/FIXME markers. Comment quality is high (rationale-bearing, e.g. the race-handling notes in `server-auth.ts`). Project-rule conformance is clean: **zero rep-range violations** in `plan-programs.ts`, **zero** `"Kettlebell "` exercise-name violations, and no middot-as-separator violations (the `·` at `program-days.tsx:178` is an empty-cell placeholder glyph, which the rule allows; remaining hits are code comments and split-regexes).

**Findings:**

| ID | Sev | Finding |
|---|---|---|
| Q-1 | **High** | **No linting anywhere.** All three packages stub it: `"lint": "echo \"(web) no lint yet\" && exit 0"` (same for mobile and core). At ~130k LoC with multiple audit engagements layering fixes, there is no automated style/correctness net (unused vars, exhaustive-deps, floating promises). |
| Q-2 | **High** | **Test coverage is inverted relative to risk.** Core is superbly tested (1,122 tests) but: **mobile has 0 test files**, web has 4 (motion tokens, parity, crypto, security greps), and the 167 API routes — where authz, billing, and entitlement logic live — have **no route-level tests** (auth helpers are only exercised indirectly). The highest-consequence code has the least coverage. |
| Q-3 | Medium | **God files.** `apps/mobile/app/workout.tsx` (2,309 lines), `apps/web/components/aurora/nutrition.tsx` (2,150) and its mobile twin (2,044 — largely parallel logic), `apps/mobile/lib/api.ts` (1,815). The two nutrition screens are the clearest case where shared logic should move to core. |
| Q-4 | Medium | **Dual UI surface persists.** ~30 "classic" components at `apps/web/components/` root remain routed alongside 64 `aurora/` components (e.g. `app-shell.tsx:83,927` still mounts `statistics.tsx`). Code-split so not a bundle problem, but every change potentially pays twice (prior-audit finding A5, still open). |
| Q-5 | Medium | **203 raw `fetch("/api/…")` calls remain in web components** (nutrition 20, coach 15, admin agents 24, org 8…) with zero `useQuery` inside `components/` — the query cache is consumed only via the 7 `lib/use-*` hooks, so the stale-after-mutation class the migration killed for sessions/signals still exists for nutrition, coach console, org, profile, and admin screens. |

### 3c. Data Integrity & Functional Accuracy

**Strengths (verified):**
- Prior engine fixes held: the defensive newest-first sort is present with rationale comments in `engines/progression.ts:16-20` and `prescription.ts:147` (the "trend never inverts on unsorted input" fix).
- Day/date math is deliberately timezone-free via local day keys (`packages/core/src/day-key.ts` + `addLocalDays`) — the classic "workout logged at 11 pm lands on tomorrow" bug class is designed out.
- Raw SQL is used sparingly and **always** through Prisma's tagged templates (parameterized): `plan-maxes`, `admin/stats`, `coach/roster`, `coach/groups` — no string interpolation into SQL found.
- Plan-library rules hold (§3b): single-number reps everywhere, KB naming consistent.
- Deletion integrity is centralized: `lib/account-wipe.ts` is the single wipe implementation for all three deletion paths, ordered child-before-parent, best-effort per table with skips recorded.

**Findings:**

| ID | Sev | Finding |
|---|---|---|
| D-1 | **High** | **Schema drift is real and the reconciliation is pending.** The Prisma schema and production disagree until `reference/sql-all.sql` (cascades + RLS + indexes) is run and the migration baseline in `prisma/MIGRATIONS.md` is reconciled (tracked honestly as `schema-migrations-reproducible`, blocked on live-DB access this sandbox lacks). Until then, `onDelete` behavior in production is whatever the hand-run SQL happened to create — the account-wipe routine compensates in app code, but FK-level integrity is unverified. |
| D-2 | Medium | **The capabilities registry — the mandated single source of truth — is stale on its own keystone entry.** `capabilities.ts` still lists `web-data-layer` as `planned` ("the web app has no shared cache…") while the TanStack Query layer is shipped on both clients. This is a direct violation of the project's own always-rule, and the stale prose actively misdescribes the codebase to future operators/agents. Other spot-checked entries (`account-settings-pro`, `mobile-fetch-error-states`, staging/migrations entries) were accurate. |
| D-3 | Low | **Unbounded `findMany` on a dozen admin routes** (`admin/exercises`, `admin/agents`, `admin/translations`, `admin/media`, …) plus `plan-days` and `social/connections`. Bounded in practice by table size today; add `take` before tables grow. (`social/feed` was checked and *is* bounded — `limit: 50`.) |

### 3d. Security Assessment

**Strengths (verified first-hand — including regression checks on every prior claimed fix that was examined):**
- **Authentication:** `lib/server-auth.ts` verifies tokens server-side via `supabase.auth.getUser(token)` (both cookie and Bearer paths); new users are always created `CLIENT` — role is never seeded from client-controllable `user_metadata` (the prior privesc fix, held); the first-login `P2002` race is handled.
- **Authorization coverage:** 166 of 167 routes reference an auth/guard helper; the single exception (`slack/interactivity`) correctly authenticates via Slack request-signature verification instead.
- **Admin:** `requireAdmin` checks the DB role, and privileged mutations write to an **AdminAudit** table ("admins never get silent access" — reads of other users' records are audited too).
- **Cron/secret endpoints:** all four cron workers use `verifyBearerSecret` (constant-time, fail-closed when unset); the email-unsubscribe HMAC fails closed (`lib/email.ts:45-46`).
- **Injection/XSS:** zero `dangerouslySetInnerHTML`; all raw SQL parameterized.
- **Secrets:** no hardcoded credentials found; `apps/web/__tests__/security.test.ts` runs static secret-pattern scans in CI; service-role key confined to `lib/supabase/admin.ts`; mobile session storage migrated to SecureStore (`apps/mobile/lib/supabase.ts:25-27`).
- **Rate limiting:** 52 route files apply guards; the limiter is designed for a shared store (Upstash/Vercel KV) with an explicit production-log alarm when unconfigured.
- **Apple IAP / Stripe:** replay and idempotency hardening from the prior engagement remains in place (`lib/apple-iap.ts`, billing webhook).

**Findings:**

| ID | Sev | Finding |
|---|---|---|
| S-1 | **High** | **Dependency vulnerabilities: 19 advisories (12 high, 7 moderate)** via `pnpm audit --prod`. Headline: `next@16.2.7` → four high (middleware/proxy authorization bypass GHSA-class, SSRF in Server Actions ×2, DoS) fixed in **16.2.11** — a minor, low-risk bump. Also `sharp` (libvips CVEs), `postcss` (path traversal / arbitrary file read), `js-yaml`, `shell-quote`, `brace-expansion`, `uuid`. The middleware-bypass class is directly relevant since the app runs Next middleware. |
| S-2 | **High** | **`TOKEN_ENCRYPTION_KEY` is a silently-off security control.** `lib/crypto.ts:30`: when unset, wearable OAuth tokens are stored **unencrypted** — and the var is missing from `.env.example`, so it very plausibly was never set in Vercel. Fail-open crypto + undocumented var = dormant control. Make it fail-closed (refuse to store tokens) or at minimum document + alert. |
| S-3 | **High** | **RLS is still not enabled in production** (`sql-all.sql` unrun — tracked as blocked), and Prisma's direct Postgres connection bypasses RLS anyway. Consequence: the API layer is the *sole* authorization boundary; any single missed ownership check becomes a data leak with no second net. The API layer audited well, but defense-in-depth for a health-data app warrants running the script (it also matters for the `anon`/PostgREST surface of the Supabase project). |
| S-4 | Medium | **Fleet-wide rate limiting depends on an env var whose presence can't be confirmed.** Without `KV_REST_API_*`/`UPSTASH_*`, serverless instances each keep their own counter — effectively unlimited under real traffic (the code logs an alarm, but only after the first limited request). Confirm the store is configured in Vercel; consider failing the build/boot in production without it. |
| S-5 | Low | **Anonymous-session endpoints** (`/api/anon-sessions`) are rate-limited but remain an unauthenticated write surface; keep entries size-capped and expiring (spot-check suggested caps exist — verify TTL cleanup job). |

### 3e. Performance & Reliability

**Strengths (verified):** The prior engagement's keystone perf work is in place and held — query cache on both clients (30 s staleTime, focus-driven refetch), **48 `dynamic()` imports** code-splitting the web app-shell (recharts out of the entry bundle), coach-roster N+1 fixed via a single raw query (`coach/roster/route.ts:28`), resumable email fan-out, and a full production build compiles all 167 routes without warnings. `social/feed` is windowed and bounded. Error boundaries exist (`app/error.tsx`, `global-error.tsx`).

**Findings:**

| ID | Sev | Finding |
|---|---|---|
| P-1 | **High** | **No crash reporting or error monitoring on any surface** (tracked as `crash-reporting: planned`). Today a production exception on mobile is invisible unless a tester reports it; on web it's a Vercel function log line at best. For a TestFlight program this is the single biggest reliability blind spot — Sentry (or equivalent) on both clients + the API should precede wider beta distribution. |
| P-2 | Medium | **Observability is `console.*` only** — no structured logs, no request IDs, no timing. Incident reconstruction relies on Vercel's raw function logs (compounds P-1; the AdminAudit table covers admin actions well, but nothing covers request-level tracing). |
| P-3 | Medium | **Mobile long lists are not virtualized** (`mobile-list-virtualization: planned`) — history/feed screens render full arrays in `ScrollView.map()`; memory/scroll cost grows linearly with a user's training history. |
| P-4 | Medium | **The stale-fetch pattern outside the query layer** (Q-5) is also a performance issue: those 40+ web component screens refetch everything on every visit due to the `key={screen}` remount, with no cache to serve synchronously. |
| P-5 | Low | **Unbounded admin queries** (D-3) will slow the admin console as tables grow; add pagination. |
| P-6 | Low | **Offline story on mobile is partial** — a workout in progress survives via the local draft store (`workout-draft.ts`), but there is no queued-mutation replay for failed writes; a save on a dead connection surfaces as an error the user must retry manually. Acceptable for beta; worth a queued outbox before gym-basement usage scales. |

### 3f. Compliance & Audit Trails

**Applicability, stated honestly:** HYBRID is a consumer fitness/health app, not a financial product. **ASIC (Australian financial-services regulation), KYC/AML, and financial-audit-trail regimes do not apply** — the app does not hold client money, provide financial advice, or operate a designated service under AML/CTF. The only future touchpoint is marketplace payouts to coaches (`social-paid-coaching`, blocked): if built on Stripe Connect as planned, **Stripe carries the KYC/AML obligations** as the regulated entity; HYBRID's obligation reduces to accurate merchant-of-record configuration and (in AU) ordinary consumer law. What **does** apply: GDPR/UK GDPR, the Australian Privacy Act (APPs — with health data treated as *sensitive information* under APP 3), CCPA/CPRA, Apple App Store Review Guidelines, subscription/consumer law (auto-renewal disclosure), and CAN-SPAM/GDPR ePrivacy for email.

**Strengths (verified):**
- **Deletion:** in-app self-serve account deletion exists on both clients (Apple Guideline 5.1.1(v) satisfied), deletes the Supabase **auth** user (`account/route.ts:50`), and wipes all app data via the single shared routine — with the email-suppression list deliberately retained (correct under CAN-SPAM/GDPR: an opt-out must survive deletion).
- **Portability:** `GET /api/account/export` gathers every user-owned table to JSON, on web and mobile (share-sheet on mobile) — GDPR Art. 20 satisfied in substance.
- **Consent surfaces:** notification + privacy preference toggles (incl. analytics opt-out, coach-sharing granularity) persisted in auth metadata; `/privacy` and `/terms` pages exist and are routed.
- **Payments:** iOS uses Apple IAP when available and only falls back to hosted Stripe Checkout on web/Android (`aurora/upgrade.tsx:69-86`) — compliant with Apple's anti-steering baseline; Stripe webhook idempotency/ordering hardening is in place from the prior engagement.
- **Admin audit trail:** the AdminAudit table records who did what to whom, including admin *reads* of user records — genuinely above-par for this stage.

**Findings:**

| ID | Sev | Finding |
|---|---|---|
| C-1 | Medium | **The privacy policy does not disclose the AI-coach data flow.** `/api/ai-coach` sends user training/health context to Anthropic's API, but `app/privacy/page.tsx` contains no mention of an AI processor/sub-processor. GDPR Art. 13 (recipients of data) and APP 6/8 (use/disclosure, cross-border) require disclosing that health-adjacent data reaches a third-party AI provider, the purpose, and the jurisdiction. A one-paragraph amendment closes this. |
| C-2 | Medium | **FK-cascade defense-in-depth unrun in production** (D-1/S-3): the app-layer wipe is thorough, but until `sql-all.sql` runs, a future code path that deletes a `User` row directly could orphan personal data — the GDPR safety net exists only as an unexecuted script. |
| C-3 | Low | **Coach-access provenance:** coach↔athlete access is gated on `CoachLink.status = ACTIVE` at query time (correct — access ends with the link), but there is no *athlete-visible* log of when a coach viewed their data. Not legally required; worth noting for a health product's trust posture. |
| C-4 | Low | **Retention policy is implicit.** No documented retention schedule for logs/backups (Supabase defaults apply). Fine at this stage; write it down before scale. |

---

## 4. Recommendations & Remediation Plan

Priority key: **P0** = before public launch (High), **P1** = next 1–2 sprints (Medium), **P2** = steady-state debt (Low).

| # | Pri | Area | Action | Refs |
|---|---|---|---|---|
| 1 | **P0** | Security | Upgrade `next` to ≥16.2.11 (4 high CVEs, incl. middleware bypass + SSRF); bump `sharp`, `postcss`, `js-yaml`, `uuid` per `pnpm audit`. Low-risk minor bumps; run the full check suite after. | S-1 |
| 2 | **P0** | Security/Data | Run `reference/sql-all.sql` in the Supabase SQL Editor (RLS enable + FK cascades + indexes), then reconcile migrations per `prisma/MIGRATIONS.md`. This closes three findings at once. | S-3, D-1, C-2 |
| 3 | **P0** | Security | Set `TOKEN_ENCRYPTION_KEY` in Vercel; add it (plus Slack/WHOOP/OURA/`NEXT_PUBLIC_SITE_URL`/`AGENT_OPERATOR_EMAILS`) to `.env.example`; fix the wrong `APPLE_IAP_BUNDLE_ID` example; change `lib/crypto.ts` to fail closed when the key is absent in production. | S-2, A-4 |
| 4 | **P0** | Security | Confirm the shared rate-limit store (`KV_REST_API_*`) is configured in production; consider refusing production boot without it. | S-4 |
| 5 | **P0** | Architecture | Client-version kill switch: mobile sends `X-Client-Build`; `/api/me` returns `minSupportedBuild`; blocking upgrade screen below it. Ship before the App Store release — not retrofittable. | A-1 |
| 6 | **P0** | Architecture | Put binaries on a domain you own (custom domain now; keep the vercel.app alias alive forever); make workflow `APP_URL`s required, not defaulted. | A-3 |
| 7 | **P0** | Reliability | Add crash reporting (Sentry) to web, mobile, and the API before widening the beta. | P-1 |
| 8 | **P1** | Architecture | Stand up staging (second Supabase project + Vercel env); gate Vercel production deploys on CI checks; scope preview envs to non-prod DB. | A-2 |
| 9 | **P1** | Quality | Adopt ESLint (typescript-eslint + react-hooks + expo config) repo-wide; wire into CI. Expect a large-but-mechanical first pass. | Q-1 |
| 10 | **P1** | Quality | Route-level API tests for the highest-consequence handlers first: billing webhook, IAP verify, entitlement mirror, admin role grants, account deletion. Then a mobile test harness (jest-expo) for `lib/`. | Q-2 |
| 11 | **P1** | Compliance | Amend the privacy policy: AI-coach processing (Anthropic as processor, purpose, region), plus a written retention schedule. | C-1, C-4 |
| 12 | **P1** | Data | Correct the `web-data-layer` capabilities entry to `shipped` with an honest residual note (Q-5); registry accuracy is a standing project rule. | D-2 |
| 13 | **P1** | Perf/Quality | Migrate the heaviest raw-fetch screens (nutrition, coach console) onto the query layer; they're the ones mutations elsewhere most plausibly stale. | Q-5, P-4 |
| 14 | **P1** | CI | Add a test gate to `mobile-release.yml`. | A-6 |
| 15 | **P2** | Architecture | URL-sync web navigation (`?s=` + popstate) so Back/refresh/deep-links work; or record it as a `planned` capability. | A-5 |
| 16 | **P2** | Perf | Virtualize long mobile lists (FlashList); add `take` to unbounded admin queries. | P-3, D-3/P-5 |
| 17 | **P2** | Quality | Decompose the god files (`workout.tsx`, the two `nutrition.tsx`), hoisting shared nutrition logic into core; retire remaining classic-UI screens per the design-unification sweep; unify the persona/plan-maxes/plan-overrides store forks behind a core storage adapter. | Q-3, Q-4, A-7 |
| 18 | **P2** | Reliability | Queued-mutation outbox for offline mobile writes; structured logging with request IDs on the API. | P-6, P-2 |
| 19 | **P2** | DX | Make `typecheck` scripts run `prisma generate` first. | A-8 |

---

## 5. Conclusion

**Production-readiness verdict: conditionally ready.** For its current stage — internal TestFlight distribution and a small beta — HYBRID is in genuinely good shape: every build/test/typecheck gate passes first-hand, the security architecture is coherent and held up under regression-checking of two prior audit engagements, privacy plumbing (deletion, export, suppression, IAP separation) is ahead of most products at this maturity, and the shared-core monorepo discipline is real, enforced by CI parity tests rather than convention alone.

What separates it from *public* production-readiness is not code quality but **operational hardening**, concentrated in seven P0 items: the Next.js upgrade, the unrun RLS/cascade script, two silently-degrading security controls (`TOKEN_ENCRYPTION_KEY`, the shared rate-limit store), the client-version kill switch, an owned domain, and crash reporting. All are small relative to the work already done; the kill switch and domain are the two that become permanently harder the moment binaries ship publicly.

Two cultural observations worth keeping: first, the capabilities registry is a strong idea that this audit caught drifting on exactly the entry that mattered most (`web-data-layer`) — its value depends entirely on the always-rule being honored in the same change as the code. Second, the test pyramid is inverted (superb core coverage, empty at the API/mobile layers where the money and authz live); recommendation #10 is the highest-leverage quality investment available.

The financial-regulatory frames in the engagement brief (ASIC, KYC/AML) do not apply to this product today and would only enter via coach payouts on Stripe Connect, where Stripe is the regulated party. The regimes that do apply — GDPR/APPs/Apple — are substantially satisfied, with the AI-processor disclosure (C-1) the one concrete gap.

---

*Methods, scope limits, and per-finding evidence paths are recorded above; prior-engagement context in `audit/README.md` and reports 01–07.*
