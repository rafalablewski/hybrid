import {
  gymExercise,
  GYM_ALIASES,
  GYM_LIBRARY_ALIASES,
  type GymEquipment,
  type GymPattern,
} from "./exercise-db";
import { olympicSport } from "./olympic-sports";

// ─────────────────────────────────────────────────────────────────────────────
// EXERCISE SEARCH — the ranked lookup behind every "add an exercise" field.
//
// What it replaces: `catalog.filter(n => n.toLowerCase().includes(q))`. That is
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
// The shape: build an INDEX once per catalog (memoize it — it only changes when
// the admin library loads), then score every entry per keystroke. 300-odd
// entries × a handful of tokens is microseconds, so there is no debounce here
// and none is wanted: the list must move with the finger.
//
// Pure data + pure functions — no React, no platform APIs — so both the mobile
// picker and any server-side lookup rank identically, and the ordering is
// pinned by tests rather than by whatever the catalog order happens to be.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How a hit matched. This DESCRIBES the match; it does not by itself order the
 * list (see the weights below) — a strong word match on a canonical lift
 * outranks a prefix match on an obscure one, which is the whole point.
 */
export type ExerciseMatchTier =
  /** The query IS the name (or one of its nicknames). */
  | "exact"
  /** The name starts with the query ("bench" → Bench Press). */
  | "prefix"
  /** Every query token matches a word of the name ("db bench" → DB Bench Press). */
  | "word"
  /** Every query token appears inside a word ("lift" → Deadlift). */
  | "contains"
  /** Matched on what it TRAINS, not what it's called ("hamstrings", "barbell"). */
  | "meta"
  /** Matched through a typo ("deadlfit" → Deadlift). */
  | "fuzzy";

/**
 * THE WEIGHTS. Ordering is a product decision, so it is written down in one
 * block and pinned by exercise-search.test.ts rather than left to emerge.
 *
 * The bands are far apart because match QUALITY dominates: nothing that merely
 * mentions the right muscle should ever appear above something whose name the
 * athlete just typed. Inside a band the adjustments decide, and they encode
 * three claims: a name with words the query didn't ask for is a VARIANT of the
 * thing asked for (so it costs, heavily); a canonical barbell compound is what
 * a bare pattern word means; and a lift you have actually logged beats one you
 * have not.
 */
const W = {
  /** The query is the whole name — nothing outranks this. */
  exact: 100_000,
  /** A query token equals a whole name word ("row" → Barbell Row). */
  wholeWord: 60_000,
  /** A query token starts a name word ("dead" → Deadlift, "run" → Running). */
  wordPrefix: 56_000,
  /** A query token sits inside a word ("lift" → Deadlift). */
  inWord: 12_000,
  /** Only the muscles/equipment matched ("hamstrings" → Romanian Deadlift). */
  meta: 4_000,
  /** Matched through a typo. */
  fuzzy: 1_000,
  /** The name begins with what was typed. */
  startsWith: 2_000,
  /** Per name word the query never mentioned — what makes a variant a variant. */
  extraWord: -2_500,
  /** Per name word before the first match ("Barbell Row" for "row"). */
  lateMatch: -600,
  /** Per character of name — the plainer spelling of a tie wins. */
  perChar: -2,
  /** Multiplier on `prominence`. */
  prominence: 60,
  /** …and in the meta band, where "is it FOR this muscle" matters more. */
  prominenceMeta: 20,
  /** Every meta token landed on a prime mover / the lift's own group. */
  primaryMeta: 3_000,
  /** A lift the athlete has logged at all. */
  logged: 1_200,
  /** Per logged session, capped at LOGGED_CAP. */
  perSession: 40,
} as const;

const LOGGED_CAP = 30;

export interface ExerciseHit {
  /** The catalog name, exactly as it should be displayed and stored. */
  name: string;
  tier: ExerciseMatchTier;
  score: number;
}

/**
 * A spelling the entry answers to. Form 0 is the printed name; the rest are its
 * nicknames, each scored as an INDEPENDENT alternate name. That is the whole
 * trick to making nicknames behave: "single leg romanian deadlift" is a fine
 * nickname for Single-Leg RDL and a terrible answer to the query "deadlift" —
 * scoring it as its own name is what charges it for the three words the athlete
 * did not type, instead of waving them through because a nickname matched.
 */
export interface ExerciseSearchForm {
  norm: string;
  compact: string;
  words: string[];
}

/** One catalog entry, pre-normalized. Build with `buildExerciseIndex`. */
export interface ExerciseIndexEntry {
  name: string;
  /** Lower-case, punctuation → spaces ("Trap-Bar Deadlift" → "trap bar deadlift"). */
  norm: string;
  /** The printed name plus every nickname, each ready to score on its own. */
  forms: ExerciseSearchForm[];
  /** What it PRIMARILY trains, plus its group and gear — the strong meta haystack. */
  terms: string[];
  /** What it merely assists — a real match, but not what the query meant. */
  weakTerms: string[];
  /** How "canonical" this movement is, 0…~120. Breaks ties within a band. */
  prominence: number;
}

export interface ExerciseSearchOptions {
  /** Most hits to return. */
  limit?: number;
  /**
   * The athlete's own logging history: name → times logged. A lift you actually
   * train outranks one you have never touched, which is the single strongest
   * relevance signal any of this has — and it is free.
   */
  uses?: Readonly<Record<string, number>>;
}

// ── vocabulary ───────────────────────────────────────────────────────────────

/**
 * Query token → the other spellings that should ALSO match. Two-way by
 * construction: every group member expands to the whole group, so "db" finds
 * "Dumbbell Pullover" and "dumbbell" finds "DB Bench Press" — a real split in
 * the catalog, which spells the same implement both ways.
 */
const SYNONYM_GROUPS: string[][] = [
  ["db", "dumbbell", "dumbell", "dumbbells"],
  ["bb", "barbell"],
  ["kb", "kettlebell", "kettleball"],
  ["ez", "ezbar"],
  ["oh", "overhead"],
  ["bw", "bodyweight"],
  ["pullup", "pullups", "pull", "chinup", "chinups"],
  ["pushup", "pushups", "pressup"],
  ["situp", "situps"],
  ["abs", "ab", "core", "abdominal"],
  ["delts", "delt", "shoulder", "shoulders"],
  ["pecs", "pec", "chest"],
  ["lats", "lat"],
  ["bis", "bicep", "biceps"],
  ["tris", "tricep", "triceps"],
  ["hammies", "hamstring", "hamstrings"],
  ["quad", "quads", "quadriceps"],
  ["glute", "glutes", "butt"],
  ["calf", "calves"],
  ["traps", "trap"],
  ["cardio", "conditioning"],
  ["stationary", "assault", "airdyne"],
];

const SYNONYMS: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {};
  for (const group of SYNONYM_GROUPS)
    for (const word of group) out[word] = [...new Set([...(out[word] ?? []), ...group])];
  return out;
})();

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

// ── normalization ────────────────────────────────────────────────────────────

/** Lower-case, accents folded, every non-alphanumeric run collapsed to a space. */
export function normalizeExerciseText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const tokenize = (s: string): string[] => (s ? s.split(" ").filter(Boolean) : []);

/** The spellings a typed token may match under — itself, its synonyms, its singular. */
function tokenVariants(token: string): string[] {
  const out = new Set<string>([token]);
  for (const s of SYNONYMS[token] ?? []) out.add(s);
  if (token.length > 3 && token.endsWith("s")) out.add(token.slice(0, -1));
  for (const v of [...out]) for (const s of SYNONYMS[v] ?? []) out.add(s);
  return [...out];
}

// ── the index ────────────────────────────────────────────────────────────────

/**
 * Pre-normalize a catalog for searching. Build it ONCE per catalog (the admin
 * library only changes when it reloads) — scoring is cheap, normalizing 300
 * names on every keystroke is not.
 */
export function buildExerciseIndex(
  names: readonly string[],
  /** Extra `alias name → catalog name` pairs (the admin library's aliases). */
  aliasMap: Readonly<Record<string, string>> = {},
): ExerciseIndexEntry[] {
  const aliases = aliasesByTarget(aliasMap);
  return names.map((name) => {
    const norm = normalizeExerciseText(name);
    const g = gymExercise(name);
    const sport = olympicSport(name);
    const terms = new Set<string>();
    const weak = new Set<string>();
    // Both the joined term and its words, so "delts" reaches "side delts" and
    // "back" reaches "lower back" — a muscle query is typed either way.
    const add = (into: Set<string>, raw: string) => {
      const t = normalizeExerciseText(raw);
      if (!t) return;
      into.add(t);
      for (const w of tokenize(t)) into.add(w);
    };
    if (g) {
      for (const m of g.primary) add(terms, m);
      // A lift where the muscle is only ASSISTING is a poor answer to that
      // muscle's name: "abs" must reach the Plank before it reaches the Snatch.
      for (const m of g.secondary) add(weak, m);
      add(terms, g.category);
      add(terms, g.equipment);
      add(weak, g.mechanics);
      if (g.pattern === "squat" || g.pattern === "hinge" || g.pattern === "lunge") add(terms, "legs");
    }
    if (sport) {
      add(terms, sport.category);
      add(terms, "cardio");
      add(weak, "sport");
    }
    const form = (n: string): ExerciseSearchForm => ({ norm: n, compact: n.replace(/ /g, ""), words: tokenize(n) });
    const nicknames = [...(NICKNAMES_BY_NAME[name] ?? []), ...(aliases[name] ?? [])]
      .map(normalizeExerciseText)
      .filter((n) => n && n !== norm);
    return {
      name,
      norm,
      forms: [form(norm), ...[...new Set(nicknames)].map(form)],
      terms: [...terms].filter(Boolean),
      weakTerms: [...weak].filter((t) => t && !terms.has(t)),
      prominence: prominenceOf(name),
    };
  });
}

// ── scoring ──────────────────────────────────────────────────────────────────

/** Damerau-ish: is `a` within one edit (insert/delete/substitute/transpose) of `b`? */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (l.length - s.length > 1) return false;
  let i = 0;
  let j = 0;
  let slack = 1;
  while (i < s.length && j < l.length) {
    if (s[i] === l[j]) {
      i++;
      j++;
      continue;
    }
    if (!slack--) return false;
    if (s.length === l.length) {
      // Substitution, or a transposition of the next two.
      if (s[i + 1] === l[j] && s[i] === l[j + 1]) {
        i += 2;
        j += 2;
        continue;
      }
      i++;
      j++;
    } else j++;
  }
  return true;
}

/** Below this a typo is indistinguishable from a different word, so no slack. */
const MIN_FUZZ_LENGTH = 4;
/**
 * Below this, a match BURIED inside a word is a coincidence rather than a
 * match: "ab" is inside "cable", "kb" is inside nothing an athlete meant. Short
 * tokens still match word STARTS, which is what typing two letters means.
 */
const MIN_IN_WORD_LENGTH = 4;
/** Below this, dropping the spaces out of the query proves nothing. */
const MIN_GLUED_LENGTH = 4;

/** 4 = is a word, 3 = starts a word, 2 = inside a word, 1 = meta, 0 = typo. */
type MatchKind = 0 | 1 | 2 | 3 | 4;

interface TokenScore {
  kind: MatchKind;
  /** Index of the form word it landed on. */
  at: number;
}

const KIND_WEIGHT: Record<MatchKind, number> = {
  4: W.wholeWord,
  3: W.wordPrefix,
  2: W.inWord,
  1: W.meta,
  0: W.fuzzy,
};

const KIND_TIER: Record<MatchKind, ExerciseMatchTier> = {
  4: "word",
  3: "word",
  2: "contains",
  1: "meta",
  0: "fuzzy",
};

/** Best way this token matches one spelling of the movement, or null. */
function scoreTokenInForm(form: ExerciseSearchForm, variants: string[]): TokenScore | null {
  let best: TokenScore | null = null;
  const take = (kind: MatchKind, at: number) => {
    if (!best || kind > best.kind || (kind === best.kind && at < best.at)) best = { kind, at };
  };
  for (const v of variants)
    for (let i = 0; i < form.words.length; i++) {
      const w = form.words[i]!;
      if (w === v) take(4, i);
      else if (w.startsWith(v)) take(3, i);
      else if (v.length >= MIN_IN_WORD_LENGTH && w.includes(v)) take(2, i);
    }
  return best;
}

/** Score one spelling against the whole query — every token must land. */
function scoreForm(
  form: ExerciseSearchForm,
  prominence: number,
  normQuery: string,
  compactQuery: string,
  queryTokens: string[][],
): { tier: ExerciseMatchTier; score: number } | null {
  const scores: TokenScore[] = [];
  for (const variants of queryTokens) {
    const s = scoreTokenInForm(form, variants);
    if (!s) {
      // Nothing matched word-wise. A RUN-TOGETHER query ("benchpress",
      // "pullup", "sidelateralraise") is still a real attempt at the name, and
      // dropping the spaces is the only way to see it.
      if (compactQuery.length >= MIN_GLUED_LENGTH && form.compact.startsWith(compactQuery))
        return {
          tier: "prefix",
          score: W.wordPrefix + W.startsWith + form.norm.length * W.perChar + prominence * W.prominence,
        };
      return null;
    }
    scores.push(s);
  }
  const worst = Math.min(...scores.map((s) => s.kind)) as MatchKind;
  // Words the query did NOT name are what makes a variant a variant, so each
  // one costs — that is what puts "Deadlift" above "Snatch-Grip Deadlift".
  const matched = new Set(scores.map((s) => s.at));
  const extraWords = Math.max(0, form.words.length - matched.size);
  const leading = Math.min(...scores.map((s) => s.at));
  const startsWith = form.norm.startsWith(normQuery) || form.compact.startsWith(compactQuery);
  return {
    tier: startsWith ? "prefix" : KIND_TIER[worst],
    score:
      KIND_WEIGHT[worst] +
      (startsWith ? W.startsWith : 0) +
      extraWords * W.extraWord +
      leading * W.lateMatch +
      form.norm.length * W.perChar +
      prominence * W.prominence,
  };
}

/** Nothing in any spelling matched — try what the movement TRAINS. */
function scoreMeta(entry: ExerciseIndexEntry, queryTokens: string[][]): { tier: ExerciseMatchTier; score: number } | null {
  let allPrimary = true;
  for (const variants of queryTokens) {
    let hit: "primary" | "weak" | null = null;
    for (const v of variants) {
      if (entry.terms.some((t) => t.startsWith(v))) { hit = "primary"; break; }
      if (!hit && entry.weakTerms.some((t) => t.startsWith(v))) hit = "weak";
    }
    if (!hit) return null;
    if (hit === "weak") allPrimary = false;
  }
  // The query named a MUSCLE or a piece of gear, not a lift. Prominence still
  // matters, but far less than whether the muscle is what the movement is FOR —
  // otherwise every big barbell lift buries the isolation work being looked for.
  return {
    tier: "meta",
    score: W.meta + (allPrimary ? W.primaryMeta : 0) + entry.prominence * W.prominenceMeta,
  };
}

/** Last resort: the athlete mistyped a word of the name. */
function scoreFuzzy(entry: ExerciseIndexEntry, queryTokens: string[][]): { tier: ExerciseMatchTier; score: number } | null {
  const words = entry.forms[0]!.words;
  for (const variants of queryTokens) {
    const typed = variants[0]!;
    if (typed.length < MIN_FUZZ_LENGTH) return null;
    if (!words.some((w) => withinOneEdit(typed, w))) return null;
  }
  return { tier: "fuzzy", score: W.fuzzy + entry.prominence * W.prominence };
}

function scoreEntry(
  entry: ExerciseIndexEntry,
  normQuery: string,
  compactQuery: string,
  queryTokens: string[][],
): { tier: ExerciseMatchTier; score: number } | null {
  if (entry.forms.some((f) => f.norm === normQuery)) return { tier: "exact", score: W.exact + entry.prominence };
  let best: { tier: ExerciseMatchTier; score: number } | null = null;
  for (const form of entry.forms) {
    const s = scoreForm(form, entry.prominence, normQuery, compactQuery, queryTokens);
    if (s && (!best || s.score > best.score)) best = s;
  }
  return best ?? scoreMeta(entry, queryTokens) ?? scoreFuzzy(entry, queryTokens);
}

/**
 * Rank a prepared index against what the athlete typed. Returns hits ordered
 * best-first; an empty query returns nothing (the caller shows its browse view).
 */
export function searchExerciseIndex(
  index: readonly ExerciseIndexEntry[],
  query: string,
  opts: ExerciseSearchOptions = {},
): ExerciseHit[] {
  const normQuery = normalizeExerciseText(query);
  if (!normQuery) return [];
  const compactQuery = normQuery.replace(/ /g, "");
  const queryTokens = tokenize(normQuery).map(tokenVariants);
  const uses = opts.uses ?? {};
  const usesByNorm: Record<string, number> = {};
  for (const [name, n] of Object.entries(uses)) usesByNorm[normalizeExerciseText(name)] = n;

  const hits: ExerciseHit[] = [];
  for (const entry of index) {
    const s = scoreEntry(entry, normQuery, compactQuery, queryTokens);
    if (!s) continue;
    // The athlete's own lifts lead their tier — capped, so a hundred logged
    // sessions of one accessory can never outrank an exact-name match.
    const logged = usesByNorm[entry.norm] ?? 0;
    const personal = logged > 0 ? W.logged + Math.min(logged, LOGGED_CAP) * W.perSession : 0;
    hits.push({ name: entry.name, tier: s.tier, score: s.score + personal });
  }
  hits.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return hits.slice(0, opts.limit ?? 40);
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
  const q = normalizeExerciseText(query);
  if (!q) return true;
  for (const n of names) if (normalizeExerciseText(n) === q) return true;
  for (const a of aliases) if (normalizeExerciseText(a) === q) return true;
  return false;
}
