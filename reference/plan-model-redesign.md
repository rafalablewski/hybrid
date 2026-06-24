# Plan model redesign — goal-shaped, flexible plans

## Why
The first plan library had **one shape** for every goal: a gym session of
`exercise · sets×reps · rest · RPE`, converted straight to strength blocks. That
fits Bodybuilding (a split really is just sets/reps/load) but is wrong for every
other goal. The Soviet 8-week Olympic-weightlifting program the user supplied
proves it — it needs things the old shape can't express:

- **% of 1RM loading** (not kg/RPE), ramping upward within each exercise, and
  **supramaximal** loads (back squat at 110% — squat % is off the *squat* max,
  not the snatch). So the **% reference lift is per-exercise**.
- **Complexes** — `4+1` = 4 cleans + 1 jerk per set.
- **Tempo** prescriptions — "eccentric back squat, down in 12 s".
- **NL (number of lifts)** as the volume metric — the Soviets program by lift
  count and intensity zones, not "sets to failure". (The forum's trailing
  `NN:NNN` counters are exactly this.)
- **AM/PM** double sessions in one day.
- **Day types** beyond training: Active Rest, Rest, Competition.
- **Undulating periodization peaking to a date** — intensity waves up to ~week
  4–7, then week 8 tapers into a Competition day.

Bodybuilding wants none of that; Running wants distance/pace/mileage and **no
gym at all**. So the model has to be **discipline-shaped**, not one schema.

## Design
A `PlanProgram` is tagged with a `discipline` that selects its structure,
loading units, volume metric and progression. Implemented first:
`strength-percent` (Olympic WL / Powerlifting). `hypertrophy`, `endurance`,
`conditioning` are typed for later.

```
PlanProgram
  discipline: "strength-percent" | "hypertrophy" | "endurance" | "conditioning"
  refLifts: [{ key, label }]      // the 1RMs the % are off (snatch, backSquat, …)
  anchor?: "competition"          // peaks toward the final day
  weeks: PlanWeek[]
    PlanWeek { index, days }
      PlanDay { index, kind: train|active-rest|rest|competition, sessions }
        PlanSession { label?: "AM"|"PM", lifts }
          PlanLift { name, ref?, steps: PercentStep[], complexWith?, tempo? }
            PercentStep { pct|null, reps, sets, plus? }   // (70%/3)3 → 70,3,3
```

### Loading is %-first (kept on purpose)
The prescription is the **percentage** — that is what's displayed. When the
athlete's 1RM for a lift's `ref` is known, the kg is derived on top
(`stepKg = round(pct/100 · oneRm)`) and shown alongside; with no max it just
shows the %. So the plan reads the way a weightlifting coach writes it, and
becomes concrete per athlete without re-authoring.

### Notation parser
Plan data is stored as the coach's shorthand string per lift
(`"(60%/3)2, (70%/3)3, (75%/2)3"`) and parsed by tested core code into
`PercentStep[]`. Keeping the source notation verbatim makes the data easy to
verify against the original and the structure a product of one parser, not
hundreds of hand-built objects. **NL is derived** (Σ (reps+plus)·sets), so the
Soviet lift-count volume falls out for free and is checked against the source's
own running totals in tests.

### Rendering (web ↔ mobile parity)
`planProgramView(program, { week, maxes })` returns a render-ready view model
(week selector, per-day/per-week NL, sessions, formatted prescriptions). All
four renderers (web classic/aurora, mobile classic/aurora) consume the SAME
view model, so the logic lives once in `@hybrid/core`.

## Consistency (the rule)
However differently a source plan is worded, it must come out in ONE identical
HYBRID layout. `planProgramView()` is that single render shape; all four
renderers consume it. What differs by discipline is data, not layout:
- **Inputs panel** — `program.inputs` with `kind` (`number` → strength maxes that
  derive kg; `text` → endurance goal paces), titled by `inputsTitle`.
- **Volume label** — discipline-aware string ("N lifts" for strength; none for
  endurance). When null the counter chip is simply absent; layout unchanged.
- **Peak label** — `program.peakLabel` ("Competition" / "Race day").
- **Day content** — a session carries `lifts` (% steps) OR `entries` (prose
  workouts); both compile to the same prescription/note rows.

## Status / follow-ups
- Built: the model, parser, NL, kg resolver, the generalized view model + the one
  shared program view on both clients. Two programs shipped:
  - **Soviet 8-week OWL** (`strength-percent`) on Olympic Weightlifting.
  - **Hansons 5K Beginner 9-week** (`endurance`) on Running — a Mon–Sun weekday
    grid of prose workouts, goal paces, race-day taper, NO gym. Proves the same
    model + UI carry a completely different plan format.
- Other goals stay empty until authored in their own shape: Bodybuilding
  (`hypertrophy`: sets×reps×load), more Cycling/Swim/Triathlon (`endurance`),
  Hyrox/CrossFit/Fat-Loss (`conditioning`). Tracked under `plans-lib`.
- "Today"/enroll wiring: enrolling a percent-program still falls back to the
  engine's prescription for the daily card (legacy `planToday` reads the old
  `PLAN_DETAIL`). Wiring percent-programs into `planToday`/macrocycles is the
  next step (tracked as `plan-program-today`).
