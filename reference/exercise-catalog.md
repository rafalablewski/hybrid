# HYBRID — Exercise catalog (dedup source of truth)

Running, **deduplicated** master list of the custom exercise library (the rows
that seed the `Exercise` table — `reference/sql-exercise.sql`). The 9 built-in
movements in `packages/core/src/engines/movements.ts` stay in code; this file is
the CUSTOM catalog that merges over them.

**Why this file exists:** the library is assembled in batches. Every new batch is
checked against this list so the same lift never lands twice — neither under an
identical name, a slug collision (case/punctuation only), nor a second spelling
of the same movement. Slugs follow `slugify()` in
`apps/web/app/api/admin/exercises/shared.ts` (lowercase, non-alphanumerics → `-`),
and both `name` and `slug` are UNIQUE in the table.

Status: **215 names submitted across 2 batches → 0 exact/slug duplicates within
the batches.** Collisions were only against built-ins + a handful of same-lift
second spellings; all resolved below.

---

## Dedup ledger — collisions found & resolved

### Hard collisions with built-in movements (must not re-seed)
| Submitted | Collides with built-in | Resolution |
|---|---|---|
| `Push-up` | `Push-Up` (slug `push-up`, case-only) | **Drop** — already a built-in. Bodyweight push-up is covered in code. |
| `Goblet Squat` | `Goblet Squat` (exact) | **Drop** — already a built-in. |

### Same lift, two names (kept ONE canonical, other → alias)
| Kept (canonical) | Folded in as alias | Note |
|---|---|---|
| `Incline Cable Fly` | `Incline Cable Crossover` | Identical movement. |
| `Leg Press Calf Raise` | `Leg Press Calf Press` | Identical movement. |

### Flagged overlaps — RESOLVED
Three soft overlaps were flagged; decision: **keep `Weighted Dip`, drop the
other two.**
- `Weighted Dip` — **KEPT** (its own entry; distinct enough to stay).
- `Weighted Cable Crunch` — **DROPPED** (a cable crunch is loaded by nature → `Cable Crunch`).
- `Ab Roller Rollout` — **DROPPED** (generic; the two `Ab Wheel Rollout` specifics stay).

### Descriptive names that duplicate a generic built-in (RESOLVED + implemented)
The fuller names below are the SAME movement as an existing built-in engine key.
**Decision: keep the descriptive catalog name as canonical; the built-in key
becomes an alias** so both resolve to one movement (no second picker entry).
Aliases are applied on the entries in the catalog below.

**Implemented (option A):** aliases now RESOLVE without being PICKABLE. Core adds
`catalogNames(builtins, custom)` (pickable primary names, aliased/superseded names
removed) + `aliasNames(custom)`, while `mergeMovements` still keeps every alias
key so a prior logged session under a built-in name still attributes. Web's
`useExercises()` returns the pickable catalog + the alias set; `workout-blocks.tsx`
filters the picker buckets, datalist and BASE_CATALOG quick-picks through it. So
each of these shows once, under the descriptive name, and old `Bench Press` /
`Deadlift` logs still resolve. Mobile parity is tracked as `mobile-exercise-library`
(the mobile picker doesn't consume the custom library yet).
| Catalog name (canonical) | Built-in key → alias |
|---|---|
| `Barbell Bench Press` | `Bench Press` |
| `Barbell Back Squat` | `Back Squat` |
| `Barbell Front Squat` | `Front Squat` |
| `Barbell Deadlift` | `Deadlift` |
| `Standing Overhead Press` | `Overhead Press` |
| `Dumbbell Bench Press` | `DB Bench Press` |
| `Seated Dumbbell Press` | `DB Overhead Press` |
| `Dumbbell Romanian Deadlift` | `DB Romanian Deadlift` |
| `Dumbbell Single-Leg Romanian Deadlift` | `Single-Leg RDL` |

### Kept as DISTINCT (looked close, but are different lifts)
`Chest Dip` / `Triceps Dip` (lean) · `Triceps Dip` / `Weighted Triceps Dip`
(load) · `Face Pull` / `Cable Face Pull with External Rotation` (variant) ·
`One-Arm Dumbbell Row` / `Kroc Row` (heavy high-rep) · `Dumbbell Rear Delt Fly`
(standing) / `Seated Bent-Over Dumbbell Rear Delt Raise` (seated) ·
`Bulgarian Split Squat` / `Dumbbell` & `Smith Machine` variants ·
`Preacher Curl` / `EZ-Bar` · `Dumbbell` · `Single-Arm Cable` variants ·
`Standing Calf Raise` / `Standing Smith Machine Calf Raise` ·
`Romanian Deadlift` / `Stiff-Legged Barbell Deadlift`.

---

## Catalog (deduplicated)

### Chest
- Barbell Bench Press _(alias: Bench Press)_
- Incline Barbell Bench Press
- Decline Barbell Bench Press
- Dumbbell Bench Press _(alias: DB Bench Press)_
- Incline Dumbbell Bench Press
- Decline Dumbbell Bench Press
- Cable Crossover
- Incline Cable Fly _(alias: Incline Cable Crossover)_
- Dumbbell Flyes
- Decline Dumbbell Flyes
- Machine Chest Press
- Pec Deck Fly
- Chest Dip
- Incline Machine Press
- Decline Machine Press
- Cable Chest Press
- Hex Press
- Dumbbell Floor Press
- Landmine Chest Press
- Low-to-High Cable Fly
- Single-Arm Cable Fly
- Deficit Push-up
- Incline Push-up
- Decline Push-up
- Weighted Dip
- Svend Press
- _dropped:_ ~~Push-up~~ (built-in `Push-Up`)

### Back
- Barbell Deadlift _(alias: Deadlift)_
- Sumo Deadlift
- Romanian Deadlift
- Barbell Row
- One-Arm Dumbbell Row
- Seated Cable Row
- T-Bar Row
- Lat Pulldown
- Pull-up
- Chin-up
- Straight-Arm Pulldown
- Back Extension
- Deficit Barbell Deadlift
- Rack Pull
- Snatch-Grip Deadlift
- Meadows Row
- Pendlay Row
- Seal Row
- Incline Dumbbell Row
- Kroc Row
- Chest-Supported Machine Row
- Hammer Strength High Row
- Neutral Grip Lat Pulldown
- Underhand Lat Pulldown
- Single-Arm Cable Lat Pulldown
- V-Bar Pulldown
- Weighted Pull-up
- Rack Chins
- Inverted Row
- Kelso Row

### Shoulders (Delt Focus)
- Standing Overhead Press _(alias: Overhead Press)_
- Seated Barbell Shoulder Press
- Seated Dumbbell Press _(alias: DB Overhead Press)_
- Arnold Press
- Machine Shoulder Press
- Dumbbell Lateral Raise
- Cable Lateral Raise
- Front Plate Raise
- Dumbbell Front Raise
- Dumbbell Rear Delt Fly
- Barbell Rear Delt Row
- Face Pull
- Behind-the-Neck Overhead Press
- Dumbbell Scott Press
- Single-Arm Dumbbell Shoulder Press
- Dumbbell 6-Way Raise
- Behind-the-Back Cable Lateral Raise
- Incline Dumbbell Lateral Raise
- Chest-Supported Dumbbell Lateral Raise
- Machine Lateral Raise
- Dumbbell Lu Raise
- Cable Front Raise
- Incline Dumbbell Front Raise
- Seated Bent-Over Dumbbell Rear Delt Raise
- Incline Bench Rear Delt Fly
- Single-Arm Cable Rear Delt Fly
- Cable Face Pull with External Rotation

### Traps & Forearms
- Barbell Shrug
- Smith Machine Shrug
- Dumbbell Shrug
- Behind-the-Back Smith Machine Shrug
- Cable Shrug
- Kelso Shrug
- Farmer's Walk
- Barbell Wrist Curl
- Dumbbell Wrist Curl
- Reverse Barbell Wrist Curl
- Reverse Dumbbell Wrist Curl
- Plate Pinch
- Wrist Roller Rollup

### Quads & Glutes
- Barbell Back Squat _(alias: Back Squat)_
- Barbell Front Squat _(alias: Front Squat)_
- Hack Squat
- Leg Press
- Bulgarian Split Squat
- Barbell Walking Lunge
- Dumbbell Lunge
- Leg Extension
- Barbell Hip Thrust
- Barbell Glute Bridge
- Step-up
- Safety Bar Squat
- Zercher Squat
- Belt Squat
- Pendulum Squat
- Smith Machine Squat
- Heel-Elevated Goblet Squat
- Dumbbell Bulgarian Split Squat
- Smith Machine Bulgarian Split Squat
- Barbell Reverse Lunge
- Dumbbell Reverse Lunge
- Deficit Reverse Lunge
- Sissy Squat
- High Foot Placement Leg Press
- Low Foot Placement Leg Press
- Single-Arm Landmine Squat
- _dropped:_ ~~Goblet Squat~~ (built-in)

### Hamstrings & Glutes
- Stiff-Legged Barbell Deadlift
- Lying Leg Curl
- Seated Leg Curl
- Nordic Hamstring Curl
- Good Morning
- Deficit Romanian Deadlift
- Dumbbell Romanian Deadlift _(alias: DB Romanian Deadlift)_
- Dumbbell Single-Leg Romanian Deadlift _(alias: Single-Leg RDL)_
- Smith Machine Romanian Deadlift
- Glute-Ham Raise
- Machine Hip Thrust
- Smith Machine Hip Thrust
- Single-Leg Hip Thrust
- Cable Pull-Through
- Seated Machine Glute Kickback
- Cable Glute Kickback
- Cable Hip Abduction

### Calves
- Standing Calf Raise
- Seated Calf Raise
- Donkey Calf Raise
- Leg Press Calf Raise _(alias: Leg Press Calf Press)_
- Standing Smith Machine Calf Raise
- Single-Leg Dumbbell Calf Raise
- Deficit Calf Raise

### Biceps
- Barbell Curl
- EZ-Bar Curl
- Dumbbell Biceps Curl
- Incline Dumbbell Curl
- Hammer Curl
- Incline Hammer Curl
- Cross-Body Hammer Curl
- Preacher Curl
- Concentration Curl
- Cable Biceps Curl
- Overhead Cable Curl
- Barbell Spider Curl
- Dumbbell Spider Curl
- Dumbbell Zottman Curl
- Cable Behind-the-Back Curl
- Dumbbell Waiter Curl
- Barbell Drag Curl
- Dumbbell Drag Curl
- EZ-Bar Preacher Curl
- Dumbbell Preacher Curl
- Single-Arm Cable Preacher Curl
- Reverse Grip Barbell Curl
- Reverse Grip EZ-Bar Curl

### Triceps
- Close-Grip Bench Press
- EZ-Bar Skullcrusher
- Decline EZ-Bar Skullcrusher
- Triceps Dip
- Bench Dip
- Triceps Pushdown
- Reverse Grip Triceps Pushdown
- Overhead Dumbbell Triceps Extension
- Cable Overhead Triceps Extension
- Barbell Floor Press
- Weighted Triceps Dip
- Single-Arm Cable Triceps Pushdown
- Rope Triceps Pushdown
- V-Bar Triceps Pushdown
- Cable Katana Extension
- Dumbbell Kickback
- Cable Kickback
- JM Press
- Tate Press
- California Press
- Seated EZ-Bar Overhead Triceps Extension

### Abs & Core
- Cable Crunch
- Hanging Leg Raise
- Hanging Oblique Knee Raise
- Captain's Chair Leg Raise
- Decline Crunch
- Cross-Body Crunch
- Elbow Plank
- Decline Reverse Crunch
- Plate Twist
- Hanging Toes-to-Bar
- Dragon Flag
- RKC Plank
- From Knees Ab Wheel Rollout
- From Feet Ab Wheel Rollout
- Pallof Press
- Cable Woodchopper
- Hanging Knee Raise
- Weighted Russian Twist
- L-Sit
