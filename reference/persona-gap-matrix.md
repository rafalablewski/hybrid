# HYBRID — persona → feature gap matrix

_Date: 2026-06-15. Purpose: for each customer type, map what's **built**, what's
**missing**, and what's **mis-placed** (built, but in the wrong place / shown to
the wrong person), with evidence. Grounded in `packages/core/src/capabilities.ts`
(capability ids in `code`), `packages/core/src/nav.ts`, and the web shell
`apps/web/components/app-shell.tsx`. Companion to `first-run-and-logic-audit.md`._

---

## The three customers (four contexts)

| Persona | Wants the app to be… | In-gym interaction | Anchor moment |
|---|---|---|---|
| **1 · Average Joe** (retail) | a frictionless logger + a loud share loop | as little as possible | finish → **share** (our download engine) |
| **2 · The Athlete** (data/technique, maybe a coach) | a deep, organized cockpit toward a goal | logs precisely, reviews often | progress vs goal, monitored with coach |
| **3a · Coach (1:1)** | a client heartbeat + assignment tool | n/a (operates on others) | weekly check-in loop |
| **3b · Coach (team)** | a triage + comparison dashboard | n/a | scan roster, spot who's slipping |

---

## THE central finding (affects all personas)

**The app has one flat navigation, and it is role-unaware.** The web sidebar
renders `groupedNav()` filtered **only by feature flag**, never by role
(`app-shell.tsx:178-179` — `items.filter((it) => isEnabled('nav.'+it.id))`). The
only role shaping anywhere is the analytics **scope switcher** (athlete/coach/
operator) buried *inside* the dashboard screen and the admin-console button.

Consequence: **every persona sees every other persona's surface.** A retail Joe's
sidebar carries the whole `teams` group (Coach, Squad monitor, Team compare,
Organization, Talent, Tactical) and the whole `analyze` group (Velocity, Force
plate, Video, Performance) — 28 items in six groups (`nav.ts`). The Athlete's
depth is scattered through that same flat list, and the Coach is squeezed into a
scope toggle rather than getting a console. **One IA fails all three, in opposite
directions.** Nearly every "mis-placed" row below traces back here.

---

## Persona 1 — Average Joe (retail)

### Built ✅ (this persona is the best-served today)
The mobile **train funnel** was designed exactly for him:
- One-tap start, count-in, big tap targets, previous-set carry-over, rest
  countdown + haptics + background alert, screen-stays-awake, swipe-to-delete,
  reorder, "last time" reference — `train-funnel`, `rest-haptics`,
  `exercise-picker`.
- **Train before signup** (`guest-first-workout`); never-lose-a-workout
  (`workout-resume`, `offline-sync`).
- Come-home review: `session-detail`, History, `pr-detection`, `weekly-recap`.
- **Share**: branded workout PNG + "your week" recap card (`share-card`,
  `weekly-recap-ui`).

### Missing ❌
- **Share isn't the climax it needs to be.** For an acquisition anchor, the
  finish→share moment should feel inevitable and beautiful — right now it's a
  button on the summary. No streak/PR-driven auto-prompt, limited templates, no
  "your first workout" hero share.
- **Push/reminders** to pull him back (`push-notifications` — BLOCKED on creds).
  The Accountability Engine decides who/what to nudge but can't deliver it.
- **Onboarding over-promises a plan** he can't get (empty library) — noise for a
  guy who just wants to log (see `first-run-and-logic-audit.md` §2.8).

### Mis-placed ⚠️
- His surface should be ~4 things (Today / Train / History / Share). Instead the
  mobile **More** hub stacks Plans, Sport, Velocity, Coach, Calendar, Progress,
  Nutrition, Check-in, Onboarding; the web sidebar shows the full 28. He has to
  navigate *past* the Athlete's and Coach's tools to reach his own.

---

## Persona 2 — The Athlete (data & technique, may have a coach)

### Built ✅ (enormous surface already exists for him)
- **Sport + goal + season:** `sport-engine` (per-sport S&C dosed off his e1RM),
  `plans-enroll` + `periodize` + `plan-arbiter` (phase-arbitrated week),
  `future-self`, `competition-intel` (peaking to an event date).
- **Depth/variables:** `vbt-engine` + Velocity screen, `web-running` analytics,
  `forceplate-ingest`, `athlete-twin`/`hpi` cockpit + trajectory, `injury-risk`
  tissue map + RTP.
- **Technique:** `video-intel` — a real markerless motion-analysis *engine*
  (joint angles, rep count, L/R asymmetry, 0..100 technique score) feeding the
  Twin.
- **Monitored with coach:** `checkins` (submit → coach replies), shared
  `coach-week-view`. **Solo degrade:** his own Twin/Performance/analytics all
  compute without a coach linked.

### Missing ❌ — *the inputs he cares about most are capture-gated*
- **Technique is effectively inert for a real user.** The engine is shipped, but
  there's **no on-device pose capture** to produce the frames — so he can't
  actually create an analysis (`video-intel`: "Remaining integration:
  on-device/phone pose-estimation capture"; needs the native module + EAS build).
- **Live VBT is manual.** Per-rep bar speed must be hand-typed in m/s;
  `vbt-capture` (sensor/camera) is BLOCKED. The whole VBT cockpit runs on manual
  numbers most retail athletes won't enter.
- **Recovery is manual.** `wearables` (WHOOP/Oura/Garmin/Apple) BLOCKED on OAuth
  creds + the HealthKit native module → readiness/HPI recovery comes from manual
  check-ins only, not the continuous stream a data-athlete expects.
- **Force plate** needs hardware + a CSV he likely doesn't have.
- **The goal→plan→season spine is broken** by the empty plan library: he picks a
  sport/goal in onboarding, gets **no plan**, and Periodize is empty until he
  self-schedules a week.

### Mis-placed ⚠️
- No **athlete cockpit**: his coherent path (sport → goal → season → today →
  performance → technique) is shattered across the `train` and `analyze` nav
  groups, interleaved with Joe's basics and the Coach's tools. He has to assemble
  his own workflow from a flat menu.

---

## Persona 3 — The Coach (1:1 and team)

### Built ✅
- **1:1:** `coach-layer` (CoachLink mutual consent, roster, per-client sessions,
  private notes), `checkins` read+reply, `workout-builder` + `Assignment`,
  `coach-week-view`, coach-side periodized-week generation (`plan-arbiter`).
- **Team:** `squad-monitor` (RAG readiness + ACWR + injury flags, worst-first),
  `team-compare`, `auto-segmentation` ("who needs me today"), `coach-tags`.
- **Org tier above the coach:** `org-graph` (Organization/Team hierarchy,
  OWNER/DIRECTOR/COACH/MEDICAL/ANALYST/ATHLETE roles, team-subtree scoping),
  plus the `tactical-vertical` and `talent-graph` extensions.

### Missing ❌
- **He can't charge.** `billing` is BLOCKED (no Stripe path) — the monetization
  that *defines* this persona. Pricing/unit-economics are modeled
  (`financials-model`) but there's no live charge/seat path.
- **No self-serve coach onboarding.** Role is `CLIENT|COACH|ADMIN` set via auth
  metadata / admin (`auth-email`); there's no "I'm a coach → invite my clients"
  signup funnel. A coach can't easily *become* one and build a roster.
- **No coach-first home.** The thing he opens every morning (squad monitor) isn't
  a landing — he arrives in the athlete app and toggles scope.

### Mis-placed ⚠️
- **Coach tools live in the shared `teams` nav group shown to every client**
  (flag-only filter), so solo Joe sees Coach/Squad/Org while the coach
  simultaneously sees the full personal-logger nav. The coach identity is a
  buried **scope switch** inside the analytics screen, not the app's top-level
  shape.

---

## Cross-cutting gaps (hit every persona)

1. **Role-unaware IA** (the central finding) — one flat 28-item nav for everyone.
2. **No persona fork at onboarding** — everyone gets the same 4-question *client*
   intake; no "training solo / athlete with a coach / I'm a coach" branch that
   sets the app's shape.
3. **Empty plan library** (content) — breaks the Athlete's goal→plan spine and
   the Coach's assign-from-library richness.
4. **Capture/integration layer blocked** (`wearables`, `vbt-capture`,
   video pose, `nutrition-fooddb`) — the real-time inputs the Athlete lives on
   are all manual or gated on device/creds/EAS build.
5. **Delivery layer blocked** (`push-notifications`) — Joe's retention nudges
   have no channel.

---

## Prioritised recommendations

1. **Persona-aware app shape** (highest leverage — fixes the central finding).
   Role-/persona-filter the nav, give each persona a different **home** and a
   different **primary action**, and pick the persona at onboarding. Everything
   below sits on this.
2. **Joe:** collapse his surface to **Today / Train / History / Share** and make
   the **post-workout share the reward** (auto-prompt on PR/streak, beautiful
   templates, a first-workout hero card) — directly feeds downloads.
3. **Athlete:** assemble an **organized cockpit** (sport→goal→season→today→
   performance→technique) AND unblock **one real input stream** so depth isn't
   manual-only — Apple HealthKit via an EAS build is the cheapest unlock for
   continuous recovery; camera pose-capture unlocks the dormant technique engine.
4. **Coach:** a **coach-first landing** (squad monitor as home), **self-serve
   coach onboarding + client invite**, and unblock **billing** (Stripe) so the
   SMB tier can actually transact.
5. **Content:** seed the **plan library** (separate workstream; do not fabricate).

---

_Method: cross-referenced the capability registry against the canonical nav map
and the web shell's nav-filtering, and against the journey/engine findings in
`first-run-and-logic-audit.md`. "Built" = a `shipped` capability; "blocked" items
are flagged with their `blockedBy`._
