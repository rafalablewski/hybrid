import { gymExercise, type GymEquipment } from "./exercise-db";
import { sportMarkPaths } from "./theme/sport-marks";

// ─────────────────────────────────────────────────────────────────────────────
// EXERCISE MARKS — the glyph a lift signs itself with in a 40px tile.
//
// The tile used to hold the lift's INITIALS, which was the worst of both
// worlds: it repeated what the row already says, in a form that reads as noise
// ("Cable Chest Press" and "Cable Crossover" both became CC; "Decline Barbell
// Bench Press" and "Decline Bench Press" both became DB), and it told the
// athlete nothing the name didn't.
//
// A mark should carry what the NAME DOESN'T — and inside a muscle group, where
// most picking happens, the name already says the movement. What varies is the
// GEAR: scanning the Chest room, an athlete is asking "what can I do with a
// barbell / with the cables / with my bodyweight". So the mark is the
// implement, and a column of them is instantly sortable by eye.
//
// THE MARK NAMES THE KIND, NOT THE INSTANCE — the same rule sport-marks.ts
// follows. A Smith bar, an EZ bar, a trap bar and a landmine are all "a barbell"
// at 24px; drawing four near-identical bars would be four things to keep in step
// for no gain. Two lifts on the same gear SHOULD look the same: that's a fact
// about the pair, not a collision like CC/CC was.
//
// Shape data only — no React, no platform APIs. Stroke paths in the same
// 72-unit box as theme/icons.ts, so a mark sits at the icon set's own optical
// weight wherever it is drawn. Renderer:
// apps/mobile/components/aurora/exercise-mark.tsx.
//
// NOTE on arcs: every closed circle here is drawn as TWO half-arcs. A single arc
// that returns to its own start point is degenerate and silently renders as
// nothing (the mistake sport-marks.ts documents).
// ─────────────────────────────────────────────────────────────────────────────

/** The drawn marks. Keep this list small — one per KIND of implement. */
export type ExerciseMarkName =
  | "barbell"
  | "dumbbell"
  | "kettlebell"
  | "cable"
  | "machine"
  | "bodyweight"
  | "band"
  | "sled"
  | "medball"
  | "custom";

/**
 * Stroke paths in a 72×72 box, drawn with round caps and joins — the same
 * contract as AURORA_ICON_PATHS and SPORT_MARK_PATHS.
 */
export const EXERCISE_MARK_PATHS: Record<ExerciseMarkName, string[]> = {
  // A loaded barbell: the shaft, and a plate pair at each sleeve.
  barbell: [
    "M18 36H54",
    "M23 25V47M13 30V42",
    "M49 25V47M59 30V42",
  ],
  // A dumbbell: a short handle with a round bell at each end.
  dumbbell: [
    "M29 36H43",
    "M11 36A9 9 0 1 0 29 36A9 9 0 1 0 11 36Z",
    "M43 36A9 9 0 1 0 61 36A9 9 0 1 0 43 36Z",
  ],
  // A kettlebell: the bell under a handle nearly as wide as it. A narrower
  // handle reads as a padlock; the width is what makes it a bell.
  kettlebell: [
    "M25 35V30A11 11 0 0 1 47 30V35",
    "M25 35C20 40 17 45 17 50A19 19 0 0 0 55 50C55 45 52 40 47 35Z",
  ],
  // A cable: the run of cable from its anchor down to the D-handle. (A pulley
  // wheel drawn up top reads as a head on a body at tile size — the handle is
  // the distinctive part anyway.)
  cable: [
    "M30 12H42",
    "M36 12V36",
    "M24 36H48M26 36C26 52 46 52 46 36",
  ],
  // A selectorized machine: the guide rods and the weight stack between them.
  machine: [
    "M19 13V59",
    "M53 13V59",
    "M27 26H45M27 37H45M27 48H45",
  ],
  // Bodyweight: you. Head, spine, arms, legs.
  bodyweight: [
    "M29 15A7 7 0 1 0 43 15A7 7 0 1 0 29 15Z",
    "M36 22V43",
    "M19 30H53",
    "M36 43L25 60M36 43L47 60",
  ],
  // A resistance band: the elastic under tension, anchored at both ends.
  band: [
    "M16 36C23 22 30 22 36 36S49 50 56 36",
    "M13 28V44",
    "M59 28V44",
  ],
  // A sled: the bed rail, the raked drive post braced against it, and the
  // cross handle you push.
  sled: [
    "M12 55H60",
    "M46 55V26",
    "M46 34L22 55",
    "M36 26H56",
  ],
  // A medicine ball: the sphere and its two seams.
  medball: [
    "M13 36A23 23 0 1 0 59 36A23 23 0 1 0 13 36Z",
    "M20 23C30 31 42 31 52 23",
    "M20 49C30 41 42 41 52 49",
  ],
  // A lift we hold no gear for — a custom name the database doesn't know.
  // Deliberately abstract: an honest "unspecified", not a guessed implement.
  custom: [
    "M36 18V54",
    "M20 27L52 45",
    "M52 27L20 45",
  ],
};

/** Which mark stands for a piece of gear. Families collapse to one drawing:
 *  a Smith/EZ/trap/landmine bar is "a barbell" at tile size. */
const MARK_OF: Record<GymEquipment, ExerciseMarkName> = {
  barbell: "barbell",
  smith: "barbell",
  "ez-bar": "barbell",
  "trap-bar": "barbell",
  landmine: "barbell",
  dumbbell: "dumbbell",
  kettlebell: "kettlebell",
  cable: "cable",
  machine: "machine",
  bodyweight: "bodyweight",
  band: "band",
  sled: "sled",
  medball: "medball",
  other: "custom",
};

/**
 * The mark for a gym lift, or null when the exercise database doesn't know the
 * name — a hand-typed lift has no gear to draw, and the caller falls back
 * rather than to a mark that would be a guess.
 */
export function exerciseMark(name: string): ExerciseMarkName | null {
  const e = gymExercise(name);
  return e ? MARK_OF[e.equipment] : null;
}

/**
 * The paths for anything an athlete can log, ready to stroke — ALWAYS non-empty
 * so a tile can't render blank. A gym lift draws its implement; a catalog sport
 * reuses the sport mark it already signs its own page with; anything else gets
 * the neutral custom mark.
 */
export function exerciseMarkPaths(name: string): string[] {
  const mark = exerciseMark(name);
  if (mark) return EXERCISE_MARK_PATHS[mark];
  const sport = sportMarkPaths(name);
  return sport.length > 0 ? sport : EXERCISE_MARK_PATHS.custom;
}
