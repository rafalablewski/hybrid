# 01 — Audit Findings

The original production-readiness audit. Findings are grouped by domain; each carries a severity, the responsible location, the root cause, the user-visible impact, and the fix. Items marked ✅ were remediated in this engagement (see [`02-remediation-log.md`](./02-remediation-log.md) for commit mapping); items marked ⏳ are tracked in `packages/core/src/capabilities.ts`.

Severity scale: **Critical** (blocks launch / data-corruption / account-takeover) → **High** → **Medium** → **Low**.

---

## A. Architecture & state management

### A1 — No client data layer; the whole app is one remounting mega-component ✅ *(keystone)*
- **Severity:** Critical
- **Location:** `apps/web/components/app-shell.tsx` (939 lines), esp. the `<div key={screen}>` wrapper and the `screen === id && <Screen/>` switch; all `apps/web/lib/use-*.tsx` hooks.
- **Root cause:** Navigation was `useState("today")`. Screens were gated inside a `key={screen}` wrapper, so changing tab **unmounted the old screen and mounted the new one fresh**. Each screen owned its own `fetch`+`useState`+mount-`useEffect` with no shared cache. No React Query / SWR / Zustand existed.
- **Impact:** Every symptom in the brief descended from here — tab-switch blank/empty flash, refetch-on-every-visit (waterfalls + duplicate requests), and mutations on one screen not invalidating another's copy (the "refresh fixes it" class).
- **Fix:** Introduced TanStack Query on both clients; mutations invalidate by key; removed the remount pattern's harm by serving cached data synchronously on navigation. See [`03-architecture-data-layer.md`](./03-architecture-data-layer.md).

### A2 — Side-effecting GET on `/api/me`
- **Severity:** High
- **Location:** `apps/web/app/api/me/route.ts` → `claimPendingInvites` / `claimPendingCoachInvites`.
- **Root cause:** A `GET` performs writes (invite-claim transactions) on **every** call, and it's invoked from two places in `session.tsx` with no ordering guard.
- **Impact:** Duplicate concurrent invite-claim transactions on every load and token refresh. (Idempotent, so not corrupting, but architecturally a safety/idempotency smell.)
- **Status:** Documented; the session-race half (below) was fixed. Moving claims to an explicit login POST remains tracked.

### A3 — Session-resolution race (stale role/entitlement) ✅
- **Severity:** High
- **Location:** `apps/web/lib/session.tsx:107–114`.
- **Root cause:** The initial `getUser()` resolve and every `onAuthStateChange` both started an async `resolveSession()` → `/api/me` with no ordering; a slower earlier call could resolve **after** a newer one and overwrite the session.
- **Impact:** Stale role/entitlement after a token refresh — a paid/admin user could momentarily read as free/client.
- **Fix:** Monotonic sequence guard + unmount cancellation; only the most recently-started resolve writes state.

### A4 — Engine ordering contract was implicit ✅
- **Severity:** High
- **Location:** `packages/core/src/engines/progression.ts:22`, `prescription.ts:135`.
- **Root cause:** The engines assumed `hits[0]` / `loggedE1rm[0]` was the newest entry, with **no sort** — it worked only because the live API happened to return `startedAt desc`.
- **Impact:** Any unsorted/oldest-first caller silently **inverted the e1RM trend** → wrong progress/deload decision.
- **Fix:** Sort by `daysAgo` defensively inside the engines.

### A5 — Two parallel UIs (classic + aurora) double the surface
- **Severity:** High (maintainability)
- **Root cause:** Nearly every screen is implemented twice (`if (template === "aurora") return <AuroraX/>; return <X/>`).
- **Impact:** Every feature must be built twice per client; confirmed behavioural drift (e.g. Aurora Home omitted coach-invite fetch). Doubles the bundle.
- **Status:** Documented; the data-layer migration consolidated the **data** path across both, reducing (not eliminating) the divergence.

---

## B. Security

| # | Sev | Finding | Location | Status |
|---|-----|---------|----------|--------|
| B1 | **High** | Org `DIRECTOR` could self-promote to `OWNER` — `b.role` validated only against `ORG_ROLES` (which includes `OWNER`), no grant restriction. Tenant takeover. | `org/[id]/members/[mid]/route.ts` | ✅ Fixed |
| B2 | **Medium** | `assignments/[id]` PATCH wrote an arbitrary caller-supplied `sessionId` with no ownership check (cross-object reference). | `assignments/[id]/route.ts` | ✅ Fixed |
| B3 | **Medium** | Cron secret compared with plain `!==` (timing side-channel) **and** a literal `"Bearer undefined"` authenticated when the secret was unset. | `cron/*/route.ts` | ✅ Fixed |
| B4 | **Medium** | One-click email-unsubscribe HMAC fell back to a hardcoded constant (`"hybrid-email-unsub"`) → any user's unsubscribe link forgeable. | `lib/email.ts` | ✅ Fixed |
| B5 | **Low→High** | New users seeded their role from client-controllable `user_metadata.role` — a crafted signup could self-escalate to admin/coach. | `lib/server-auth.ts` | ✅ Fixed |
| B6 | **High** | **RLS policies existed but were never `ENABLE`d** (inert), and ~10 sensitive tables (incl. `Connection` OAuth tokens) had **no policy at all**. | `reference/rls-policies.sql` + schema | ✅ Fixed (SQL applied) |
| B7 | **Medium** | OAuth tokens stored as plaintext at the column level. | `Connection.access/refreshToken` | Partly mitigated — `protectToken` (AES-GCM) encrypts when `TOKEN_ENCRYPTION_KEY` is set; RLS now denies direct anon access. |
| B8 | **Low** | Rate limiting is an in-process `Map` (per serverless instance) → effective limit = limit × instances; AI endpoints cost-abuseable at scale. | `lib/guard.ts` | ⏳ Tracked (needs Redis/Upstash) |

**Verified clean during the audit:** all 51 `/admin/*` routes are gated; IDOR ownership checks present on sessions/coach-links/org; service-role key server-only; Stripe & Slack webhooks correctly verified (Slack with ±300s replay protection); no `$queryRawUnsafe`; no leaked secrets; `account/export` & `account/reset` strictly self-scoped.

---

## C. Functional correctness — engines (`packages/core`)

### C1 — Peaking macrocycle mis-dated the athlete's event ✅ *(flagship-feature bug)*
- **Severity:** Critical
- **Location:** `engines/periodization.ts` `buildMacrocycle`.
- **Root cause:** Each phase was scaled and **rounded independently** (`Math.max(1, Math.round(p.weeks*scale))`). Verified numerically: an event 2 weeks out produced a **4-week** plan (taper/peak landing *after* the event); 20 weeks out produced **19**.
- **Impact:** The flagship "peak on your event day" promise was wrong for any horizon that isn't a tidy multiple of the phase sum.
- **Fix:** Largest-remainder (Hamilton) distribution that sums to **exactly** `eventInWeeks`; drops early base phases when the horizon is shorter than the phase count. New invariant test across horizons 1…52.

### C2 — Other engine bugs ✅
- **`readiness.ts`** — empty muscle set produced `NaN` that survived `round/min/max` and poisoned the score. Guarded like `computeHpi`.
- **`accountability.ts`** — a recently-active but high-risk athlete (`risk ≥ 80`, trained ≤14 days ago) was mis-banded `"dormant"`, firing the "it's been a while" win-back at someone still showing up. Reserved `dormant` for genuine >14-day absence. *(Regression test added.)*
- **`forceplate.ts`** — a "Weight (N)" / "System Weight" force column (Newtons, ~700 for a 70 kg athlete) was ingested as kg `bodyMass`, poisoning weight-trend + nutrition. Reject force-labelled columns + Newton units. *(Regression test added.)*
- **`landmarks.ts`** — flagged as a possible bug (recommend "add volume" while a muscle is "maintaining"); on inspection it is **intentional and explicitly tested**, so left unchanged.

---

## D. Stale data (the brief's focus)

| # | Finding | Status |
|---|---------|--------|
| D1 | **Check-in / weigh-in never invalidated the readiness the user was looking at.** Today's Performance State reads the shell's `bio`; a check-in only refreshed its own local copy → dashboard showed pre-check-in numbers until a full reload. | ✅ Fixed (then superseded by the cache + `useRevalidate`) |
| D2 | **Cold-start empty-state flash.** The shell discarded `useSessions().loading` and passed `sessions=[]` straight in, so a returning athlete saw "Start your first session" for a beat. | ✅ Fixed (loading gate; reinforced by cache) |
| D3 | **Mobile stale-on-focus.** ~16 screens loaded once with `useEffect(load, [])` and never refetched — log a workout, return to Trends/Calendar, see pre-workout data. A parity regression (web refetched). | ✅ Fixed (`useFocusEffect`, then the query cache) |
| D4 | **Duplicate `/api/flags` fetches** — fired once per consumer per load. | ✅ Fixed (single shared store) |
| D5 | **Admin fetch races** (`agent-hq`, etc.) — a slower earlier response could overwrite a newer one. | ✅ Fixed (sequence guard) |

---

## E. Performance

| # | Sev | Finding | Status |
|---|-----|---------|--------|
| E1 | Critical | **No code-splitting** — `app-shell` statically imported ~80 screens + recharts into one chunk for the single `/app` route. | ✅ Fixed (lazy chunks; recharts out of entry) |
| E2 | High | **40 unbounded `findMany`** queries; missing composite indexes — `Session` had only `@@index([userId])` but the dominant query orders by `startedAt`. | ✅ Indexes added (SQL applied). Naturally-bounded list routes left as-is. |
| E3 | High | Whole-tree re-render on every fetch; duplicate requests; no dedup. | ✅ Fixed by the cache |
| E4 | Medium | All client analytics computed from only the **last 50 sessions** (`take: 50`) — a committed athlete gets silently wrong long-range trends. | ⏳ Documented (needs server-side aggregates / pagination) |
| E5 | Medium | Mobile: no list virtualization; `prsForSession` O(n²) inside the History row map; per-second `setState` re-renders the whole 1,770-line logger. | ⏳ Tracked (`mobile-list-virtualization`) |

---

## F. Data model (`prisma/schema.prisma`)

| # | Sev | Finding | Status |
|---|-----|---------|--------|
| F1 | High | **No `onDelete` rules** → GDPR account-deletion hard-fails or orphans PII. (The app *does* delete children in a transaction, but the schema offered no safety net.) | ✅ Fixed — cascade FKs added (SQL applied) |
| F2 | High | "No tenant boundary" — re-diagnosed: data is **user-owned** (a user can be in several orgs), so an `orgId` column would mis-model it. The correct fix is RLS. | ✅ Fixed via RLS (see B6 / `04-database-hardening.md`) |
| F3 | Medium | Missing composite indexes on hot paths. | ✅ Fixed (E2) |
| F4 | Medium | Stringly-typed enums (~20 `status`/`kind` fields are bare `String`). | ⏳ Documented |
| F5 | Medium | Racy agent 7-day budget gate (read-then-decide lost-update). | ✅ Hardened — atomic conditional pause + idempotent notification |
| F6 | Low | `@updatedAt` missing on several mutable tables (sync/conflict-resolution). | ⏳ Documented |

---

## G. Reliability & UX polish

| # | Finding | Status |
|---|---------|--------|
| G1 | No `error.tsx` / `global-error.tsx` / `not-found.tsx` — an unhandled render error white-screened the whole app. | ✅ Fixed (on-brand, provider-independent boundaries) |
| G2 | Mobile errors swallowed → empty-state-on-failure (offline looks identical to "no data"). | ⏳ Tracked (`mobile-fetch-error-states`) |
| G3 | Mobile sub-44pt touch targets (reorder/remove arrows, coach actions). | ✅ Fixed |
| G4 | Mobile haptics only in the workout logger — none on nav/CTAs. | ✅ Fixed (gated by the existing preference) |
| G5 | Inconsistent loading patterns; no skeletons. | Partly addressed (Today skeleton; cache removes most flashes) |
