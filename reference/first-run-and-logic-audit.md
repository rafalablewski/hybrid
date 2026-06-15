# HYBRID — First-run comprehension & logic audit

_Audit date: 2026-06-15. Scope: what a brand-new customer sees and understands
after downloading/opening the app, and where the product's logic breaks down for
a user with little or no data. Evidence is cited as `path:line`. This is an
analysis note, not a set of changes — nothing in the engines/UI was modified._

---

## TL;DR — the verdict

The **shell is honest and the funnel is well-built**: a new user is told plainly
"train first, sign up later," guest mode works, and most cards show clean "log a
session and this fills in" empty states rather than fabricating data. On
first-impression clarity the mobile app is genuinely good.

But there are **three structural problems that undermine "does the user know
what's going on?"**:

1. **The plan library is empty, so the core promise dead-ends on day one.**
   Onboarding's whole pitch is "answer 4 questions → get a plan you'll finish."
   Every goal has `plans: []`, so _every_ user hits "plans coming soon," no
   macrocycle is created, and the roadmap features (Periodize, "This week",
   calendar schedule, compliance) never have anything to render. The app's main
   reason-to-return is structurally switched off.
2. **Several engines emit confident-but-meaningless output for a zero/low-data
   user** — a "peak" HPI of 100, an "on track? · wobbling" judgement on day one,
   a prescribed working weight invented from a population default, all presented
   with the same authority as a calibrated number. This contradicts the repo's
   own stated principle ("never a fabricated number", "no mock data — honestly
   empty").
3. **Trust leaks**: the landing page advertises fabricated traction ("50K+
   athletes · 1.2M sessions · 4.9★") and links anyone — logged-out included —
   straight to the admin console UI.

Net: a new user _understands how to start_, but is then dropped into an
**unguided, 28-screen app with no plan, some cards quietly judging them on no
data, and at least one path to a literal `NaN`**. Fixing the empty plan library
and gating/relabelling the low-data engine states would move first-run clarity
from ~7/10 to genuinely strong.

---

## 1. Does a new user know what's going on? (comprehension)

### What works (keep it)
- **Mobile welcome** (`apps/mobile/app/welcome.tsx`, copy in
  `packages/core/src/i18n.ts`): "Train first. Sign up later." + "Start logging in
  seconds…" + a single dominant CTA "▶ Start your first workout / no account
  needed." Value prop and first action are unmistakable.
- **Guest mode** (`apps/mobile/lib/guest.ts`, `app/workout.tsx`): full
  log→finish→share flow with no account; sessions stored on-device and flushed up
  on sign-in. Removes the cold-start wall correctly.
- **Web landing** (`apps/web/app/page.tsx`): "Train like two athletes… the only
  log built for athletes who lift heavy _and_ condition." Clear positioning and
  differentiation.
- **Honest empty states** on the home cards "Your route today", "Future self",
  and the hidden-until-data HPI/Twin and recap cards (mobile
  `app/(tabs)/index.tsx`, web `components/today.tsx`): they explain what to do to
  unlock the feature instead of showing zeros.

### Where comprehension breaks
- **No orientation after onboarding.** After the 4 questions the user lands on a
  6-group / ~28-screen app (`packages/core/src/nav.ts`) with no "here's your next
  step" guide. Coach/Squad/Team-compare/Organization/Tactical are visible to a
  solo athlete with no explanation they're for multi-athlete orgs.
- **Jargon is unexplained on the home screen.** "readiness", "HPI", "habit
  strength", "load ×1.00", "intensity" appear on Today with no inline definition;
  a beginner has no model for them.
- **"Get started"/onboarding never marks complete** (web nav) — it stays in the
  nav and is re-entrant, so there's no sense of progression.
- **The empty plan library reads as "the app is unfinished."** Pick any goal →
  "Plans for this goal are coming soon" (mobile `app/onboarding.tsx`, web
  `components/onboarding.tsx`). A new user can't tell this is temporary content
  rather than a broken feature.

---

## 2. Lack of logic — engine behaviour on no / low data

These are concrete gaps where the math produces output that looks authoritative
but isn't earned by data. All contradict CLAUDE.md / capabilities.ts claims of
"never a fabricated number" and "honestly empty."

| # | Engine | Zero/low-data input | Output today | Problem |
|---|--------|--------------------|--------------|---------|
| 2.1 | **HPI** (`engines/hpi.ts:90-101`) | 0 sessions | `score = 100`, band **"peak"** | HPI measures _freshness_ (inverse fatigue), so a detrained beginner reads "peak performance." Conceptually inverted for a new user. |
| 2.2 | **Readiness / HPI NaN** (`engines/readiness.ts:11` + `signals.ts:155`) | a logged biometric value of `0` | **`NaN`** readiness & HPI | `dev = (today-baseline)/baseline`; with no history `baseline = now.value`, so a `0` reading → divide-by-zero → NaN cascades to the score. Real bug, only needs one bad input. |
| 2.3 | **Biometric placeholders** (`signals.ts:172-182`) | 1 of 3 recovery signals present | other two treated as `today=1, baseline=1` → +0 nudge | "Missing data" is silently rendered as "perfectly average," hiding the absence of a baseline. |
| 2.4 | **Strength prescription** (`engines/prescription.ts:100-105,178-180`) | 0 history for the lift | `MOVEMENTS[move].baseLoad × 1.2`, shown as "75% e1RM @ Xkg" | An invented starting weight presented with the same wording as a calibrated one — no "this is an estimate, log to personalise" signal. |
| 2.5 | **Easy-run target** (`engines/prescription.ts:41-55`) | 0 runs | "5 km @ 6:30/km" | Population default rendered as a personal prescription, despite the code comment claiming "no fabricated personal pace." |
| 2.6 | **Accountability** (`engines/accountability.ts:57-87`) | 0 sessions | `risk = 50`, band **"wobbling"** | "Wobbling" implies a lapse; a brand-new user is mid-scale "at risk" on day one. (Headline copy is friendly, but the band/risk shown elsewhere isn't.) |
| 2.7 | **Future Self** (`engines/future-self.ts:113-126`) | <2 points | flat 12-week line, `insufficient:true` | If the `insufficient` flag isn't surfaced loudly, a beginner sees a flat trajectory = "I won't progress." (Home cards do guard this; verify every consumer does.) |
| 2.8 | **Onboarding recommendation** (`onboarding.ts:69-99` + `plans.ts:81+`) | any goal | `recommendPlan() → null` | Every goal `plans: []`, so no plan is ever recommended/enrolled — the degraded path is the _only_ path. |

**Cross-cutting fix pattern:** these engines should distinguish "calibrated",
"estimated (population default)", and "insufficient data" as first-class states
(Future Self already has `insufficient`), and the UI should label estimates as
estimates rather than rendering them identically to earned numbers.

---

## 3. Lack of use — will a customer keep coming back?

- **The retention loop has no fuel.** The product's "come home and review" beat
  (Periodize, "This week" phase card, calendar load heat, compliance/adherence,
  weekly recap deltas) all depend on an enrolled macrocycle and/or repeated
  sessions. With the **empty plan library** there is no macrocycle, so a large
  share of the app renders blank or hidden for everyone. The single biggest
  30-day-retention lever (per capabilities.ts `onboarding`) is currently a
  no-op.
- **Day-one overwhelm.** 6 nav groups / ~28 screens with no progressive
  disclosure for a solo beginner. Advanced/coach/org/tactical/talent surfaces are
  all reachable immediately.
- **Cards that judge before earning data** ("On track? · wobbling", risk 50)
  risk demotivating the exact moment we want momentum. The mobile/web agents both
  flagged this as the most likely "why is it judging me?" reaction.
- **No notification/reminder channel yet** (capabilities `push-notifications`
  = blocked). The Accountability Engine decides _who_ to nudge but has no way to
  reach them, so the re-engagement loop can't close — fine as a known block, but
  it means retention currently rests entirely on the user remembering to return.

---

## 4. Problems — trust, correctness, safety

- **Fabricated social proof** (`apps/web/app/page.tsx:72-74`): "50K+ athletes /
  1.2M sessions / 4.9★ on App Store" on a pre-launch app with no users. Directly
  contradicts the repo's "no mock data / honestly empty" ethos and is a
  credibility/own-goal risk if a real user or reviewer notices.
- **Admin console UI open to anyone** (`apps/web/app/page.tsx:63` links
  "Open the admin panel" → `/admin`; `app/admin/page.tsx` renders `<AdminPanel/>`
  with no role guard; `components/admin/panel.tsx` only prints a cosmetic
  "Restricted · admin only"). Data is presumably still protected at the API/RLS
  layer (NOT verified here), but exposing the operator UI shell — and advertising
  it from the public landing page — is a trust and surface-area problem. _Action:
  verify every `/api/admin/*` route enforces the ADMIN role server-side._
- **NaN path (2.2)** is a correctness bug: one zero-valued biometric breaks the
  headline readiness/HPI number with no guard.
- **"Continue to the app" after empty onboarding** leaves the user with
  `macro: null` and no recorded goal-driven plan — silent state that later cards
  depend on, with no explanation of why "This week" is missing.

---

## 5. Prioritised recommendations

1. **Unblock the plan library (highest leverage).** Even one real plan per goal
   turns onboarding from a dead-end into the retention engine it's designed to
   be. Until then, move the "plans coming soon" message _before_ the 4 questions
   so the user isn't pitched a plan that can't be delivered, and give the
   no-plan landing an explicit "here's what to do now" (start a workout) step.
2. **Add an explicit `insufficient` / `estimated` contract to the engines** and
   gate/relabel the low-data UI:
   - HPI & readiness: return/where-shown an "establish a baseline" state instead
     of 100/"peak" and instead of judging on no data.
   - Accountability: keep band="onboarding" (or risk≈0) visible, don't surface
     "wobbling"/risk 50 to a day-one user.
   - Prescription & easy-run: label population defaults as estimates ("starting
     weight — log to calibrate").
3. **Fix the NaN guard** (2.2/2.3): reject or clamp zero/implausible biometric
   values, and guard `dev()` against `baseline === 0`.
4. **Remove fabricated social proof** and the public admin link; verify
   server-side ADMIN enforcement on `/api/admin/*`.
5. **Add a lightweight first-run orientation** (what to do next, plain-language
   "what is readiness/HPI") and progressive disclosure so a solo athlete isn't
   shown coach/org/tactical surfaces on day one.

---

_Method: traced the unauthenticated→authenticated journey on both clients and
the no-data behaviour of the shared engines; high-impact claims (HPI=100,
NaN-readiness, neutral placeholders, fabricated stats, open admin route) were
verified directly against source before inclusion._
