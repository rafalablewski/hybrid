# Plan — Coached clients get Casual + read-only assigned (not Full)

**Status:** PLAN ONLY — no code written yet (awaiting approval).
**Decision (confirmed):** A client linked to an active coach must get the
**Casual (free)** experience **plus a read-only view of everything the coach
assigned** (plans, programs, **and diet**). They keep Casual logging (own
workouts + nutrition intake). **Editing / adding / self-programming / the
adaptive engine require the Athlete (Pro) upgrade.** A coach link must **never**
grant Pro.

## The core problem in code today
`packages/core/src/nav.ts` → `resolvePersona()` (lines ~136–150) has a fast path:

```ts
// A client with an ACTIVE coach gets the full athlete experience ... regardless
// of their own billing entitlement or mode choice.
if (hasActiveCoach) return "athlete";
```

This single line is what grants coached clients the full paid tier. Both clients
derive `hasActiveCoach` from `/api/coach/links` (`asClient` has an `ACTIVE` link)
and feed it into `resolvePersona` via `usePersona()`.

## Design choice (recommended)
**Do NOT add a 5th persona.** Keep the clean nested model
(`casual ⊂ athlete ⊂ coach ⊂ admin`). Instead:

1. `resolvePersona` stops returning `athlete` for `hasActiveCoach`. A coached
   client resolves to **casual** (unless they themselves are paid).
2. Keep a separate `hasActiveCoach` boolean (already derived on both clients) but
   repurpose it to unlock **read-only assigned surfaces**, not nav/persona depth.
3. Gate the *write* actions (build/edit/add, adaptive depth) on **persona/
   entitlement**, defence-in-depth on the server too — not just nav hiding.

Rationale: the screens a coached client needs (Today, Plans, Nutrition,
Calendar, Check-in) are **already casual-visible**. What changes is (a) they no
longer get the athlete-only depth/authoring, and (b) coach-assigned content
(incl. diet) renders read-only inside those casual screens.

---

## Work breakdown

### 1. Core — `packages/core/src/nav.ts`
- Remove the `if (hasActiveCoach) return "athlete"` branch from `resolvePersona`.
  Keep the `hasActiveCoach` param (still useful to callers) OR drop it from the
  signature and expose the boolean separately — **recommend: keep the param but
  make it not affect the returned persona**, to minimise call-site churn.
- No change to `NAV_ITEMS` / `minPersona` (the casual set already includes
  today, plans, nutrition, calendar, checkin, history, log, progress).

### 2. Core tests — `packages/core/src/nav.test.ts`
- Rewrite the test "a client with an ACTIVE coach gets Full on the coach's seat":
  now `resolvePersona("client","casual","free",true)` must equal **"casual"**.
- Add a test asserting a coached client is still casual, and a paid client is
  still athlete regardless of coach link.
- The casual nav-set test is unchanged (still passes).

### 3. Web persona — `apps/web/lib/persona.ts`
- Keep `activeCoach` + `ensureCoachFetch()` + a `useHasActiveCoach()` hook.
- `usePersona()` keeps passing `coached` to `resolvePersona` (now a no-op for
  persona), but components that show assigned content read `useHasActiveCoach()`.

### 4. Mobile persona — `apps/mobile/lib/persona.ts`
- Same as web (parity). Keep the hook; persona output changes via core.

### 5. Surface read-only assigned content to coached casual users
Currently some assigned-content cards on Today are gated behind
`usePersona() !== "casual"` (e.g. reconciled week / Twin). Coached clients are
now casual, so we must **explicitly** show the *assigned* pieces to them:
- **Web** `apps/web/components/today.tsx`: the "Assigned by your coach" /
  reconciled-week card should render when `useHasActiveCoach()` is true (read-
  only), even for casual. Keep the adaptive/Twin/Future-Self cards athlete-only.
- **Mobile** `apps/mobile/app/today.tsx` (+ Aurora variant): mirror the same.
- The assignment data already flows via `/api/assignments` (gated by
  `athleteId`, not persona) and the calendar already renders it — good.

### 6. Read-only enforcement on assigned content
- A coached casual user must not be able to **edit** the coach-assigned plan /
  program / diet. Render those views without edit affordances; the builder /
  periodize / template editors stay athlete-gated (nav-hidden) as today.
- Add **server-side** guards (defence-in-depth) so authoring endpoints reject
  non-paid callers even if a client is coached:
  - `apps/web/app/api/templates/route.ts` (POST) — require `entitlement==="paid"`.
  - `apps/web/app/api/.../macrocycle` athlete-write paths — same.
  - Any other athlete-authoring write route. (Coach routes are unaffected — they
    gate on the COACH role / CoachLink.)

### 7. Diet/nutrition — NEW build (the main gap)
Today **only training plans/programs are coach-assignable**; there is no
coach-assigned diet. The decision requires clients to view assigned **diet**.
- **Coach side:** let a coach assign a nutrition target / diet to a client or
  group (new field on Assignment or a small `DietAssignment` model + endpoint).
- **Client side:** the Nutrition screen (already casual-visible) shows the
  coach-assigned diet **read-only** (a "Assigned by your coach" band) above the
  user's own Casual macro logging (which stays editable — it's logging).
- Both clients (web `components/nutrition.tsx`, mobile `app/nutrition.tsx`).
- Needs a Supabase SQL migration (hand the user the SQL — sandbox can't migrate).
- Track as its own capability: `coach-assign-diet` (planned until built).

### 8. Logging stays free (no change)
Confirmed: `log` / sessions / nutrition quick-add are casual, no entitlement
gate. Leave as-is — coached clients keep logging.

### 9. Capabilities registry — `packages/core/src/capabilities.ts`
- Update `persona-shape`: replace the "ADAPTIVE ON THE COACH'S SEAT … a client
  with an ACTIVE coach resolves to the athlete persona" passage with the new
  model: "a coached client is **casual + read-only view of coach-assigned
  content** (plans/programs/diet); the adaptive/authoring tier is paid-only; a
  coach link never grants Pro."
- Adjust `coach-assign-plans` / `coach-program-builder` wording where they imply
  clients get the full adaptive experience on the seat → "clients view assigned
  content read-only on the free app."
- Add `coach-assign-diet` (planned) per §7.

### 10. Pitch doc — DONE
`hybrid-gym-pitch.html` already reflects the new model (pricing, the integrity
section, and the financial model with the coached→Pro upsell pool).

---

## Open questions before build
1. **Coached client + readiness-adjusted loads:** the coach may assign a program
   whose loads are meant to adapt. Do we (a) show the assigned numbers exactly as
   the coach set them (simplest, fully consistent with "read-only assigned"), or
   (b) let the *coach's* adaptive engine recompute server-side so the client sees
   live-adjusted targets without holding Pro themselves? Recommend (a) for v1.
2. **Diet assignment scope:** simple macro targets (protein/carbs/fat/kcal) for
   v1, or a full meal plan? Recommend macro targets first.
3. **Existing coached users:** anyone currently relying on seat-granted Full will
   drop to casual on deploy. Acceptable (pre-launch), but worth a heads-up.
