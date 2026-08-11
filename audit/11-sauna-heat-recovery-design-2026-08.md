# Sauna as a recovery input — design exploration

**Status:** proposal, nothing built. Registered in `capabilities.ts` as
`heat-recovery` (planned).
**Date:** August 2026.

There is currently no way to record a sauna in HYBRID — not as a session, not as
a signal, not as a check-in field. `grep -ri sauna` over the whole repo returns
nothing. This document works out what it would take, what it should be allowed
to move, and what it must never touch.

**No device will ever measure this.** A watch does not know you sat in a sauna,
and nothing in the room reports to us. The entire input is two numbers the
athlete types: how long, and how hot. That is not a weakness to design around —
it settles the architecture in §2, and it is why temperature is a first-class
field rather than a v2 nice-to-have.

---

## 1. What the evidence actually supports

Worth separating, because the two halves land in two different engines and only
one of them is well evidenced.

**Chronic heat exposure — reasonably supported.** Repeated post-exercise sauna
drives heat acclimation: plasma volume expansion of roughly 3–5% over 7–10 days
of consistent exposure, raised HSP70, improved thermoregulation and
cardiovascular stability at submaximal loads (Scoon 2007; Stanley 2015;
Zurawlew 2016 for the hot-water-immersion analogue). The Finnish KIHD cohort
(Laukkanen) shows a dose-response on cardiovascular and all-cause mortality that
strengthens at 4+ sessions/week — observational, but the dose curve is
consistent. This is an *adaptation* effect, measured in weeks.

**Acute post-session recovery — weak and mixed.** Evidence that a sauna after a
hard session accelerates strength recovery or reduces DOMS is thin. Mero (2015)
found improved perceived neuromuscular recovery with far-infrared after combined
strength and endurance work; other trials find nothing over passive rest. The
honest read is that the acute effect is largely perceptual and parasympathetic,
not tissue repair.

**And sauna is itself a load.** Heart rate of 100–150 bpm, meaningful fluid loss,
and — this is the part that matters for us — *suppressed overnight HRV and
elevated resting HR* when taken hot, long, or immediately after a hard session.
A naive "sauna therefore +readiness" would be wrong in exactly the case the user
is most likely to log it.

**The consequence for the design:** the chronic channel earns a real (small)
engine term. The acute channel does not earn a fixed bonus. And a big chunk of
the real effect is already being measured by instruments we have.

**Duration alone is not the dose.** Twenty minutes at 90 °C and twenty minutes in
a 55 °C infrared cabin are not the same stimulus. Temperature is therefore not
decoration on the log entry — it is half the input, and it converts minutes into
*equivalent minutes at a stated reference* before anything else runs.

---

## 2. The double-counting problem, and why it decides the architecture

If sauna improves sleep quality and parasympathetic tone, the *wearable term
already credits it*. HRV up and resting HR down is precisely what
`biometricAdjustment()` reads, at ±15 points, from the athlete's own baseline.
Adding a flat "+3 for sauna" on top counts the same physiology twice — and on
the bad-dose day it credits sauna while the wearable correctly debits it, so the
athlete sees two terms fighting over one night.

`packages/core/src/engines/signals.ts` already states the governing principle
for this codebase: *no measurement, no adjustment* (`BIOMETRIC_FRESH_DAYS`, and
the comment about a months-old sync pinning a permanent nudge onto the score).
`landmark-adapt.ts` states the other half: a prior gets corrected by an
observation, it does not stack with it.

So: **sauna is a prior. The wearable is a measurement. A measurement always
beats a prior.**

**A typed number is still allowed to count — in its own tier.** HYBRID already
runs on self-reports: RPE, the post-session feel, the daily check-in, every gram
of logged food. None are measured either and all move real numbers. But the app
keeps a hierarchy, and heat is the one recovery input that will never graduate
out of the report tier — which is exactly why the suppression rule below is a
permanent shape rather than a stopgap. It is not waiting for a sensor.

---

## 3. Proposed model — three channels, phased

### Phase 1 — log it, and measure it. Zero score impact.

Ship the logging surface and the storage, move nothing in the engine. The app
starts accumulating the data that phases 2 and 3 need, and the athlete gets a
visible record of a habit they are already keeping.

This is not a stalling tactic — it is the only order in which phase 3 is
possible, and phase 3 is the version worth having.

### Phase 2 — a bounded acute credit, subordinate to the wearable

New module `packages/core/src/engines/heat.ts`, one function
`heatAdjustment(saunaSignals, now, bio?) → { points, minutes, hoursSince, suppressed }`.

```
intensity(T) = clamp((T − HEAT_FLOOR_C) / (HEAT_REF_C − HEAT_FLOOR_C), 0, HEAT_INTENSITY_MAX)

equivMin  = Σ minutesᵢ × intensity(tempCᵢ)     // sittings inside HEAT_WINDOW_H
dose      = HEAT_CREDIT_MAX × (1 − e^(−equivMin / HEAT_TAU_MIN))
decay     = 0.5 ^ (hoursSinceLast / HEAT_HALF_LIFE_H)
points    = bio ? 0 : round(dose × decay)
```

Proposed constants, all tunable and all deliberately timid:

| constant | value | why |
| --- | --- | --- |
| `HEAT_FLOOR_C` | `45` °C | below this a room is warm, not thermally stressful. A hot shower earns nothing. |
| `HEAT_REF_C` | `80` °C | the low end of a traditional Finnish sauna, and the anchor: here an equivalent minute *is* a minute. |
| `HEAT_INTENSITY_MAX` | `1.6` × | reached at 101 °C. A ceiling so a mistyped 150 cannot manufacture a dose nobody sat through. |
| `HEAT_CREDIT_MAX` | `3` | one fifth of the wearable's ±15. A prior should not out-vote a measurement even when the measurement is absent. |
| `HEAT_TAU_MIN` | `15` equiv min | saturating, so a 60-minute sitting is not twice a 30. |
| `HEAT_HALF_LIFE_H` | `18` h | last night's sauna is mostly spent by tonight. Same idiom as the fatigue engine's 2-day half-life. |
| `HEAT_WINDOW_H` | `48` h | beyond this it is a habit, not a statement about today — and habits are channel two. |
| `HEAT_SESSION_MIN_EQUIV` | `10` equiv min | a sitting only counts toward the weekly frequency once it clears this. Five minutes in a cool cabin is not a fourth session. |

Intensity, worked: 45 °C → 0.00, 55 → 0.29, 70 → 0.71, **80 → 1.00**, 90 → 1.29,
100 → 1.57, ≥101 → 1.60 (clamp).

**A worked morning.** 22 min at 90 °C ending 21:40, opened 07:10, no wearable
sync: intensity 1.286 → 28.3 equiv min → dose 2.545 → decay(9.5 h) 0.6936 →
**+2**. The same 22 minutes at 55 °C: 6.3 equiv min → dose 1.027 → **+1**. That
gap is the entire reason temperature is collected.

**What air temperature cannot see: humidity.** A steam room at 45 °C and 100%
humidity blocks evaporative cooling and produces real thermal strain, and this
model scores it zero; infrared is under-read for a related reason. Both are
honest limitations of reading one number, and neither is worth papering over
with an invented humidity term. If a traditional sauna is what the athlete uses,
air temperature is sufficient and this is the whole model. If not, the fix is a
protocol tag on the entry — not a fudge factor.

**The suppression rule is the load-bearing part.** When `toBiometrics()` returns
a fresh reading, `points` is 0 and `suppressed` is true. The card says so
outright ("your wearable measured this morning") rather than silently zeroing.
Because a large share of users have no wearable at all, and because
`BIOMETRIC_FRESH_DAYS` drops the term after 7 days, this still fires often.

*Alternative considered and rejected for v1:* blend the two by wearable
confidence rather than suppressing outright. Defensible, but it produces a
number nobody can explain in one sentence, and it makes the Engine Room's
substituted arithmetic much harder to read.

**No negative term in v1.** The overdose case (25 minutes at 90 °C, twenty
minutes after a threshold session) is real, but we cannot measure it — and the
wearable measures its consequence the next morning anyway. Putting an arc on the
readiness ring for a cost the engine is guessing at would violate the sum law's
spirit even while satisfying its arithmetic. It becomes guidance copy instead:
if a sauna is logged within 60 minutes of a session that scored high on strain,
the sheet says what the literature says. It does not dock points.

### Phase 3 — replace the prior with this athlete's own measurement

This is the one that makes the feature HYBRID-shaped rather than a generic habit
toggle.

`engines/recovery-pairs.ts` already measures each athlete's clearance rate from
paired reads, and already excludes contaminated pairs rigorously. Tag each
`RecoveryPair` with `heat: boolean` — true when a sauna signal falls between the
session end and the recovery read — and you can split the athlete's own pairs
two ways:

```
saunaClearance(sessions, recovery, signals)
  → { withHeat: RecoveryIndex, withoutHeat: RecoveryIndex, delta, confidence }
```

Requires `MIN_RECOVERY_PAIRS` (2) on **both** sides, so realistically 4–6 weeks
of use before it says anything. That is correct and matches the existing
posture: "the clearance estimate is allowed to be slow to arrive; it is not
allowed to be wrong."

Once it clears the confidence bar, `HEAT_CREDIT_MAX` stops being a literature
constant for that athlete and becomes their measured delta — the same
prior-corrected-by-observation move `landmark-adapt.ts` and `calibrateRisk()`
already make.

### Channel two (parallel, not phased) — the chronic MRV multiplier

`engines/landmark-profile.ts` is where "how much work can you absorb" lives, and
it already has the right shape: multipliers with a `LandmarkFactor` audit trail.

- `AthleteVolumeProfile.heat?: number` — sauna sessions per week, averaged over
  the last 4 weeks. **Derived from the signals, never asked** — the athlete has
  already told us by logging.
- `HEAT_RECOVERY`: `< 2/wk → 1.00`, `2–3/wk → 1.02`, `4+/wk → 1.04`.
- New `LandmarkFactor` key `"heat"`, `affects: "recovery"`.

Ceiling of 1.04 because this is the best-evidenced channel *and* the most
indirect: plasma volume expansion is well documented, its transfer to weekly-set
tolerance is an inference. `RECOVERY_BOUNDS` (`[0.55, 1.6]`) already contains it,
and the compounding guard means it cannot combine with anything into something
silly.

---

## 4. Impact on the admin Engine Room

Nine touch points. Items 3 and 6 are the ones easy to miss.

1. **`ENGINE_FORMULAS`** (`engines/engine-room.ts`) — two new entries,
   `readiness-heat` and `landmark-heat`, plus the existing `readiness`
   expression string changes. It interpolates the live constants, so it becomes
   `… − ENDURANCE_SLOPE × enduranceFatigue + bioAdj + heatAdj`.

2. **`ENGINE_SOURCES`** — the `readiness` row's `source` gains `engines/heat.ts`.

3. **`derivation.ts` → `deriveReadiness()`** — this is the console's *substituted
   arithmetic* surface, and it is where the suppression rule has to be visible or
   the whole design is unauditable. New steps: heat minutes in window, the dose
   curve evaluated, the decay factor with hours since, and then either the credit
   or an explicit "wearable read at 06:12 → heat prior suppressed, +0" line.

4. **`computeEngineTrace()`** — currently takes `(log, bio)`. It needs the sauna
   signals too (or a pre-resolved `Heat` object), which changes its signature and
   the admin route that calls it.

5. **`whatIfLog` / `whatIfBio`** — add `whatIfHeat`, so the simulator can answer
   "what does this athlete's model look like at 4 sessions/week". Same reason the
   other two live in core: the simulation should be tested math, not UI state.

6. **`readinessDeficit()` — no new cost kind, but a new *fact*.** A positive
   credit takes no arc, exactly as a positive `bioAdj` takes none: it shrinks the
   whole deficit rather than costing anything, which is the only reading under
   which the parts sum to 100. The sum law is untouched. But that is precisely
   why `readinessFacts()` exists — a positive wearable nudge would otherwise show
   nowhere on the card — so heat needs a `factHeat` line for the same reason.

7. **`performance-state.ts` / `performanceTrajectory()`** — bio is applied to the
   `daysAgo === 0` point only, because there is no stored wearable history to
   replay. Heat has the same constraint and takes the same rule, or the headline
   figure and the sparkline disagree again (the defect `performance-six-surfaces`
   was built to fix).

8. **`prescription.ts`** — readiness feeds prescribed load, so the credit
   propagates to the session prescription. Bounded at 3 points this is a nudge,
   not a jump, which is the intended blast radius.

9. **Both admin consoles.** The web `/admin` Engine Room panel
   (`apps/web/components/admin/engine-room.tsx`, readiness section) and the
   mobile admin console, per the two-sided admin rule.

---

## 5. How a user adds a sauna session

### Storage — two Signals per sitting, and no migration

A Signal carries exactly one number, and a sitting is two. That is already a
solved problem here: the food log writes up to eight Signals for one logged food
and reassembles them by grouping on **(exact timestamp, source)**, with a
composite id so deleting the entry removes every row it wrote
(`derivedFoodEntries()` in `engines/nutrition.ts`). Heat is the same shape with
two rows instead of eight.

```
{ kind: "sauna",     value: 22, unit: "min", source: "manual", ts: "2026-08-11T21:40:00Z" }
{ kind: "saunaTemp", value: 90, unit: "C",   source: "manual", ts: "2026-08-11T21:40:00Z" }
```

`heatSittings(signals)` regroups them on read, exactly like the diary does.

- `Signal.kind` is a **String** column, so **no Prisma migration and no SQL for
  the user to run** — which matters, because this sandbox cannot reach the
  database.
- `/api/signals` POST allow-lists from `SIGNAL_KINDS` in core, so adding
  `"sauna"` to the `SignalKind` union and the `META` table makes the endpoint
  accept it with no route change.
- `DELETE /api/signals/[id]` already exists, so a mis-tap is undoable.
- RLS is already correct: `signal_own` and `signal_coach_read` are kind-agnostic.
- `water` is the exact precedent, end to end — mobile already does
  `GET /api/signals?kind=water`, POST, and delete-by-id for hydration.

`META` entries: `sauna: { unit: "min", better: "high" }` and
`saunaTemp: { unit: "C", better: "high" }`.

A sitting with no temperature row still counts, at the reference — read as 80 °C
and **marked as assumed** rather than silently treated as measured, the same
distinction `BiometricMetric.measured` already draws. A temperature outside
`HEAT_TEMP_BOUNDS` (40–120 °C) is rejected at the API rather than clamped
quietly: 900 is a typo, and a typo should bounce rather than become 120.

Units: store canonical °C always, and derive the display unit from the weight
unit the athlete already set (lb → °F), the way `heightUnitFor()` already
derives inches against centimetres. No third preference to manage.

**One open question — protocol.** Air temperature fully describes a traditional
dry sauna. It systematically under-reads steam and infrared (see the humidity
note in §3). If those are in the athlete's mix, the entry needs a protocol tag,
and `source: "sauna:infrared"` carries it with no migration — that column
already holds varied values. If it is always a traditional sauna, air
temperature is sufficient and nothing more is needed. **Your call.**

### Why not the two obvious alternatives

- **Not a session block.** A `kind: "recovery"` block would make a 15-minute
  sauna count toward day streaks (`habits.ts` reads session dates), weekly hours,
  the feed, `sessionsOnDay()` — which collapses Train's prescribed-work hero to
  "done" — and would dose `fatigue.systems`. A sauna is not a workout and must
  not inflate any of it.
- **Not a check-in field.** `Checkin` is one row per day of 1–5 scales. A sauna
  is an event with a clock and a duration, and can happen twice in a day. The
  clock is not decoration here: phase 2's decay and phase 3's pair-matching both
  need it.

### Mobile surfaces (mobile only, per the mobile-first rule)

1. **Post-session Wrapped — the primary entry.** One row after the "how did that
   feel?" question: *Finished in the sauna?* → the sheet. Highest intent, and
   it is the only moment where the lag from session end is known exactly, which
   is what both the decay and the pair-matching want.

2. **Today, in the Recover cluster** — a heat row beside the check-in nudge and
   the `RtpPanel`. Opens the same sheet. Supports back-dating, because most
   saunas will not follow a session.

3. **The sheet** — both typed numbers, each with presets plus a keypad: minutes
   (10 / 15 / 30) and °C (70 / 90 / 100), time defaulting to now, and delete. It
   shows the resulting **equivalent minutes live**, so the model is visible at the
   point of entry and the athlete can see that hotter is worth more before
   anything scores it.

4. **Its own read surface** — once phase 3 has data, a small block showing the
   athlete's measured clearance with and without heat. This is the payoff, and
   it is worth designing for from the start even though it ships last.

House rules that bind this UI: `sheetPadBottom(insets.bottom)` on the sheet
panel with **no** trailing pad on anything inside it; no `·` in the meta line
(spaced en dash if a separator is unavoidable); no decorative dot before the
section head; and if a rail appears, `rail-tail.tsx` with a ringed arrow only if
it actually leaves. Copy in EN, PL and DE.

---

## 6. Prerequisite defect found while scoping this

Mobile's `fetchSignals()` calls `GET /api/signals` **with no kind filter**, and
that route returns `take: 500` newest across *all* kinds. Every logged food
writes up to **eight** Signal rows (`FOOD_KINDS` — four macros plus the label
panel). Five foods a day is 40 rows/day, so the 500-row window is roughly
**12 days** for a diligent nutrition logger — and hydration writes on top of
that.

`priorBaseline()` reads a `BIOMETRIC_BASELINE_WINDOW` of HRV/sleep readings out
of that same truncated stream. So a nutrition-logging athlete's readiness
baseline is already being computed from a window the food log is quietly
crowding out.

This is live today and independent of sauna, but a `sauna` kind would join the
same contested stream and inherit the same unreliability. Fix first: either
filter server-side by kind for the biometric read, or paginate per kind.
Tracked separately — see `capabilities.ts`.

---

## 7. Recommendation

Phase 1 plus channel two is the right first change: logging, storage, the two
mobile entry points, and the chronic MRV multiplier — which is the
best-evidenced effect, lands in an engine built for exactly this shape of input,
and cannot double-count the wearable because it operates on a different
timescale.

Hold the acute readiness credit until the Engine Room work in §4 lands with it,
and hold the constants until phase 3 can replace them with the athlete's own
measured delta. Fix §6 before either.
