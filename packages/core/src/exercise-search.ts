import {
  gymExercise,
  GYM_ALIASES,
  GYM_LIBRARY_ALIASES,
  type GymEquipment,
  type GymPattern,
} from "./exercise-db";
import { olympicSport } from "./olympic-sports";
import {
  normalizeSearchText,
  rankEntries,
  searchEntry,
  type RankedEntry,
  type RankedSearchOptions,
  type SearchMatchTier,
} from "./ranked-search";

// ────────────────────────────────────────────────────────────────────────────────
// EXERCISE SEARCH — the ranked lookup behind every "add an exercise" field.
//
// The SCORING lives in ranked-search.ts, which every search field in the app now
// shares. This file is the exercise ADAPTER: it decides what a movement answers
// to (its name, its gym nicknames, its rename breadcrumbs), what it IS (the
// muscles it trains, its gear, its group) and how canonical it is among its
// peers. Nothing here knows how a band is weighted, and nothing there knows what
// a deadlift is.
//
// What this replaced: `catalog.filter(n => n.toLowerCase().includes(q))`. That is
// one line and it is wrong in four separate ways, all of which an athlete meets
// within the first three seconds of adding a lift:
//
//  1. NO RANK — the order was alphabetical-within-section, i.e. an accident.
//     "curl" put Barbell Curl SEVENTH, behind Reverse Curl, Reverse Wrist Curl,
//     Wrist Curl, Lying Leg Curl and Nordic Curl. "press" put Overhead Press
//     TWENTIETH of 29. Where the right lift did come first ("deadlift",
//     "squat") it was luck of the alphabet, not relevance. The lift the query
//     names must be the first row, every time — and the other ten deadlifts
//     have to be ordered too, or the list is just as hard to read.
//  2. ONE CONTIGUOUS STRING. "bench db" found nothing (order mattered);
//     "dumbbell bench" found only Incline Dumbbell Bench Press and missed
//     DB Bench Press (the catalog spells the implement both ways); "trap bar"
//     missed Trap-Bar Deadlift, on a hyphen. Tokens must match independently,
//     in any order, through punctuation.
//  3. NO VOCABULARY. "rdl", "ohp", "bp", "t2b", "military press", "pullups",
//     "bent over row", "hamstrings" — every one of them returned NOTHING, or
//     (worse) the wrong lift: "rdl" found only Single-Leg RDL and never the
//     Romanian Deadlift it stands for. They are also what people actually type.
//  4. NO SLACK. One transposed letter ("deadlfit") produced an empty list and an
//     offer to create a custom exercise called "deadlfit" — a dead end that
//     silently pollutes the log with a junk movement name.
//
// Build the INDEX once per catalog (memoize it — it only changes when the admin
// library loads), then rank on every keystroke. 300-odd entries is microseconds,
// so there is no debounce here and none is wanted: the list must move with the
// finger.
// ────────────────────────────────────────────────────────────────────────────────

/** How a hit matched — the shared vocabulary, re-exported for callers. */
export type ExerciseMatchTier = SearchMatchTier;

/** Lower-case, accents folded, punctuation → spaces. */
export const normalizeExerciseText = normalizeSearchText;

export interface ExerciseHit {
  /** The catalog name, exactly as it should be displayed and stored. */
  name: string;
  tier: ExerciseMatchTier;
  score: number;
}

/** One catalog entry, pre-normalized. Build with `buildExerciseIndex`. */
export type ExerciseIndexEntry = RankedEntry<string>;

/**
 * `uses` is the athlete's own logging history: name → times logged. A lift you
 * actually train outranks one you have never touched, which is the single
 * strongest relevance signal any of this has — and it is free.
 */
export type ExerciseSearchOptions = RankedSearchOptions;

/**
 * The names athletes type that are not spellings of the movement's name at all.
 * Gym shorthand ("rdl") and the other real name for the same lift ("military
 * press"). Keys must be catalog names — `exerciseSearchNicknameGaps()` proves
 * that in a test, so a rename can never leave a nickname pointing at nothing.
 */
export const EXERCISE_NICKNAMES: Record<string, string[]> = {
  Deadlift: ["dl", "conventional deadlift", "deads"],
  "Romanian Deadlift": ["rdl", "romanians"],
  "DB Romanian Deadlift": ["db rdl", "dumbbell rdl"],
  "Stiff-Leg Deadlift": ["sldl", "straight leg deadlift"],
  "Sumo Deadlift": ["sumo dl"],
  "Trap-Bar Deadlift": ["hex bar deadlift", "tbdl"],
  "Snatch-Grip Deadlift": ["sgdl"],
  "Single-Leg RDL": ["sl rdl", "single leg romanian deadlift"],
  "Back Squat": ["squat", "bs", "barbell squat", "high bar", "low bar"],
  "Front Squat": ["fs"],
  "Bulgarian Split Squat": ["bss", "rear foot elevated split squat", "rfess"],
  "Bench Press": ["bp", "flat bench", "barbell bench", "chest press"],
  "Close-Grip Bench Press": ["cgbp"],
  "Incline Dumbbell Bench Press": ["incline db bench"],
  "Overhead Press": ["ohp", "military press", "strict press", "standing press", "shoulder press"],
  "Push Press": ["pp"],
  "Barbell Row": ["bor", "bent over row", "bent-over row", "pendlay"],
  "Lat Pulldown": ["pulldown", "lat pull down"],
  "Pull-Up": ["pullup", "pull ups", "pullups"],
  "Chin-Up": ["chinup", "chin ups", "chinups"],
  "Push-Up": ["pushup", "push ups", "pushups"],
  "Handstand Push-Up": ["hspu"],
  "Muscle-Up": ["mu"],
  "Good Morning": ["gm"],
  "Glute-Ham Raise": ["ghr", "ghd raise"],
  "Toes-to-Bar": ["t2b", "ttb", "toes to bar"],
  "Hip Thrust": ["barbell hip thrust", "glute thrust"],
  "Skull Crusher": ["lying triceps extension", "french press"],
  "Triceps Pushdown": ["tricep pushdown", "cable pushdown"],
  "Barbell Curl": ["bicep curl", "biceps curl"],
  "Lateral Raise": ["side raise", "lat raise", "side delt raise"],
  "Rear Delt Fly": ["reverse fly", "rear delt raise"],
  "Clean & Jerk": ["c&j", "cj", "clean and jerk"],
  "Power Clean": ["pc"],
  "Power Snatch": ["ps"],
  "KB Swing": ["kettlebell swing", "russian swing", "swings"],
  "Turkish Get-Up": ["tgu", "get up"],
  "Ab Wheel Rollout": ["ab roller", "ab wheel"],
  "Hanging Leg Raise": ["hlr", "leg raises"],
  "Assault Bike": ["airbike", "air bike", "echo bike", "bike erg"],
  "Farmer Carry": ["farmers walk", "farmer walk", "farmers carry"],
  "Cable Row": ["seated row", "seated cable row"],
  "Machine Chest Press": ["chest press machine"],
  "Leg Press": ["lp"],
  "Lying Leg Curl": ["leg curl", "hamstring curl"],
  "Leg Extension": ["quad extension", "leg extensions"],
  "Standing Calf Raise": ["calf raise", "calves"],
  "Jump Rope": ["skipping", "skip rope"],
};

const NICKNAMES_BY_NAME: Record<string, string[]> = EXERCISE_NICKNAMES;

/** Nicknames whose key is not a catalog name — must be empty. Test hook. */
export function exerciseSearchNicknameGaps(catalog: readonly string[]): string[] {
  const known = new Set(catalog);
  return Object.keys(EXERCISE_NICKNAMES).filter((n) => !known.has(n));
}

/**
 * Every ALIAS is also a name this lift answers to. The rename breadcrumbs and
 * the library's equipment-qualified spellings ("Barbell Deadlift", "Squat",
 * "Dips") are 150-odd hand-written synonyms the app already maintains for
 * attribution — searching them is free, and NOT searching them is a dead end:
 * the old picker hid alias names from the catalog and then suppressed the
 * custom-add for them too, so typing one found nothing and offered nothing.
 */
function aliasesByTarget(extra: Readonly<Record<string, string>> = {}): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const map of [GYM_ALIASES, GYM_LIBRARY_ALIASES, extra])
    for (const [alias, target] of Object.entries(map)) {
      if (!alias || !target || alias === target) continue;
      (out[target] ??= []).push(alias);
    }
  return out;
}
// ── prominence ───────────────────────────────────────────────────────────────

// Within a tier, the shorter/plainer name should win, but "shorter" alone puts
// "Z Press" above "Bench Press" for the query "press" — which is nonsense. So a
// movement carries a PROMINENCE derived from what the exercise DB already
// knows: a loaded barbell compound on a primary pattern is what an athlete
// means by a bare pattern word.

const PATTERN_WEIGHT: Record<GymPattern, number> = {
  squat: 12,
  hinge: 12,
  "push-h": 12,
  "push-v": 12,
  "pull-h": 12,
  "pull-v": 12,
  olympic: 10,
  lunge: 8,
  carry: 6,
  core: 5,
  plyo: 4,
  isolation: 2,
};

const EQUIPMENT_WEIGHT: Record<GymEquipment, number> = {
  barbell: 14,
  bodyweight: 10,
  dumbbell: 9,
  kettlebell: 7,
  cable: 6,
  machine: 5,
  "trap-bar": 5,
  "ez-bar": 4,
  smith: 3,
  landmine: 3,
  band: 2,
  sled: 2,
  medball: 2,
  other: 0,
};

/**
 * The handful of movements that ARE the answer to their own bare noun. Derived
 * prominence gets most of the way there, but "Back Squat" vs "Box Squat" (same
 * pattern, same bar, near-identical base load) is a judgement call, and a
 * judgement call belongs in a list somebody wrote on purpose. Small by design —
 * the athlete's own history outranks all of it the moment they have any.
 */
const CANONICAL: Record<string, number> = {
  Deadlift: 60,
  "Back Squat": 60,
  "Bench Press": 60,
  "Overhead Press": 50,
  "Barbell Row": 45,
  "Pull-Up": 45,
  "Push-Up": 40,
  "Chin-Up": 35,
  "Front Squat": 40,
  "Romanian Deadlift": 40,
  "Lat Pulldown": 35,
  "Hip Thrust": 35,
  "Barbell Curl": 35,
  "Leg Press": 30,
  "Bulgarian Split Squat": 30,
  "Walking Lunge": 30,
  "Lateral Raise": 30,
  "Triceps Pushdown": 30,
  "Standing Calf Raise": 30,
  "Lying Leg Curl": 30,
  "Leg Extension": 30,
  "KB Swing": 30,
  Plank: 30,
  Clean: 30,
  Snatch: 30,
  "Clean & Jerk": 30,
  "Push Press": 25,
  "Face Pull": 25,
  "Hammer Curl": 25,
  "Farmer Carry": 25,
  Thruster: 25,
  "Goblet Squat": 25,
  Running: 40,
  Cycling: 30,
  Swimming: 30,
  Rowing: 30,
};

function prominenceOf(name: string): number {
  const curated = CANONICAL[name] ?? 0;
  const g = gymExercise(name);
  if (!g) return curated; // a sport, or a free-typed custom lift
  return (
    curated +
    (g.mechanics === "compound" ? 16 : 0) +
    (PATTERN_WEIGHT[g.pattern] ?? 0) +
    (EQUIPMENT_WEIGHT[g.equipment] ?? 0) +
    Math.min(g.baseLoad ?? 0, 200) / 12
  );
}

// ── the index ────────────────────────────────────────────────────────────────

/**
 * Pre-normalize a catalog for searching. Build it ONCE per catalog (the admin
 * library only changes when it reloads) — ranking is cheap, normalizing 300
 * names on every keystroke is not.
 */
export function buildExerciseIndex(
  names: readonly string[],
  /** Extra `alias name → catalog name` pairs (the admin library's aliases). */
  aliasMap: Readonly<Record<string, string>> = {},
): ExerciseIndexEntry[] {
  const aliases = aliasesByTarget(aliasMap);
  return names.map((name) => {
    const g = gymExercise(name);
    const sport = olympicSport(name);
    const terms: string[] = [];
    const weak: string[] = [];
    if (g) {
      terms.push(...g.primary, g.category, g.equipment);
      // A lift where the muscle is only ASSISTING is a poor answer to that
      // muscle's name: "abs" must reach the Plank before it reaches the Snatch.
      weak.push(...g.secondary, g.mechanics);
      if (g.pattern === "squat" || g.pattern === "hinge" || g.pattern === "lunge") terms.push("legs");
    }
    if (sport) {
      terms.push(sport.category, "cardio");
      weak.push("sport");
    }
    return searchEntry(name, [name, ...(EXERCISE_NICKNAMES[name] ?? []), ...(aliases[name] ?? [])], {
      // Both the joined term and its words, so "delts" reaches "side delts" and
      // "back" reaches "lower back" — a muscle query is typed either way.
      terms: terms.flatMap(splitTerm),
      weakTerms: weak.flatMap(splitTerm),
      prominence: prominenceOf(name),
    });
  });
}

/** A term and its words — "lower-back" is searchable as "lower back" AND "back". */
function splitTerm(raw: string): string[] {
  const t = normalizeSearchText(raw);
  return t ? [t, ...t.split(" ")] : [];
}

// ── the public lookups ───────────────────────────────────────────────────────

/**
 * Rank a prepared index against what the athlete typed. Returns hits ordered
 * best-first; an empty query returns nothing (the caller shows its browse view).
 */
export function searchExerciseIndex(
  index: readonly ExerciseIndexEntry[],
  query: string,
  opts: ExerciseSearchOptions = {},
): ExerciseHit[] {
  return rankEntries(index, query, opts).map((h) => ({ name: h.value, tier: h.tier, score: h.score }));
}

/** One-shot convenience: index + search. Prefer the two-step form in a UI. */
export function searchExercises(
  names: readonly string[],
  query: string,
  opts: ExerciseSearchOptions = {},
): ExerciseHit[] {
  return searchExerciseIndex(buildExerciseIndex(names), query, opts);
}

/**
 * Does the typed text already NAME something the catalog has? The "add a custom
 * exercise" offer hangs off this: offering to create "deadlift" when `Deadlift`
 * exists is how a log ends up with the same lift under two spellings.
 */
export function exerciseNameTaken(names: readonly string[], query: string, aliases: Iterable<string> = []): boolean {
  const q = normalizeSearchText(query);
  if (!q) return true;
  for (const n of names) if (normalizeSearchText(n) === q) return true;
  for (const a of aliases) if (normalizeSearchText(a) === q) return true;
  return false;
}
