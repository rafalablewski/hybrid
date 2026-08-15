// ─────────────────────────────────────────────────────────────────────────────
// RANKED SEARCH — ONE scoring engine, for every search field in the app.
//
// This is the exercise picker's ranker with the exercises taken out of it. It
// was written for one field, and the moment it worked it was obvious that every
// other search in the app wanted the same thing and had none of it: the sport
// picker still ran `name.includes(q)`, and there was no cross-app search at all.
// A second, worse search growing beside a good one is how you end up with two
// vocabularies and two sets of bugs, so the scoring lives here and the callers
// only describe WHAT they are searching.
//
// A caller supplies, per item:
//   forms      — every spelling it answers to. Form 0 is what gets printed;
//                the rest are nicknames, aliases, old names. Each is scored as
//                an independent alternate name (see SearchForm).
//   terms      — what it IS or does, for when the name doesn't match at all
//                (an exercise's prime movers; a screen's topic words).
//   weakTerms  — the same, but only incidentally true (an assisting muscle).
//   prominence — how canonical this item is among its peers. Breaks ties.
//
// Everything else — the bands, the adjustments, the vocabulary, the typo slack —
// is decided here and pinned by ranked-search.test.ts, so two fields can never
// disagree about what "bench db" means.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How a hit matched. This DESCRIBES the match; it does not by itself order the
 * list (see the weights below) — a strong word match on a canonical item
 * outranks a prefix match on an obscure one, which is the whole point.
 */
export type SearchMatchTier =
  /** The query IS the name (or one of its nicknames). */
  | "exact"
  /** The name starts with the query ("bench" → Bench Press). */
  | "prefix"
  /** Every query token matches a word of the name ("db bench" → DB Bench Press). */
  | "word"
  /** Every query token appears inside a word ("lift" → Deadlift). */
  | "contains"
  /** Matched on what it IS, not what it's called ("hamstrings", "barbell"). */
  | "meta"
  /** Matched through a typo ("deadlfit" → Deadlift). */
  | "fuzzy";

/**
 * THE WEIGHTS. Ordering is a product decision, so it is written down in one
 * block and pinned by tests rather than left to emerge.
 *
 * The bands are far apart because match QUALITY dominates: nothing that merely
 * mentions the right muscle should ever appear above something whose name the
 * athlete just typed. Inside a band the adjustments decide, and they encode
 * three claims: a name with words the query didn't ask for is a VARIANT of the
 * thing asked for (so it costs, heavily); a canonical barbell compound is what
 * a bare pattern word means; and a thing you have actually used beats one you
 * have not.
 */
export const SEARCH_WEIGHTS = {
  /** The query is the whole name — nothing outranks this. */
  exact: 100_000,
  /** A query token equals a whole name word ("row" → Barbell Row). */
  wholeWord: 60_000,
  /** A query token starts a name word ("dead" → Deadlift, "run" → Running). */
  wordPrefix: 56_000,
  /** A query token sits inside a word ("lift" → Deadlift). */
  inWord: 12_000,
  /** Only the terms matched ("hamstrings" → Romanian Deadlift). */
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
  /** …and in the meta band, where "is it really ABOUT this" matters more. */
  prominenceMeta: 20,
  /** Every meta token landed on a strong term rather than a weak one. */
  primaryMeta: 3_000,
  /** An item the athlete has used at all. */
  used: 1_200,
  /** Per use, capped at USED_CAP. */
  perUse: 40,
} as const;

const W = SEARCH_WEIGHTS;
const USED_CAP = 30;

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

// ── vocabulary ───────────────────────────────────────────────────────────────

/**
 * Query token → the other spellings that should ALSO match. Two-way by
 * construction: every group member expands to the whole group, so "db" finds
 * "Dumbbell Pullover" and "dumbbell" finds "DB Bench Press" — a real split in
 * the exercise catalog, which spells the same implement both ways.
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

// ── normalization ────────────────────────────────────────────────────────────

/** Lower-case, accents folded, every non-alphanumeric run collapsed to a space. */
export function normalizeSearchText(s: string): string {
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
 * A spelling an entry answers to. Form 0 is the printed name; the rest are its
 * nicknames, each scored as an INDEPENDENT alternate name. That is the whole
 * trick to making nicknames behave: "single leg romanian deadlift" is a fine
 * nickname for Single-Leg RDL and a terrible answer to the query "deadlift" —
 * scoring it as its own name is what charges it for the three words the athlete
 * did not type, instead of waving them through because a nickname matched.
 */
export interface SearchForm {
  norm: string;
  compact: string;
  words: string[];
}

/** One searchable thing, pre-normalized. Build with `searchEntry`. */
export interface RankedEntry<T> {
  /** What the caller gets back on a hit. */
  value: T;
  /** Identity for the used-before boost, matched case- and punctuation-blind. */
  key: string;
  forms: SearchForm[];
  /** What it IS — the strong `meta` haystack. */
  terms: string[];
  /** What it only incidentally is — a real match, but not what was meant. */
  weakTerms: string[];
  /** How canonical this is among its peers, 0…~120. Breaks ties within a band. */
  prominence: number;
}

export interface RankedHit<T> {
  value: T;
  tier: SearchMatchTier;
  score: number;
}

export interface RankedSearchOptions {
  /** Most hits to return. */
  limit?: number;
  /**
   * What the athlete has actually used: key → times used. The single strongest
   * relevance signal any of this has, and it is already sitting in their log.
   */
  uses?: Readonly<Record<string, number>>;
}

const form = (n: string): SearchForm => ({ norm: n, compact: n.replace(/ /g, ""), words: tokenize(n) });

/**
 * Build one index entry. `names[0]` is the printed name; the rest are the other
 * spellings it answers to. Blank and duplicate forms are dropped.
 */
export function searchEntry<T>(
  value: T,
  names: readonly string[],
  opts: { terms?: readonly string[]; weakTerms?: readonly string[]; prominence?: number; key?: string } = {},
): RankedEntry<T> {
  const forms = [...new Set(names.map(normalizeSearchText).filter(Boolean))];
  const terms = [...new Set((opts.terms ?? []).map(normalizeSearchText).filter(Boolean))];
  const weak = [...new Set((opts.weakTerms ?? []).map(normalizeSearchText).filter(Boolean))];
  return {
    value,
    key: normalizeSearchText(opts.key ?? names[0] ?? ""),
    forms: forms.length ? forms.map(form) : [form("")],
    terms,
    weakTerms: weak.filter((t) => !terms.includes(t)),
    prominence: opts.prominence ?? 0,
  };
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

const KIND_TIER: Record<MatchKind, SearchMatchTier> = {
  4: "word",
  3: "word",
  2: "contains",
  1: "meta",
  0: "fuzzy",
};

/** Best way this token matches one spelling of the thing, or null. */
function scoreTokenInForm(f: SearchForm, variants: string[]): TokenScore | null {
  let best: TokenScore | null = null;
  const take = (kind: MatchKind, at: number) => {
    if (!best || kind > best.kind || (kind === best.kind && at < best.at)) best = { kind, at };
  };
  for (const v of variants)
    for (let i = 0; i < f.words.length; i++) {
      const w = f.words[i]!;
      if (w === v) take(4, i);
      else if (w.startsWith(v)) take(3, i);
      else if (v.length >= MIN_IN_WORD_LENGTH && w.includes(v)) take(2, i);
    }
  return best;
}

/** Score one spelling against the whole query — every token must land. */
function scoreForm(
  f: SearchForm,
  prominence: number,
  normQuery: string,
  compactQuery: string,
  queryTokens: string[][],
): { tier: SearchMatchTier; score: number } | null {
  const scores: TokenScore[] = [];
  for (const variants of queryTokens) {
    const s = scoreTokenInForm(f, variants);
    if (!s) {
      // Nothing matched word-wise. A RUN-TOGETHER query ("benchpress",
      // "pullup", "sidelateralraise") is still a real attempt at the name, and
      // dropping the spaces is the only way to see it.
      if (compactQuery.length >= MIN_GLUED_LENGTH && f.compact.startsWith(compactQuery))
        return {
          tier: "prefix",
          score: W.wordPrefix + W.startsWith + f.norm.length * W.perChar + prominence * W.prominence,
        };
      return null;
    }
    scores.push(s);
  }
  const worst = Math.min(...scores.map((s) => s.kind)) as MatchKind;
  // Words the query did NOT name are what makes a variant a variant, so each
  // one costs — that is what puts "Deadlift" above "Snatch-Grip Deadlift".
  const matched = new Set(scores.map((s) => s.at));
  const extraWords = Math.max(0, f.words.length - matched.size);
  const leading = Math.min(...scores.map((s) => s.at));
  const startsWith = f.norm.startsWith(normQuery) || f.compact.startsWith(compactQuery);
  return {
    tier: startsWith ? "prefix" : KIND_TIER[worst],
    score:
      KIND_WEIGHT[worst] +
      (startsWith ? W.startsWith : 0) +
      extraWords * W.extraWord +
      leading * W.lateMatch +
      f.norm.length * W.perChar +
      prominence * W.prominence,
  };
}

/** Nothing in any spelling matched — try what the thing IS. */
function scoreMeta<T>(entry: RankedEntry<T>, queryTokens: string[][]): { tier: SearchMatchTier; score: number } | null {
  let allPrimary = true;
  for (const variants of queryTokens) {
    let hit: "primary" | "weak" | null = null;
    for (const v of variants) {
      if (entry.terms.some((t) => t.startsWith(v))) {
        hit = "primary";
        break;
      }
      if (!hit && entry.weakTerms.some((t) => t.startsWith(v))) hit = "weak";
    }
    if (!hit) return null;
    if (hit === "weak") allPrimary = false;
  }
  // The query named a CATEGORY — a muscle, a piece of gear, a topic — not a
  // thing. Prominence still matters, but far less than whether the category is
  // what the thing is FOR; otherwise every big barbell lift buries the
  // isolation work being looked for.
  return {
    tier: "meta",
    score: W.meta + (allPrimary ? W.primaryMeta : 0) + entry.prominence * W.prominenceMeta,
  };
}

/** Last resort: the athlete mistyped a word of the name. */
function scoreFuzzy<T>(entry: RankedEntry<T>, queryTokens: string[][]): { tier: SearchMatchTier; score: number } | null {
  const words = entry.forms[0]!.words;
  for (const variants of queryTokens) {
    const typed = variants[0]!;
    if (typed.length < MIN_FUZZ_LENGTH) return null;
    if (!words.some((w) => withinOneEdit(typed, w))) return null;
  }
  return { tier: "fuzzy", score: W.fuzzy + entry.prominence * W.prominence };
}

function scoreEntry<T>(
  entry: RankedEntry<T>,
  normQuery: string,
  compactQuery: string,
  queryTokens: string[][],
): { tier: SearchMatchTier; score: number } | null {
  if (entry.forms.some((f) => f.norm === normQuery)) return { tier: "exact", score: W.exact + entry.prominence };
  let best: { tier: SearchMatchTier; score: number } | null = null;
  for (const f of entry.forms) {
    const s = scoreForm(f, entry.prominence, normQuery, compactQuery, queryTokens);
    if (s && (!best || s.score > best.score)) best = s;
  }
  return best ?? scoreMeta(entry, queryTokens) ?? scoreFuzzy(entry, queryTokens);
}

/**
 * Rank a prepared index against what the athlete typed. Best first; an empty
 * query returns nothing (the caller shows its own browse view).
 *
 * Cheap enough to run on every keystroke over a few hundred entries — which is
 * why no field in this app debounces. The list moves with the finger.
 */
export function rankEntries<T>(
  index: readonly RankedEntry<T>[],
  query: string,
  opts: RankedSearchOptions = {},
): RankedHit<T>[] {
  const normQuery = normalizeSearchText(query);
  if (!normQuery) return [];
  const compactQuery = normQuery.replace(/ /g, "");
  const queryTokens = tokenize(normQuery).map(tokenVariants);
  const uses = opts.uses ?? {};
  const usesByKey: Record<string, number> = {};
  for (const [name, n] of Object.entries(uses)) usesByKey[normalizeSearchText(name)] = n;

  const hits: RankedHit<T>[] = [];
  for (const entry of index) {
    const s = scoreEntry(entry, normQuery, compactQuery, queryTokens);
    if (!s) continue;
    // What the athlete actually uses leads its band — capped, so a hundred
    // sessions of one accessory can never outrank an exact-name match.
    const used = usesByKey[entry.key] ?? 0;
    const personal = used > 0 ? W.used + Math.min(used, USED_CAP) * W.perUse : 0;
    hits.push({ value: entry.value, tier: s.tier, score: s.score + personal });
  }
  hits.sort((a, b) => b.score - a.score || compareValues(a.value, b.value));
  return hits.slice(0, opts.limit ?? 40);
}

/** Stable tie-break, so an equal score always produces the same list. */
function compareValues(a: unknown, b: unknown): number {
  const sa = typeof a === "string" ? a : String((a as { name?: string; title?: string })?.name ?? (a as { title?: string })?.title ?? "");
  const sb = typeof b === "string" ? b : String((b as { name?: string; title?: string })?.name ?? (b as { title?: string })?.title ?? "");
  return sa.localeCompare(sb);
}
