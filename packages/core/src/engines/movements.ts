import type { MuscleGroup, Movement } from "./types";

/** All trackable muscle groups, in display order. */
export const ALL_MUSCLES: MuscleGroup[] = [
  "quads",
  "glutes",
  "posterior",
  "back",
  "chest",
  "shoulders",
  "triceps",
];

/** Muscle groups + energy systems each movement touches. Ported from the
 *  prototype's MOVEMENTS map — the engine reads this to attribute fatigue. */
export const MOVEMENTS: Record<string, Movement> = {
  "Back Squat": { pattern: "squat", muscles: ["quads", "glutes", "back"], baseLoad: 100, system: null },
  "Front Squat": { pattern: "squat", muscles: ["quads", "glutes"], baseLoad: 85, system: null },
  Deadlift: { pattern: "hinge", muscles: ["posterior", "back", "glutes"], baseLoad: 140, system: null },
  "Bench Press": { pattern: "push", muscles: ["chest", "triceps", "shoulders"], baseLoad: 100, system: null },
  "Overhead Press": { pattern: "push", muscles: ["shoulders", "triceps"], baseLoad: 60, system: null },
  // Dumbbell variants — same patterns for a home gym (lighter base loads).
  "Goblet Squat": { pattern: "squat", muscles: ["quads", "glutes"], baseLoad: 40, system: null },
  "DB Romanian Deadlift": { pattern: "hinge", muscles: ["posterior", "glutes", "back"], baseLoad: 30, system: null },
  "DB Bench Press": { pattern: "push", muscles: ["chest", "triceps", "shoulders"], baseLoad: 30, system: null },
  "DB Overhead Press": { pattern: "push", muscles: ["shoulders", "triceps"], baseLoad: 20, system: null },
  // Bodyweight variants — same patterns with no equipment (rep-driven).
  "Bodyweight Squat": { pattern: "squat", muscles: ["quads", "glutes"], baseLoad: null, system: null },
  "Single-Leg RDL": { pattern: "hinge", muscles: ["posterior", "glutes"], baseLoad: null, system: null },
  "Push-Up": { pattern: "push", muscles: ["chest", "triceps", "shoulders"], baseLoad: null, system: null },
  "Pike Push-Up": { pattern: "push", muscles: ["shoulders", "triceps"], baseLoad: null, system: null },
  "Row Intervals": { pattern: "cond", muscles: ["posterior", "quads"], baseLoad: null, system: "threshold" },
  "Assault Bike": { pattern: "cond", muscles: ["quads", "shoulders"], baseLoad: null, system: "anaerobic" },
  "Easy Run": { pattern: "cond", muscles: ["quads"], baseLoad: null, system: "aerobic" },
  "Mixed Metcon": { pattern: "cond", muscles: ["posterior", "shoulders"], baseLoad: null, system: "anaerobic" },
};

/** The exercise picker's category buckets, by movement pattern (+ a catch-all
 *  for free-typed / library lifts with no pattern data). Mirrors the sport
 *  picker's category grouping so both pickers read the same way. */
export type ExerciseCategory = "squat" | "hinge" | "push" | "pull" | "cond" | "other";

// Fixed display order + the i18n key for each bucket's header.
const EXERCISE_CATEGORY_ORDER: ExerciseCategory[] = ["squat", "hinge", "push", "pull", "cond", "other"];
export const EXERCISE_CATEGORY_LABEL: Record<ExerciseCategory, string> = {
  squat: "exercise.cat.squat",
  hinge: "exercise.cat.hinge",
  push: "exercise.cat.push",
  pull: "exercise.cat.pull",
  cond: "exercise.cat.cond",
  other: "exercise.cat.other",
};

const PATTERN_TO_CATEGORY = (pattern: string): ExerciseCategory =>
  pattern === "squat" || pattern === "hinge" || pattern === "push" || pattern === "pull" || pattern === "cond"
    ? pattern
    : "other";

/**
 * Group an exercise catalog into muscle/pattern buckets for the picker. Names
 * present in `movements` are bucketed by their movement pattern; everything else
 * (free-typed lifts, library entries without pattern data, plus any `extraNames`)
 * falls into "other". Names sorted A–Z within a bucket; empty buckets dropped;
 * buckets returned in a fixed display order. Pure — mirrors olympicSportsByCategory.
 */
export function exercisesByCategory(
  movements: Record<string, Movement>,
  extraNames: string[] = [],
): { category: ExerciseCategory; labelKey: string; names: string[] }[] {
  const buckets = new Map<ExerciseCategory, Set<string>>();
  const add = (name: string, cat: ExerciseCategory) => {
    if (!buckets.has(cat)) buckets.set(cat, new Set());
    buckets.get(cat)!.add(name);
  };
  for (const [name, m] of Object.entries(movements)) add(name, PATTERN_TO_CATEGORY(m.pattern));
  for (const name of extraNames) if (!(name in movements)) add(name, "other");
  return EXERCISE_CATEGORY_ORDER.flatMap((category) => {
    const set = buckets.get(category);
    if (!set || set.size === 0) return [];
    return [{ category, labelKey: EXERCISE_CATEGORY_LABEL[category], names: [...set].sort((a, b) => a.localeCompare(b)) }];
  });
}

/** A movement that carries its own display name + alternate names — the shape
 *  the admin-managed exercise library yields (Exercise rows, minus the CMS-only
 *  content). Kept here so core stays free of any DB/Prisma dependency. */
export interface LibraryMovement extends Movement {
  name: string;
  aliases?: string[];
}

/** Fold the admin-authored exercise library over the built-in MOVEMENTS into one
 *  `Record<string, Movement>` the (pure) engines and pickers consume unchanged.
 *
 *  - a custom exercise OVERRIDES a built-in of the same name;
 *  - each alias resolves to the same Movement, so renamed/free-typed lifts still
 *    map — but an alias NEVER clobbers a real (built-in or named) entry.
 *
 *  Built-ins remain the source of truth in code, so the catalog still works with
 *  an empty DB and a DB outage degrades gracefully instead of emptying it. */
export function mergeMovements(
  builtins: Record<string, Movement>,
  custom: LibraryMovement[],
): Record<string, Movement> {
  const out: Record<string, Movement> = { ...builtins };
  for (const ex of custom) {
    const m: Movement = { pattern: ex.pattern, muscles: ex.muscles, baseLoad: ex.baseLoad, system: ex.system };
    out[ex.name] = m;
    for (const alias of ex.aliases ?? []) {
      if (!(alias in out)) out[alias] = m;
    }
  }
  return out;
}
