# Plan — Coach-led client onboarding (invite by email / phone / QR)

## DECISIONS LOCKED (2026-06-19)
- **Delivery v1:** **QR + copyable link now** (coach shares via own channel);
  email/phone stored for auto-match on signup; automated email/SMS later. ✔
- **Claim = consent:** using the invite **auto-creates an ACTIVE link** (no extra
  Accept tap). ✔
- **On claim:** link + **free plan only**; the coach assigns plans/diet afterward
  (no goal/plan picker at invite time in v1). ✔
- **Mobile deep-link:** v1 QR encodes the **web** URL (works today); native
  app-open deep-link lands with the EAS build (blocked on Apple Developer acct). ✔
- **Reuse:** mirror the existing `claimPendingInvites` org-invite pattern in
  `apps/web/lib/server-auth.ts` for claiming coach invites by verified email.

**Status:** PLAN ONLY — implemented after step ① (access change is done).
**Builds on:** `plan-coached-readonly.md` (coached client = Casual + read-only
assigned; Pro to edit/add).

## Goal
A coach can add a client who **doesn't have the app yet**. Three ways:
1. **Email address**
2. **Mobile phone number**
3. **QR code** the client scans

When the client installs/opens the app, they are **automatically**:
- created on the **free (Casual)** plan,
- linked as a **client of that coach** (ACTIVE),
- given **read-only** access to every tab according to their assigned plan (view
  plan, program, diet — can log their own workouts/intake, but **cannot edit or
  add** coach content). Editing/adding new records requires upgrading to **Full
  (Pro)** — exactly the coached-client model already planned.

## The gap today
`apps/web/app/api/coach/links/route.ts` (POST) only links an **existing** user
by email:
```
const target = await prisma.user.findUnique({ where: { email } });
if (!target) return 404 "they must sign in once first";
```
There is no way to invite someone who isn't a HYBRID user yet, and no token/QR
mechanism. We add a **pre-account invite** that is *claimed* on first sign-up.

---

## Design

### New model: `CoachInvite` (Prisma + Supabase SQL)
```
model CoachInvite {
  id          String   @id @default(cuid())
  coach       User     @relation(fields: [coachId], references: [id])
  coachId     String
  token       String   @unique           // random, used for the link + QR
  email       String?                     // optional auto-match target
  phone       String?                     // optional auto-match target
  status      String   @default("PENDING") // PENDING | CLAIMED | REVOKED | EXPIRED
  // optional: what to set up on claim
  groupId     String?                     // drop them into a CoachGroup
  goal        String?                     // assign a goal/plan on claim
  planId      String?
  claimedById String?                     // the user who claimed it
  createdAt   DateTime @default(now())
  expiresAt   DateTime                    // e.g. +30 days
  @@index([coachId]) @@index([email]) @@index([phone])
}
```
Ship `reference/sql-coach-invites.sql` (sandbox can't migrate). Endpoints
soft-degrade to "not enabled yet" until the table exists, so deploy is safe in
any order (matches the existing coach-groups/programs pattern).

### All three methods create ONE CoachInvite — they differ only in delivery
- **QR** *(buildable now, zero external deps)* — generate the invite, render a
  QR encoding `https://<app>/invite/<token>`. Client scans → lands on the claim
  page → signs up → claimed. **Recommend this as the v1 default.**
- **Email** *(needs transactional email)* — same invite, emailed as a link.
  Can piggyback on Supabase Auth email, or a provider (e.g. Resend). The email
  is also stored so we can **auto-match** at sign-up.
- **Phone / SMS** *(needs an SMS provider — NEW paid dependency, e.g. Twilio)* —
  same invite, sent as an SMS link. Mark **blocked** on SMS credentials. Phone is
  stored for **auto-match** at sign-up.

> Pragmatic fallback so nothing blocks v1: every invite also yields a **copyable
> link + QR** the coach can send through their own channel (WhatsApp/iMessage),
> so email/phone delivery can lag behind without blocking the feature.

### Claim flow (the auto-assignment)
New route `POST /api/coach/invite/[token]/claim` (and an auto-match on first
sign-in):
1. Validate token: exists, `PENDING`, not expired. (Or: find a PENDING invite
   whose `email`/`phone` matches the **verified** signup identity.)
2. Create `CoachLink { coachId: invite.coachId, clientId: newUser.id,
   status: "ACTIVE" }`. **Consent = the act of claiming the coach's invite**
   (scanning/clicking/signing up through it) — documented exception to the
   "client must accept" step, justified because the client initiated via the
   coach's link.
3. Apply optional setup: add to `groupId`, assign `goal`/`planId`
   (reuse `buildMacrocycle` / assignment materializer already used by
   coach-assign-plans + coach-program-builder).
4. Mark invite `CLAIMED` (single-use), set `claimedById`.
5. New user defaults to **Casual/free**; coached read-only access flows from the
   ACTIVE link per `plan-coached-readonly.md`.

### Web claim landing — `apps/web/app/invite/[token]/page.tsx`
- Public page: "Coach <name> invited you to HYBRID." → sign up / log in
  (Supabase) → calls claim → redirects into the app already linked.

### Mobile claim — deep link
- `apps/mobile/app/invite/[token].tsx` via expo-router; QR/link opens the app
  (or App Store → app) and routes here → auth → claim.
- Needs the app URL scheme / universal links configured (an **EAS build**
  concern; QR can encode the web URL which then deep-links / falls back to store).

### Coach UI — "Add a client"
Add to the Coach screen on BOTH clients (web `components/coach.tsx` +
`components/aurora/coach.tsx`; mobile `app/(tabs)/coach.tsx` +
`components/aurora/coach.tsx`):
- An **"Add client"** control with three options: **Email · Phone · QR**.
- Email/Phone → input + "Send invite" (or "Copy link"). QR → render the QR +
  shareable link.
- A **pending invites** list (status + revoke). Show seat usage vs cap.
- Keep the existing "link an existing user by email" path too (still valid).

### Existing invite endpoint
- Extend `/api/coach/links` POST (or add `/api/coach/invite`) so that when the
  email/phone has **no** existing user, it creates a `CoachInvite` instead of
  404-ing. Existing-user case is unchanged (PENDING link → accept).

---

## Guardrails
- **Seat cap:** a coach can't push (ACTIVE links + open invites) past their tier
  cap (Starter 10 / Pro 40 / Business 150). Enforce at invite-create AND claim.
- **Token:** cryptographically random, **single-use**, **expirable** (e.g. 30d).
- **Auto-match safety:** only auto-link on an email/phone that Supabase has
  **verified** for that account, so a stranger can't claim someone's invite.
- **Rate-limit** invite creation; cap concurrent pending invites per coach.
- **Audit** invite create / claim / revoke (mirror coach.approve auditing).
- **Body-limit** guard write routes (`readJsonLimited`, as elsewhere).

## Files touched
- `prisma/schema.prisma` (+ `reference/sql-coach-invites.sql`)
- `apps/web/app/api/coach/invite/route.ts` (create/list), `.../[token]/route.ts`
  (revoke), `.../[token]/claim/route.ts` (claim) — or fold into `coach/links`
- `apps/web/app/invite/[token]/page.tsx` (web claim landing)
- `apps/mobile/app/invite/[token].tsx` (mobile claim / deep link)
- `apps/web/components/coach.tsx` + `components/aurora/coach.tsx` (Add-client UI)
- `apps/mobile/app/(tabs)/coach.tsx` + `components/aurora/coach.tsx` (parity)
- `apps/mobile/lib/api.ts` (invite create/claim helpers)
- QR rendering dep (web: small QR lib/inline SVG; mobile: RN QR component)
- `packages/core/src/i18n.ts` (EN/PL/DE strings for the new UI)
- `packages/core/src/capabilities.ts` — add capabilities:
  - `coach-client-invite` — QR + link onboarding (buildable now → shipped once
    built)
  - `coach-invite-email` — needs transactional email (blocked/planned)
  - `coach-invite-sms` — needs an SMS provider, e.g. Twilio keys (blocked)

## Dependencies / blockers (honest)
| Method | New dependency | Status |
|---|---|---|
| QR + shareable link | none (QR lib only) | **buildable now** |
| Email delivery | transactional email (Supabase Auth email or Resend) | minor config |
| SMS delivery | SMS provider account + keys (Twilio/Vonage) — paid | **blocked** |
| Mobile deep-link open | app URL scheme / universal links via EAS build | needs EAS |

## Open questions before build
1. **Delivery scope for v1:** ship **QR + copyable link** now (coach sends it via
   their own channel; email/phone auto-match on signup) and add automated
   email/SMS later? *(Recommended — unblocks immediately, no Twilio cost.)* Or
   stand up automated email + SMS now (commit to a provider + budget)?
2. **Claim = consent → ACTIVE** (recommended) vs. land as PENDING and still ask
   the client to tap "Accept"?
3. **What auto-assigns on claim:** just the free plan + the coach link (simplest),
   or also a goal/plan/group the coach picked when creating the invite?
