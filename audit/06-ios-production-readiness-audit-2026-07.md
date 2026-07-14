# HYBRID — iOS Production-Readiness Audit (July 2026)

**Auditor stance:** Principal-staff review calibrated to an Apple App Review /
Stripe / Supabase / OWASP / SOC 2 / GDPR bar. Assume nothing is correct without
evidence. Every finding below is anchored to a file, line, policy, or migration,
and the highest-severity claims were re-verified by hand against source.

**Method:** Full-repo sweep — shared `packages/core`, the Next.js web app +
backend (155 API routes), the Expo/React Native iOS client (170 files), the
Prisma schema (63 models), the ~50 hand-run `reference/*.sql` scripts, CI, and
App Store config. Parallel domain deep-dives (mobile ×2, backend API ×2, DB/RLS
×2, auth/secrets, privacy-legal-infra) with load-bearing findings re-verified
directly.

> **Framing correction.** The brief assumes a **SwiftUI** client. The shipping
> iOS app is **Expo / React Native** (expo-router). Native SwiftUI exists only
> as a `blocked` capability (`swiftui-kit`) that cannot be built or verified
> here. This audit covers the app that actually ships.

> **Sandbox limit.** The Supabase host and Postgres ports are blocked, so the
> *live* database state (is RLS enabled? which scripts ran? are cascades
> applied?) **cannot be observed** — only the SQL as authored. Every finding
> that turns on live state is flagged, with the exact verification query given.

---

## Executive summary

Judged on **application-code craftsmanship**, this is a strong, unusually
security-conscious codebase: JWT is server-verified, authorization is
DB-authoritative (roles/entitlement never trusted from client metadata **in the
API**), there are **no committed secrets** (git history included), payment and
webhook paths verify signatures with idempotency and replay-binding, SQL is
fully parameterized, IDOR is consistently defended at the API layer, and CI runs
typecheck + security tests + dependency audit + an iOS bundle export.

But the app is **not ready for release**, and the reasons are concrete:

1. **The database's own security layer contains privilege-escalation bugs.** The
   authored RLS policies — the *only* barrier between the publicly-shipped anon
   key and the data — let a signed-in user rewrite their own `User.role` to
   `ADMIN` and let anyone forge an ACTIVE coach link to read another user's
   training data. These are exploitable **in the intended, RLS-enabled
   configuration**; "run the SQL" does not fix them. **Verified.**
2. **It cannot pass App Review.** At least five independent hard blockers: no
   in-app account deletion, no `PrivacyInfo.xcprivacy`, no privacy policy, no IAP
   "Restore Purchases", and a paywall missing Terms/Privacy links + a hardcoded
   non-StoreKit price.
3. **Erasure is broken.** The self-serve "reset" leaves the private journal, body
   metrics, and social graph behind; admin deletion will throw an FK violation
   for any socially-active user, leaving a zombie account.
4. **The database is not reproducible.** 7 of 63 tables live in migration
   history; 56 are manual SQL with proven drift (ghost tables, divergent
   duplicate policies, RESTRICT-vs-Cascade FK mismatch). No clean rebuild, no
   rollback, no DR.
5. **Production is unobservable and data-loss-prone on-device.** No crash
   reporter, no health check, no staging/prod split; and the mobile client
   silently swallows every fetch error into an empty state, can route an
   onboarded user back through onboarding offline (plan clobber), and can lose
   banked sets to a load-effect race.

The core is good. The path to shippable is a **well-defined checklist**, but it
is long, and two items (the RLS escalations, the erasure defect) are genuine
security/compliance defects, not polish.

### Overall Production-Readiness Score: **60 / 100**

| Dimension | Score | Justification |
|---|---:|---|
| App-layer security (API) | 84 | DB-authoritative authz, no secrets, signed webhooks, parameterized SQL, encryption helper, strong CSRF+CSP. Docked for coach consent-bypass, XFF-spoofable limiter, open-redirect. |
| **DB / RLS isolation** | **38** | RLS **contains admin-escalation + link-forgery policy bugs**, is unverified in prod, and is the sole barrier on the public anon key. Migration drift compounds it. |
| App Store compliance | 25 | ≥5 hard blockers. IAP payment *routing* and ATT are correct. |
| Privacy / legal (GDPR) | 40 | Export exists; erasure broken/incomplete; no policy/ToS; no self-serve deletion. |
| Reliability (mobile) | 52 | Great offline durability, undone by silent-failure data layer, onboarding clobber, workout race, no timeouts/boundary. |
| Observability / infra | 35 | No crash reporting, no health check, no env split, no release gate. |
| Backend API correctness | 80 | Auth/idempotency/IDOR solid; consent-bypass + client-trusted ownerId + missing write caps + unbounded coach queries. |
| Code quality / CI | 78 | Strong CI + tests; drift, one false-assurance test, no mobile tests/lint, registry staleness. |

Weighted toward the release-gating dimensions (DB isolation + App Store), the app
lands at **60 — "strong core, multiple hard blockers, one real DB-security
defect."**

### Production Readiness Verdict

> ## ❌ NOT READY FOR RELEASE
>
> The database's own authorization layer contains a **verified privilege-
> escalation-to-ADMIN** path and a cross-tenant data-read path exploitable via
> the public anon key; the app **cannot pass App Review** (≥5 hard blockers); and
> **account erasure is broken**. None require re-architecting and the engineering
> base is strong — but these must be fixed and RLS verified on the live DB before
> any release, limited beta included.

---

## Critical Blockers

### C-1 — RLS policy `user_self_update` allows self-escalation to ADMIN via the anon key
**Severity: Critical** — **verified against source**

**Issue.** The `User` UPDATE policy scopes the *row* to the caller but places **no
restriction on which columns** may be written, and no `REVOKE`/column-`GRANT`
narrows it (grep-confirmed: no privilege revoke exists in any script):
```sql
-- reference/rls-policies.sql:33-34
create policy user_self_update on "User" for update
  using ("authId" = auth.uid()::text);
```
PostgREST enforces column privileges, not policy *intent*; Supabase's default
grants give `authenticated` UPDATE on every column. So any signed-in user, using
the **public anon key** shipped in the app, can:
```
PATCH /rest/v1/User?authId=eq.<my-uid>
{ "role": "ADMIN", "entitlement": "paid", "coachVerified": true }
```
The app's own `requireAdmin` reads `User.role` from this very row
(`apps/web/lib/admin.ts:24`), so this is a **full application admin takeover**,
plus a free paywall bypass — not merely a PostgREST curiosity.

**Why "just run the RLS SQL" does not fix it.** This bug lives in the *policy
logic*. It is live precisely in the **intended, RLS-enabled** configuration
(`0_init` enables RLS on `User`; `rls-policies.sql` creates this policy). The
remediation for C-6 (running `sql-all.sql`) *activates* this policy; it does not
correct it.

**Risk.** Any registered user becomes an admin (and a paid user) at will →
complete confidentiality/integrity loss across all tenants.

**Evidence.** `reference/rls-policies.sql:33-34`; no `revoke update`/column
`grant` on `"User"` anywhere (verified); `apps/web/lib/admin.ts:24`.

**Recommendation.** Fix the policy *and* the grants:
```sql
revoke update on "User" from anon, authenticated;
grant update ("name","language") on "User" to authenticated;  -- only editable fields
-- or drop user_self_update entirely; profile edits already go through the API.
```

### C-2 — RLS policy `link_insert` lets anyone forge an ACTIVE CoachLink and read a victim's training data
**Severity: Critical** — **verified against source**

**Issue.** The `CoachLink` INSERT policy constrains only `coachId`; `clientId`
and `status` are unconstrained:
```sql
-- reference/rls-policies.sql:62-63
create policy link_insert on "CoachLink" for insert
  with check ("coachId" = public.app_user_id());
```
Any account inserts `{coachId: me, clientId: <victim>, status: 'ACTIVE'}` via the
anon key. `is_active_coach()` (`rls-policies.sql:18-26`) then grants that
"coach" SELECT on the victim's `Session`, `Signal`, `RtpProtocol`, and shared
`Checkin` rows. The mutual-consent model documented at `schema.prisma:135-136`
exists only in the API — **not** in the DB. Classic "policy keyed on a
user-controlled column" bypass; the `@@unique([coachId, clientId])` doesn't help.

**Risk.** Any user reads any other user's workouts, biometrics (HRV/sleep),
injury/return-to-play data, and shared check-ins — cross-tenant health-data
breach via forged consent.

**Evidence.** `reference/rls-policies.sql:62-63,18-26`; `schema.prisma:135-136`.

**Recommendation.** Force new links to PENDING and only let the *client* activate:
`with check ("coachId" = app_user_id() and status = 'PENDING')`; scope
`link_update` so PENDING→ACTIVE requires `clientId = app_user_id()`.

### C-3 — Database is not reproducible from migrations (7 of 63 tables); RLS/cascade state unverified
**Severity: Critical** (recoverability + the C-1/C-2 uncertainty)

**Issue.** `prisma/migrations/` has one migration (`0_init`) creating **7 tables**
(User, CoachLink, CoachNote, Session, Macrocycle, Biometric, Plan). `schema.prisma`
declares **63 models**; the other **56** exist only as `create table if not
exists` across ~50 hand-run `reference/*.sql` files with cross-dependencies and
**proven drift**: ghost policies for `FeatureGrant`/`AccessRequest` (models that
don't exist — `sql-rls-extend.sql:116-125`), and the same table defined with
divergent policies in two files (OnboardingState, Event, VideoAnalysis,
CoachApplication) so the final state is **run-order-dependent**.

**Risk.** `prisma migrate deploy` on a fresh env yields a broken 7-table DB; no
`migrate reset`, no preview branches, no DR rebuild, no rollback, no
deployed-vs-declared diff. Crucially, this is *why* C-1/C-2 and RLS status can't
be trusted — nobody can diff what's actually live. `capabilities.ts:309-310`
marks `schema-tenant-isolation-rls` and `schema-deletion-cascade` as **blocked
(not run)** while `audit/05-scorecard-and-roadmap.md` claims RLS "has been"
enabled — the two sources of truth disagree on whether the DB is protected.

**Evidence.** `prisma/migrations/0_init/migration.sql` (7 `CREATE TABLE`);
`schema.prisma` (63 `model`); `sql-rls-extend.sql:116-125`; `capabilities.ts:309`.

**Recommendation.** Baseline the live DB with `prisma migrate diff`, `migrate
resolve --applied`, retire the manual-script model, and gate CI on `prisma
migrate status` clean. **Before launch**, run and attach to the release ticket:
```sql
select relname, relrowsecurity from pg_class
 where relnamespace='public'::regnamespace and relkind='r' order by 1;  -- all true
select tablename, count(*) from pg_policies where schemaname='public' group by 1;
```
Then blast-radius-revoke (the app never uses PostgREST for these tables):
```sql
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
```

### C-4 — No in-app self-service account deletion (App Store 5.1.1(v) + GDPR Art. 17)
**Severity: Critical** (guaranteed App Store rejection)

**Issue.** Neither client can delete a user's own account. The only danger-zone
action is **Reset**, which *explicitly keeps the login*
(`apps/web/app/api/account/reset/route.ts:6-8`; mobile
`apps/mobile/components/aurora/settings.tsx:89-94`). Deletion exists only in the
admin panel against *other* users (`apps/web/app/api/admin/users/[id]/route.ts:106`).

**Risk.** Apple has required in-app account deletion for account-creating apps
since 30 June 2022 → automatic rejection. Also a GDPR right-to-erasure gap.

**Recommendation.** Add `DELETE /api/account` (auth-scoped; hard-deletes the
user's rows **and** the Supabase auth user) + a typed-confirm control on **both**
clients. Must be *complete* (see H-1).

### C-5 — Missing Apple Privacy Manifest (`PrivacyInfo.xcprivacy`)
**Severity: Critical** (submission/upload blocker)

**Issue.** No privacy manifest anywhere; no `ios.privacyManifests` in `app.json`.
The app bundles `@react-native-async-storage/async-storage`, which uses
`NSUserDefaults` — a **required-reason API** (CA92.1) — so a manifest is mandatory.

**Risk.** Required since spring 2024; absence triggers ITMS-91053 and, increasingly,
upload rejection at TestFlight/submission.

**Evidence.** `find apps/mobile -name "*.xcprivacy"` → none; `app.json:37-64` has
no manifest config; AsyncStorage at `apps/mobile/lib/supabase.ts:2`.

**Recommendation.** Add `PrivacyInfo.xcprivacy` via an Expo config plugin
declaring no tracking, the collected data types (health/fitness, identifiers,
user content), and required-reason CA92.1 (UserDefaults) plus any file-timestamp
reasons from transitive deps.

### C-6 — No Privacy Policy and no Terms of Service
**Severity: Critical** (App Store Connect metadata blocker; GDPR Art. 13/14)

**Issue.** No `/privacy`, `/terms`, or `/legal` page in the web app; nothing linked
in either client. The in-app "Privacy" settings tab is preference toggles, not a
policy. **Verified:** grep for "Privacy Policy"/"Terms of Service" across
`apps/**` → none.

**Recommendation.** Publish `/privacy` and `/terms`, link them on both clients
(login + settings + paywall), set the privacy-policy URL in App Store Connect.

### C-7 — IAP: no "Restore Purchases", no launch-time transaction listener, paywall missing Terms/Privacy + hardcoded non-StoreKit price
**Severity: Critical** (auto-renewable-subscription rejection cluster)

**Issue.** `react-native-iap` is used only inside `purchaseFull()`
(`apps/mobile/lib/iap.ts:33-96`); `endConnection()` is called immediately after,
so there is **no launch-time `purchaseUpdatedListener`** and **no restore path**
anywhere (grep for `restore|getAvailablePurchases|getPurchaseHistory` → none).
The paywall shows a **hardcoded `$9.99`** (`upgrade.tsx:127`) — never fetched from
StoreKit, so wrong in every non-US storefront — and has **no Terms of Use or
Privacy Policy links**. "Manage subscription" routes back to the paywall, not
Apple's management UI (`settings.tsx:251`, `goUpgrade → /upgrade`).

**Risk.** Apple requires a restore mechanism and Terms/Privacy links + accurate
localized pricing for auto-renewables (Guidelines 3.1.1 / 3.1.2) — a standard
rejection. Interrupted/Ask-to-Buy/renewal transactions that complete after the app
is killed are never consumed or verified → guaranteed paid-but-not-granted states.

**Evidence.** `apps/mobile/lib/iap.ts:33-96` (all listeners scoped to one
purchase); `upgrade.tsx:124-129`; `settings.tsx:251`. **All verified.**

**Recommendation.** Register `purchaseUpdatedListener` once at startup (verify +
`finishTransaction` any replay); add a "Restore purchases" button calling
`getAvailablePurchases()` → server verify; fetch `product.localizedPrice` from
StoreKit; add Terms + Privacy links; point "Manage subscription" at
`showManageSubscriptions()` / `apps.apple.com/account/subscriptions`.

---

## High-Priority Issues

### H-1 — Account deletion is incomplete and throws an FK violation for real users
**Severity: High** (broken erasure + GDPR)

- **Reset leaves sensitive data behind.** `account/reset/route.ts` wipes 16 tables
  but **omits** `BodyMetric`, `JournalEntry` (private free-text journal),
  `HiddenHighlight`, `HighlightOrder`, `PlanDayOverride`, and all social rows
  (SocialProfile, Post, Kudos, Comment, Follow, Block, CoachProfile,
  ProgramEnrollment, CoachReview). **Verified** against the route's `wipe(...)`
  calls. "Erase everything" keeps the journal, body-composition history, posts,
  and follow graph.
- **Admin delete will throw.** `admin/users/[id]/route.ts:56-106` also misses the
  private-tab tables, whose FKs were created **without a cascade**
  (`sql-private-tab.sql:27,57,81,106` — `references "User"("id")`, default NO
  ACTION). With live FKs at RESTRICT (cascade blocked), the final
  `prisma.user.delete()` **raises an FK violation** for any user who has a
  journal/body/social row → 500 with a misleading message, leaving a half-deleted
  zombie account.

**Recommendation.** Drive both routes off a single table list (so it can't drift
from the schema), delete storage objects in the admin path too, wrap in one
`$transaction`, and apply the cascade migration so a `User` delete cascades atomically.

### H-2 — RLS: `member_self_insert` self-joins any org as OWNER; CoachInvite is anon-readable and blindly updatable
**Severity: High** — **verified**

- **Org escalation.** `sql-org-graph.sql:66-67`: `member_self_insert` checks only
  `userId = app_user_id()`; org/role unconstrained → insert `{orgId:<any club>,
  userId:me, role:'OWNER'}` → `is_org_member()` passes → read the whole club's
  roster/teams. `org_insert with check(true)` and member-writable `team_write`
  compound it. **Verified.**
- **Invite PII leak.** `sql-coach-invites.sql:38-42`: SELECT `using(status='PENDING')`
  with no `to authenticated`, UPDATE `using(status='PENDING') with check(true)` →
  **anon** can enumerate every pending invite's email/phone (PII,
  `schema.prisma:373-374`) and flip invites to any state.

**Recommendation.** Gate org membership inserts behind an existing OWNER/DIRECTOR
via a `security definer` helper (never a client-supplied `role`); add `to
authenticated` + token match to invite reads; do the claim server-side.

### H-3 — `ProcessedWebhookEvent` has no RLS at all → Stripe idempotency ledger is anon-tamperable
**Severity: High** — **verified**

**Issue.** It is the one table with **no `enable row level security`** in any
script (`sql-webhook-idempotency.sql`). With default grants, anon can INSERT
arbitrary `evt_*` ids to **pre-seed the ledger so a real Stripe event is skipped
as "already processed"** (defeating entitlement provisioning), or DELETE rows to
force double-processing.

**Recommendation.** `alter table "ProcessedWebhookEvent" enable row level
security;` (no policy → server-only). Add a CI check that every `create table` in
`reference/` is followed by an enable.

### H-4 — Wearable OAuth tokens stored plaintext; entitlement mirrored into user-writable metadata
**Severity: High**

- **Plaintext tokens.** `schema.prisma:816-819` stores `accessToken`/`refreshToken`
  as plaintext (comment at `:809` admits "should be encrypted at rest in
  production"). The app-layer `encryptSecret` is **opt-in** — with
  `TOKEN_ENCRYPTION_KEY` unset it returns the value unchanged
  (`apps/web/lib/crypto.ts:46-48`). Combined with C-1/C-2/C-3 (anon read of an
  RLS-off `Connection`), this is a live provider-credential exfiltration path.
- **Entitlement mirror.** `apps/web/lib/billing.ts:67` mirrors `entitlement` into
  Supabase **`user_metadata`**, which is *user-writable* via
  `supabase.auth.updateUser()`. The server correctly reads the DB column, so
  it's a latent trap rather than a live break — but the mirror belongs in
  server-only `app_metadata`.

**Recommendation.** Require `TOKEN_ENCRYPTION_KEY` in prod (or use pgcrypto/vault);
never expose token columns to any client policy; move the entitlement mirror to
`app_metadata`.

### H-5 — Mobile: every fetch silently swallows failures into empty states
**Severity: High** (reliability / data-loss illusion)

**Issue.** All ~70–85 fetchers in `apps/mobile/lib/api.ts` return `[]`/`{}`/`null`/
`false` on *any* failure (network, 500, 401); `social-api.ts:31-42` ignores
`res.ok` entirely so even mutations (follow/post/comment/block/enroll) fail
undetectably. The TanStack Query hooks wrap these directly, so `queryFn` never
throws → `isError`/`retry` are dead code. **The team knows** —
`mobile-fetch-error-states` is a `planned` capability.

**Risk.** Offline or during an outage, the app confidently shows "No workouts
yet", empty feeds, zeroed dashboards — indistinguishable from real empty data;
invites duplicate logging; reads as data loss.

**Recommendation.** Make fetchers throw typed errors; branch screens on
`q.isError` for a distinct "Couldn't load — retry" state; keep soft-degrade only
for genuinely optional reads (flags/translations).

### H-6 — Mobile: offline cold-start routes an onboarded user into onboarding → plan clobber
**Severity: High** (data loss)

**Issue.** `fetchOnboardedAt()` returns `null` on **both** "not onboarded" and any
network failure (`apps/mobile/lib/api.ts:457-466` — **verified**); `index.tsx`
routes `null` → `/onboarding`; the local `hybrid.onboarded` fallback exists only
if onboarding happened *on this device* and isn't in `KEEP_ON_LOGOUT`. A signed-in
user opening the app offline on a new device (or after a logout wipe) is forced
through the questionnaire, and `submitOnboarding` re-enrolls a plan → clobbers
their existing plan.

**Recommendation.** Distinguish network failure from "not onboarded" (throw vs
null); default to `/(tabs)` on failure.

### H-7 — Mobile: workout load-effect race loses banked sets
**Severity: High** (data loss)

**Issue.** The workout prefill effect depends on `guest = !session`
(`app/workout.tsx:209,384-473`) but never waits for `ready` from `useSession()`.
On a cold start into the logger (draft resume / deep link), the effect first runs
with `guest=true`, then re-runs when the session lands — re-applying `loadDraft()`
/ re-seeding exercises and resetting `startedAt`/`title`/`exercises`, clobbering
sets ticked in the interim.

**Recommendation.** Gate the effect on `ready` and run it once per mount (ref
guard) rather than on `guest` changes.

### H-8 — No crash reporting, no health check, no environment separation
**Severity: High**

**Issue.** No Sentry/Bugsnag/Crashlytics in either client (`track()` is a no-op
stub); no `GET /api/health`; no uptime/alerting; **one hardcoded Supabase project
for web+mobile, dev+prod** ("same users, same data",
`apps/mobile/lib/supabase.ts:5-8`), so test writes hit production and there is no
safe place to rehearse a migration.

**Recommendation.** Add Sentry (Expo + Next.js) behind the flag kill-switch; add
`GET /api/health` + external uptime monitor; stand up a staging Supabase project;
drive URL/keys from env per environment.

### H-9 — Mobile: no request timeouts, no error boundary, no global 401 handling, no password reset
**Severity: High**

- **No timeouts / cancellation** on any `fetch` → hung requests on captive-portal
  networks never resolve (RN `fetch` has no default timeout).
- **No `ErrorBoundary`** anywhere → one uncaught render throw white-screens the app.
- **No global 401 handling** — a revoked session renders empty data forever
  instead of prompting re-auth (only `askAiCoach` distinguishes 401).
- **"Forgot password" is a dead `<Text>`** with no `onPress` (`login.tsx:152-156`,
  **verified**) and `resetPasswordForEmail` is called nowhere → users are locked
  out on mobile.

**Recommendation.** Shared `fetchWithTimeout` (`AbortSignal.timeout`) wired to
React Query cancellation; a root + per-tab `ErrorBoundary`; a fetch wrapper that
routes true-401s to login; wire `resetPasswordForEmail` (or remove the label).

### H-10 — Mobile: no list virtualization; O(n²) PR scan; per-second full-tree re-render
**Severity: High** (perf at real data volumes)

**Issue.** No `FlatList`/`FlashList` anywhere — 452 `.map()` sites render inside
plain `ScrollView`s. History mounts every session with full block breakdown and
recomputes `prsForSession(sessions, s.id)` **per card** = O(n²)
(`history.tsx:68-105`). The workout logger (`app/workout.tsx`, ~1,900 lines) re-
renders the whole tree **every second** from the elapsed-timer interval
(`:286-299`), re-rendering every `TextInput` during a live workout; no rows are
memoized. Backlog `mobile-list-virtualization` acknowledges the virtualization gap.

**Recommendation.** FlatList/FlashList for History/Feed/Leaderboard/picker;
memoize `prsForSession` via a single-pass map; isolate the clock into a leaf
`<Timer/>` and `React.memo` the exercise rows.

### H-11 — Backend: coach reads a non-consented user's data via an auto-created PENDING link
**Severity: High** (API-layer consent bypass — distinct from C-2)

**Issue.** `POST /api/coach/invite` auto-creates a PENDING `CoachLink` on inviting
an existing user's email (`route.ts:86`); three GET handlers authorize on link
*membership only*, not `status === "ACTIVE"`:
`coach/links/[id]/assignments/route.ts:14`, `.../checkins/route.ts:15`,
`.../notes/route.ts:17`. The inviting coach reads the target's assignments and
shared check-ins before acceptance.

**Recommendation.** Add `&& link.status === "ACTIVE"` to the coach branch of all
three GETs; keep the `clientId === me.id` branch status-agnostic.

### H-12 — Backend: unbounded coach/analytics queries OOM at scale; datanet silently caps at 500 users
**Severity: High** (scalability / correctness)

**Issue.** `coach/squad/route.ts:33-34` does `session.findMany({where:{userId:{in:
clientIds}}})` and the same for `Signal` (the highest-cardinality table) with **no
`take` and no time window** → pulls every session and signal for the whole roster
into memory. `datanet/snapshot/route.ts:19` processes `user.findMany({take:500})`
→ at 10M users the data-network job covers 0.005% of them (silent correctness
bug). `cron/email` uses `NOT IN (large list)` + a correlated `none` subquery
(planner worst-case).

**Recommendation.** Add time-windowed `take` + keyset pagination to the coach/squad
and datanet paths; rewrite the dormant-user scan as an anti-join; wrap RLS helper
calls as `(select public.app_user_id())` so they run once per query, not per row.

---

## Medium-Priority Issues

| ID | Issue | Evidence | Fix |
|---|---|---|---|
| M-1 | Public `using(true)` SELECT policies without `to authenticated` on `SocialProfile`/`CoachProfile`/`CoachReview`/`CoachProgram`/`TalentProfile` → the **anon** role scrapes the whole creator directory (handles, bios, avatars, reviews); TalentProfile also omits the `moderationStatus='approved'` filter → pre-moderation minor data leaks. | `reference/sql-social.sql:38,175,236,188`; `sql-talent-profile.sql:29` | Add `to authenticated`; add the approved-moderation filter. |
| M-2 | `/api/account/export` dumps full `Connection` rows including OAuth tokens (plaintext when key unset); contradicts the `data-token-redaction` control. | `apps/web/app/api/account/export/route.ts:40` | Explicit `select` omitting tokens. |
| M-3 | The CI redaction test only flags `accessToken: true` in a `select`; a `findMany` with **no** select (M-2) evades it → CI green despite the leak (false assurance). **Verified.** | `apps/web/__tests__/security.test.ts:81` | Also fail on token-bearing models queried without an explicit select. |
| M-4 | `social/comments` & `social/kudos` trust a client-supplied `ownerId` → notification spoofing; `comments` GET has no subject-visibility gate. | `social/comments/route.ts:54,60`; `kudos/route.ts:22,33` | Derive `ownerId` server-side; apply the feed visibility gate on GET. |
| M-5 | 33 write routes read `request.json()` with no `readJsonLimited` cap and persist the raw blob unvalidated; core writers + public `anon-sessions` have **no** rate limit. | `apps/web/app/api/sessions/route.ts:34,58` | `readJsonLimited` + shape/length validation + `rateLimit`. |
| M-6 | Rate-limit + audit IP taken from the **leftmost** `X-Forwarded-For` (client-controllable) → spoof a fresh bucket per request; poisons the audit `ip`. | `apps/web/lib/admin.ts:53-58`; `guard.ts:80` | Use the rightmost trusted hop / `x-real-ip` on Vercel. |
| M-7 | Open redirect on the OAuth callback: `next` concatenated as `${origin}${next}` unvalidated → `next=@evil.com` yields `https://app.hybrid.app@evil.com` → host `evil.com`. **Verified.** | `apps/web/app/auth/callback/route.ts:9,14` | Reject `next` unless `^/(?!/)`. |
| M-8 | Rate limiter fails **open** to a per-instance Map on any KV error and when no shared store is configured. | `apps/web/lib/guard.ts:88-95` | Require `KV_REST_API_*`/`UPSTASH_*` in prod (fail closed/alarm). |
| M-9 | Coach invite emails arbitrary addresses with no per-actor rate limit (only a 150 pending cap) → email-bombing. | `apps/web/app/api/coach/invite/route.ts:108-115` | Per-coach `rateLimit` + daily cap. |
| M-10 | Mobile: signed-in offline save always mirrors to the unauthenticated `/api/anon-sessions` endpoint, and `flushGuestSessions` re-posts with no idempotency key → private data lands in the anon dataset + duplicate sessions corrupt PR/volume history. | `apps/mobile/lib/guest.ts:41-50,84-97`; `workout.tsx:787-793` | Mirror to anon only when actually a guest; client-generated idempotency id honored server-side. |
| M-11 | Mobile: one-shot `flags`/`persona`/`plan-maxes` stores fetched **before** login and never reset on auth change → per-user gating never loads for the session that signs in, and user A's flags persist for user B on a shared device. | `apps/mobile/lib/flags.ts:12-22`; `persona.ts:49-62` | Re-run on `onAuthStateChange`; add `resetFlags()` to `clearClientState()`. |
| M-12 | Mobile release ships to TestFlight with **no** typecheck/test gate; CI runs only on PR/push to `main`. | `.github/workflows/mobile-release.yml`; `ci.yml` | Gate the release job on green CI. |
| M-13 | Mobile: interval timer counts `setInterval` ticks, not wall-clock → silently pauses when backgrounded; no NetInfo/`onlineManager` wiring anywhere (no offline banner, no reconnect refetch). | `apps/mobile/app/interval-timer.tsx:46-60`; grep NetInfo → none | Derive elapsed from `Date.now()-startedAt`; wire NetInfo → `onlineManager`. |
| M-14 | Mobile: provider OAuth "Connect" opens `${API_BASE}/api/connect/{provider}` in Safari with **no credential** (Bearer lives only in app fetches) and no return deep link (no associated domains) → linking 401s / strands the user; invite links (web URLs) also open Safari, never the in-app claim screen. | `apps/mobile/components/aurora/connections.tsx:73`; `app.json:19-26` | Signed short-lived connect URL via `openAuthSessionAsync`; add associated domains + AASA. |
| M-15 | `Checkin` coach UPDATE policy rewrites the whole row (no column scoping) → a coach can overwrite the athlete's energy/sleep/soreness. `SocialProfile.avatarUrl` is an arbitrary client string (no `avatars` bucket) → stored-URL/SSRF/tracking-pixel vector. | `sql-history-checkin-anon.sql:107-110`; `schema.prisma:208` | Column-grant `coachReply`/`repliedAt` only; add an owner-scoped avatars bucket + URL validation. |

---

## Low-Priority Improvements

- **Missing indexes:** `EmailMessage.campaignId` (FK, no index), `CoachReview.authorId`
  (only in a composite), polymorphic `Kudos/Comment (subjectType,subjectId)`
  reverse lookup, admin `email/name ILIKE '%q%'` (no `pg_trgm` — commented out).
- **No CHECK constraints** for `CoachReview.rating` (1–5),
  `Checkin.energy/sleep/soreness/mood` (1–5), `adherencePct` (0–100), and dozens of
  free-text `status`/`visibility` columns (allowed values only in comments).
- **JSON-as-relational:** `Session/Assignment/CoachProgram/Macrocycle.blocks`,
  `RtpProtocol.audit` (a compliance log as an unqueryable array), `User.planMaxes`
  — fine as a snapshot log, a liability for the analytics the memos promise.
- **`@updatedAt` won't fire** for the many hand-run raw-SQL writes (no
  `moddatetime` trigger) → stale `updatedAt`.
- **`.env.example` discloses the real project ref/region** (`postgres.hgufkvwccodogieqygyy@aws-0-eu-west-1…`).
- **`is_admin()` lacks `set search_path`** (`sql-media-library.sql:140-146`) —
  inconsistent with the other definer helpers.
- **Index-based React keys** in reorderable lists (31 `key={i}`).
- **a11y:** core set-logging controls are unlabeled → the primary flow isn't
  VoiceOver-completable; Dynamic Type strategy defined but applied in only 4 places.
- **Mobile has no lint and no tests** (`package.json` `"test": "echo …no tests"`).
- **i18n gaps:** History hardcodes `en-US`; the invite screen and interval timer are
  English-only despite en/pl/de.
- **Slack agent approvals** decide with `enforceTwoPerson:false` and no Slack→operator
  mapping → self-approval of expensive runs.
- **Managed-agent** allow-lists `web_fetch`/`code_execution`/`filesystem` on free-text
  tasks (behind operator + budget + approval).
- **Per-request `supabase.auth.getUser()`** couples every API call to Supabase Auth.
- **`readJsonLimited` doesn't strip `__proto__`/`constructor`** (no live sink today).
- **`sql-all.sql` cascade section** does unguarded `DROP/ADD CONSTRAINT` in one
  txn → `ACCESS EXCLUSIVE` full-scan lock at scale; use `NOT VALID` + later `VALIDATE`.
- **Notification permission** prompted cold on first workout mount (depresses opt-in).
- **Capabilities registry is stale vs. its own rule** — no entries for
  account-self-delete, crash reporting, privacy manifest, legal pages, IAP restore.

---

## What is genuinely solid (verified, not assumed)

Credibility requires naming the strengths — they are real:

- **No committed secrets, anywhere** (git history scanned); `.env*`/`*.p8`/`*.p12`
  gitignored; `.env.example` is placeholders. `SUPABASE_SERVICE_ROLE_KEY` is
  server-only, never `NEXT_PUBLIC`/`EXPO_PUBLIC`, never in a client bundle.
- **JWT is verified, not decoded** — `supabase.auth.getUser(token)` for cookie + Bearer.
- **API authorization is DB-authoritative** — new users hardcoded `role: CLIENT`;
  `user_metadata` never trusted for authz *in the API*; entitlement read from the
  DB column. (The RLS layer is where the escalations live — C-1/C-2.)
- **All 51 `admin/*` routes gate on `requireAdmin`; all 4 crons use constant-time
  fail-closed `verifyBearerSecret`.**
- **Payments well-built** — Stripe webhook signature + idempotency + out-of-order
  guard; Apple IAP full JWS x5c chain verification + `originalTransactionId`
  replay-binding; Slack HMAC + 5-min window. **IAP payment *routing* is correct**
  (native IAP on iOS, Stripe only web/Android — no 3.1.1 external-payment issue).
- **IDOR consistently defended at the API layer**; **no SQL injection** (tagged
  templates only); **no SSRF** (hardcoded provider allowlist); **no mass assignment**.
- **Strong web edge middleware** — same-origin CSRF on cookie mutations + strict
  nonce CSP with `strict-dynamic`.
- **RLS *enable-coverage* is broad** (63/64 tables in the scripts) and the definer
  helpers pin `search_path` — the gaps are the specific policy-logic bugs above,
  not blanket absence.
- **Mobile offline durability is genuinely good** — guest-queue-and-sync, draft
  persistence, double-post guard, disciplined timer/subscription cleanup,
  reduced-motion support, lazy IAP import, memoized engine math.
- **No PII in analytics** (`track()` is a no-op stub, no third-party SDK) → **no ATT
  prompt needed**; iOS login is email-only so Guideline 4.8 doesn't trigger;
  **GDPR data export exists**; `usesNonExemptEncryption:false` is accurate.
- **CI is mature** — typecheck (all packages) + unit/security tests +
  `pnpm audit --prod` + Dependabot + iOS bundle export.

---

## Risk Matrix (Probability × Impact)

| | **Impact: Medium** | **Impact: High** | **Impact: Critical** |
|---|---|---|---|
| **Prob: High** | H-5 silent-failure UI; H-8 no observability; H-10 perf; M-11 stale gating | C-4/C-5/C-6/C-7 App Review rejection (**certain**); H-1 broken erasure; H-9 lockout/white-screen | **C-1 admin-escalation via anon key**; **C-2 cross-tenant read** (live if RLS applied as authored) |
| **Prob: Med** | M-2/M-4/M-6/M-7/M-9/M-10/M-13 | H-2 org/invite RLS; H-3 webhook ledger; H-4 token leak; H-6 onboarding clobber; H-7 workout race; H-11 coach bypass; H-12 OOM | **C-3 unreproducible DB / unverified RLS** |
| **Prob: Low** | M-1/M-3/M-5/M-8/M-14/M-15 | Slack self-approval; datanet 500-cap | — |

---

## Remediation sequence

**Gate 0 — security/compliance, cannot ship without (days):**
1. Fix the RLS policy bugs **in the policy logic + grants** — `user_self_update`
   (C-1), `link_insert` (C-2), `member_self_insert`/CoachInvite (H-2), enable RLS
   on `ProcessedWebhookEvent` (H-3). Then run `sql-all.sql`, run the
   `pg_class`/`pg_policies` verification, and `revoke all … from anon`.
2. In-app account deletion, complete + cascading + transactional (C-4, H-1).
3. Privacy manifest (C-5), privacy policy + ToS (C-6), IAP restore + StoreKit
   price + Terms/Privacy links (C-7).
4. Redact tokens from export + fix the test blind spot (M-2, M-3); require
   `TOKEN_ENCRYPTION_KEY` (H-4); fix the coach PENDING-link reads (H-11).

**Gate 1 — before any beta (1–2 weeks):**
5. Reproducible migrations / retire manual SQL (C-3); staging env (H-8).
6. Mobile: unmask fetch errors (H-5), fix onboarding clobber (H-6) + workout race
   (H-7), timeouts + error boundary + 401 handling + password reset (H-9),
   SecureStore tokens, reset one-shot stores on auth change (M-11).
7. Crash reporting + health check + release gate (H-8, M-12); bound coach/datanet
   queries (H-12).

**Gate 2 — fast follow:** virtualization (H-10), rate-limit hardening
(M-6/M-8/M-9), open-redirect (M-7), write caps (M-5), `to authenticated` on public
reads (M-1), indexes/CHECK constraints, a11y, mobile tests/lint, registry hygiene.

---

*Prepared July 2026. Scope reflects the branch at audit time. The single most
important pre-release action is to run the `pg_class`/`pg_policies` verification
against the live database and to correct the RLS policy logic in C-1/C-2 —
enabling RLS alone activates, not fixes, those escalation paths.*
