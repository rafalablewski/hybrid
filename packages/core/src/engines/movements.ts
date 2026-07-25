import type { MuscleGroup, Movement } from "./types";
import { GYM_MOVEMENTS, GYM_CATEGORY_BY_NAME, GYM_ALIASES, GYM_LIBRARY_ALIASES } from "../exercise-db";

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

/** Muscle groups + energy systems each movement touches. The full exercise
 *  DATABASE (exercise-db.ts — every gym exercise with its own property sheet)
 *  derives an engine Movement per entry and folds in FIRST; the hand-tuned
 *  entries below OVERRIDE their DB twins so long-standing engine behaviour
 *  (baseLoads the prescription engine anchors on) is unchanged. */
export const MOVEMENTS: Record<string, Movement> = {
  ...GYM_MOVEMENTS,
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

// ---- Name resolution ---------------------------------------------------------
// A logged block stores the exercise NAME the athlete saw, and the DB-backed
// exercise library names lifts differently from the built-in catalog ("Barbell
// Deadlift" vs "Deadlift", "Pull-up" vs "Pull-Up"). Every muscle-attribution
// engine used to index MOVEMENTS by exact key and silently `continue` on a miss,
// so a lift picked from the library added NOTHING to fatigue, ACWR, injury risk,
// volume-by-muscle, landmarks or muscle records — the tissue simply read as
// untrained. `movementFor` is the one resolver they all share now.

/** The active catalog the engines resolve names against — the built-ins, with
 *  the admin-managed exercise library folded over them once a client/server has
 *  loaded it (see `setExerciseCatalog`). */
let CATALOG: Record<string, Movement> = MOVEMENTS;
/** lowercased key → catalog key, rebuilt whenever CATALOG changes. */
let CATALOG_LOWER: Map<string, string> = lowerIndex(MOVEMENTS);

function lowerIndex(movements: Record<string, Movement>): Map<string, string> {
  const out = new Map<string, string>();
  // First key wins, so an exact-case entry is never shadowed by a later variant.
  for (const k of Object.keys(movements)) if (!out.has(k.toLowerCase())) out.set(k.toLowerCase(), k);
  return out;
}

/**
 * Publish the admin-managed exercise library to the engines. The catalog is
 * GLOBAL, admin-authored data (identical for every athlete), not per-request
 * state, so a module-level registry is safe on both clients AND in a server
 * route — and it keeps every engine signature unchanged. Call it wherever the
 * library is already fetched; call `resetExerciseCatalog` to go back to the
 * built-ins alone (tests, sign-out, a failed fetch).
 */
export function setExerciseCatalog(custom: LibraryMovement[] | null | undefined): void {
  CATALOG = custom && custom.length ? mergeMovements(MOVEMENTS, custom) : MOVEMENTS;
  CATALOG_LOWER = lowerIndex(CATALOG);
}

/** Drop back to the built-in catalog. */
export function resetExerciseCatalog(): void {
  CATALOG = MOVEMENTS;
  CATALOG_LOWER = lowerIndex(MOVEMENTS);
}

/** The catalog the engines currently resolve against (read-only view). */
export function exerciseCatalog(): Record<string, Movement> {
  return CATALOG;
}

/**
 * Resolve a logged exercise NAME to its engine Movement — the single lookup every
 * muscle-attribution engine uses. Tries, in order: the exact key, the trimmed
 * key, the built-in rename breadcrumbs (GYM_ALIASES), the shipped library's
 * equipment-qualified display names (GYM_LIBRARY_ALIASES — "Barbell Deadlift" →
 * "Deadlift"), then a case-insensitive match ("Pull-up" → "Pull-Up"). Returns
 * undefined for a genuinely unknown name. Mirrors `gymExercise`'s resolution
 * order so the property sheet and the engines can never disagree about whether a
 * lift is known. Pass `movements` to resolve against an explicit map instead of
 * the registry (pure call sites, tests).
 */
export function movementFor(name: string, movements?: Record<string, Movement>): Movement | undefined {
  if (!name) return undefined;
  const map = movements ?? CATALOG;
  const direct = map[name];
  if (direct) return direct;
  const trimmed = name.trim();
  if (trimmed !== name && map[trimmed]) return map[trimmed];
  const renamed = GYM_ALIASES[trimmed] ?? GYM_LIBRARY_ALIASES[trimmed];
  if (renamed && map[renamed]) return map[renamed];
  const lower = movements ? lowerIndex(movements) : CATALOG_LOWER;
  const key = lower.get(trimmed.toLowerCase());
  return key ? map[key] : undefined;
}

/** The engine muscle groups a logged exercise attributes to — [] when the name
 *  doesn't resolve. The shape every volume/fatigue caller wants. */
export function musclesFor(name: string, movements?: Record<string, Movement>): MuscleGroup[] {
  return movementFor(name, movements)?.muscles ?? [];
}

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

/** Display order for the muscle-group `category` sections — the built-in
 *  exercise DB's headings plus the admin library's. Unknown categories sort
 *  A–Z after these. */
export const LIBRARY_CATEGORY_ORDER = [
  "Chest",
  "Back",
  "Shoulders",
  "Traps & Forearms",
  "Quads & Glutes",
  "Hamstrings & Glutes",
  "Calves",
  "Biceps",
  "Triceps",
  "Abs & Core",
  "Olympic & Power",
  "Carries & Conditioning",
];

/** A picker section. Pattern buckets carry an i18n `labelKey`; admin-library
 *  muscle-group sections carry a raw `label` (the category text). */
export interface ExerciseSection {
  category: string;
  labelKey?: string;
  label?: string;
  names: string[];
}

/**
 * Group an exercise catalog into sections for the picker. An exercise that has a
 * library `category` (via `categoryByName`) is grouped under that muscle-group
 * heading (Chest, Back, …); everything else is bucketed by movement pattern
 * (Squat/Hinge/Push/Pull/Conditioning, free-typed → Other). Names sorted A–Z
 * within a section; empty sections dropped. Pattern buckets come first in their
 * fixed order, then library categories in LIBRARY_CATEGORY_ORDER (unknown A–Z).
 * Pure — mirrors olympicSportsByCategory.
 */
export function exercisesByCategory(
  movements: Record<string, Movement>,
  extraNames: string[] = [],
  categoryByName: Record<string, string> = {},
): ExerciseSection[] {
  // Every built-in DB exercise carries its muscle-group heading; the admin
  // library's categories layer on top (and can override).
  const catByName: Record<string, string> = { ...GYM_CATEGORY_BY_NAME, ...categoryByName };
  const patternBuckets = new Map<ExerciseCategory, Set<string>>();
  const libBuckets = new Map<string, Set<string>>();
  const place = (name: string, pattern?: string) => {
    const lib = catByName[name]?.trim();
    if (lib) {
      if (!libBuckets.has(lib)) libBuckets.set(lib, new Set());
      libBuckets.get(lib)!.add(name);
    } else {
      const cat = pattern ? PATTERN_TO_CATEGORY(pattern) : "other";
      if (!patternBuckets.has(cat)) patternBuckets.set(cat, new Set());
      patternBuckets.get(cat)!.add(name);
    }
  };
  for (const [name, m] of Object.entries(movements)) place(name, m.pattern);
  for (const name of extraNames) if (!(name in movements)) place(name);

  const sortNames = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b));
  const out: ExerciseSection[] = [];
  for (const category of EXERCISE_CATEGORY_ORDER) {
    const set = patternBuckets.get(category);
    if (set && set.size) out.push({ category, labelKey: EXERCISE_CATEGORY_LABEL[category], names: sortNames(set) });
  }
  const rank = (c: string) => {
    const i = LIBRARY_CATEGORY_ORDER.indexOf(c);
    return i === -1 ? LIBRARY_CATEGORY_ORDER.length : i;
  };
  const libKeys = [...libBuckets.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  for (const key of libKeys) out.push({ category: key, label: key, names: sortNames(libBuckets.get(key)!) });
  return out;
}

/** A movement that carries its own display name + alternate names — the shape
 *  the admin-managed exercise library yields (Exercise rows, minus the CMS-only
 *  content). Kept here so core stays free of any DB/Prisma dependency. */
export interface LibraryMovement extends Movement {
  name: string;
  aliases?: string[];
  /** Admin library muscle-group heading (e.g. "Chest") — picker grouping only. */
  category?: string | null;
}

/** The set of names that a custom entry claims as an alias — i.e. names that are
 *  the SAME movement as some primary entry. These still RESOLVE in
 *  `mergeMovements` (so an old logged session under an alias still attributes to
 *  the engine) but must NOT surface as their own pickable entry, or the picker
 *  shows the same lift twice (e.g. built-in "Bench Press" AND a custom
 *  "Barbell Bench Press" that aliases it). Callers hide these from the catalog. */
export function aliasNames(custom: LibraryMovement[] = []): Set<string> {
  const out = new Set<string>();
  for (const ex of custom ?? []) for (const a of ex?.aliases ?? []) out.add(a);
  return out;
}

/** The PICKABLE exercise names — the catalog the picker/datalist renders. It is
 *  the resolution map's keys MINUS every alias: built-in keys + each custom
 *  entry's primary name, with any name that a custom entry aliases removed. So a
 *  custom "Barbell Bench Press" aliasing "Bench Press" hides the built-in
 *  "Bench Press" from the picker while `mergeMovements` keeps it resolvable.
 *  Pure — mirrors `mergeMovements`, but for display rather than resolution. */
export function catalogNames(
  builtins: Record<string, Movement> = {},
  custom: LibraryMovement[] = [],
): string[] {
  const aliased = aliasNames(custom);
  const names = new Set<string>();
  for (const n of Object.keys(builtins ?? {})) if (!aliased.has(n)) names.add(n);
  for (const ex of custom ?? []) if (ex && !aliased.has(ex.name)) names.add(ex.name);
  return [...names];
}

/** Build the DISPLAY-name alias map: a stored/old exercise name → its CURRENT
 *  canonical name. It merges the built-in rename breadcrumbs (`GYM_ALIASES`) with
 *  the admin library's aliases (each custom entry's alias → that entry's primary
 *  name). Feed it to `canonicalExerciseName` to rewrite a logged block name so a
 *  rename or alias propagates to EVERY summary, history row and analytics view —
 *  not just engine attribution (which `mergeMovements` already resolves). Custom
 *  aliases win over built-in ones (an admin can re-point a name). Pure. Accepts
 *  anything carrying `name` + `aliases` (a full LibraryMovement or a trimmed
 *  server row), so the client hook and the API can share one builder. */
export function exerciseNameAliasMap(
  custom: ReadonlyArray<{ name: string; aliases?: string[] | null }> = [],
): Record<string, string> {
  const out: Record<string, string> = { ...GYM_ALIASES };
  for (const ex of custom ?? []) {
    if (!ex?.name) continue;
    for (const a of ex.aliases ?? []) if (a && a !== ex.name) out[a] = ex.name;
  }
  return out;
}

/** Resolve one stored exercise name to its canonical display name through an
 *  alias map (from `exerciseNameAliasMap`). Follows a rename CHAIN (A→B→C) so a
 *  lift renamed twice still lands on the latest name, guarding against self-loops
 *  and cycles; an unknown name passes through unchanged. Pure. */
export function canonicalExerciseName(name: string, aliasMap: Record<string, string> = {}): string {
  let cur = name;
  const seen = new Set<string>([name]);
  for (let i = 0; i < 8; i++) {
    const next = aliasMap[cur] ?? aliasMap[cur.trim()];
    if (!next || next === cur || seen.has(next)) break;
    seen.add(next);
    cur = next;
  }
  return cur;
}

/** name → library `category` for the custom entries that declare one, for the
 *  picker's muscle-group grouping (pass to `exercisesByCategory`). */
export function categoriesByName(custom: LibraryMovement[] = []): Record<string, string> {
  const out: Record<string, string> = {};
  for (const ex of custom ?? []) if (ex && ex.category) out[ex.name] = ex.category;
  return out;
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
