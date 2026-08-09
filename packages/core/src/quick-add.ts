/**
 * QUICK ADD — logging by typing what you ate.
 *
 * "+ 40g protein". "chicken 200g". "2 eggs". The fastest logging surface in any
 * tracker is the one with no screens in it, and the app already had every
 * ingredient for it — a saved library, a recents list, a serving weight per
 * product — behind three taps and a stepper.
 *
 * ── IT PARSES. IT DOES NOT GUESS ──────────────────────────────────────────
 * This is a grammar, not a model. It recognises numbers, units and a small
 * vocabulary, and everything it cannot account for becomes the food NAME, which
 * is then matched against foods the athlete has ALREADY SAVED. Nothing is
 * invented: a phrase that resolves to nothing returns `unknown` and the caller
 * falls back to the normal picker, rather than logging a plausible 400 kcal.
 *
 * ── THE VOCABULARY IS A PARAMETER ─────────────────────────────────────────
 * "protein" is a word, and words are localised. The keyword map defaults to
 * English (so a caller with no `t()` in reach still works) and can be replaced
 * wholesale by a client that has one — the same shape `DURATION_UNITS` uses.
 * Core ships a default, never a hard-coded assumption.
 *
 * ── GRAMS ONLY CONVERT WHEN THE CONVERSION IS KNOWN ───────────────────────
 * "chicken 200g" against a product whose serving is "100 g" with
 * `servingGrams: 100` is two servings. Against a product that never recorded a
 * serving weight, it is NOT 2, and it is not 1 either — it is unanswerable, so
 * the match comes back flagged `needsPortion` and the caller opens the portion
 * editor instead of logging a number nobody computed. Silently treating "200g"
 * as one serving of an unknown weight is exactly the confident-wrong-number
 * failure the rest of this codebase is built to avoid.
 *
 * Pure + unit-tested, and shared, so the phone and the browser read the same
 * sentence the same way (parity rule).
 */

import type { NutritionFacts } from "./food-facts";

/** The words the parser recognises. Replaceable by a localised caller. */
export interface QuickAddVocab {
  kcal: string[];
  protein: string[];
  carbs: string[];
  fat: string[];
  /** the multiplier word between a count and a food ("2 x whey") */
  times: string[];
}

/** The default vocabulary — English, plus the abbreviations everyone types. */
export const QUICK_ADD_VOCAB: QuickAddVocab = {
  kcal: ["kcal", "cal", "cals", "calories", "calorie"],
  protein: ["protein", "prot", "p"],
  carbs: ["carbs", "carb", "carbohydrate", "carbohydrates", "c"],
  fat: ["fat", "fats", "f"],
  times: ["x", "×"],
};

/**
 * The athlete's own vocabulary, from either client's `t`. The keys live HERE
 * rather than in each client so the two cannot quietly recognise different
 * words — the same reason `durationUnits(t)` exists.
 *
 * The strings are comma-separated word lists, not labels: they are what the
 * parser MATCHES against, so a locale adds its own short forms ("b" for
 * białko, "kh" for Kohlenhydrate) without touching this file.
 */
export const quickAddVocab = (t: (key: string) => string): QuickAddVocab => {
  const words = (key: string, fallback: string[]): string[] => {
    const list = t(key).split(",").map((w) => w.trim().toLowerCase()).filter(Boolean);
    // A locale that has not been translated yet returns the key itself, which
    // would make the parser match on "w.recovery.…" and nothing else.
    return list.length && !list[0]!.startsWith("w.") ? list : fallback;
  };
  return {
    kcal: words("w.recovery.nutrition.qa.vocabKcal", QUICK_ADD_VOCAB.kcal),
    protein: words("w.recovery.nutrition.qa.vocabProtein", QUICK_ADD_VOCAB.protein),
    carbs: words("w.recovery.nutrition.qa.vocabCarbs", QUICK_ADD_VOCAB.carbs),
    fat: words("w.recovery.nutrition.qa.vocabFat", QUICK_ADD_VOCAB.fat),
    times: QUICK_ADD_VOCAB.times,
  };
};

/** Mass/volume units the parser understands, and their gram equivalent where
 *  one exists. `null` means "a count of servings", not "unitless". */
const UNITS: Record<string, number | null> = {
  g: 1, gram: 1, grams: 1, gr: 1,
  kg: 1000, kilo: 1000, kilos: 1000,
  // Volume is treated as grams at water density. That is exactly right for
  // water and close enough for milk and juice, which is what people type it
  // for; it is NOT right for oil, and the portion editor remains the way to be
  // precise about anything where it matters.
  ml: 1, l: 1000, litre: 1000, liter: 1000,
  oz: 28.349523125, ounce: 28.349523125, ounces: 28.349523125,
};

export type QuickAddKind = "macros" | "food" | "unknown";

export interface QuickAddMacros {
  kind: "macros";
  /** only the fields the athlete actually named */
  facts: Partial<Pick<NutritionFacts, "kcal" | "protein" | "carbs" | "fat">>;
  /** kcal derived from the macros at 4·4·9 when none was typed */
  derivedKcal: boolean;
}

export interface QuickAddFood {
  kind: "food";
  /** everything that was not a number, a unit or a keyword */
  query: string;
  /** how much: a gram figure, or a count of servings */
  amount: number;
  /** "g" when `amount` is a mass, null when it is a count of servings */
  unit: "g" | null;
}

export interface QuickAddUnknown { kind: "unknown" }

export type QuickAdd = QuickAddMacros | QuickAddFood | QuickAddUnknown;

/** Accepts a decimal comma as well as a point — PL and DE type "1,5". */
const num = (s: string): number => parseFloat(s.replace(",", "."));

const NUMBER_RE = /^[0-9]+(?:[.,][0-9]+)?$/;
/** A number glued to a unit, as everyone actually types it: "200g", "1.5kg". */
const NUM_UNIT_RE = /^([0-9]+(?:[.,][0-9]+)?)([a-z]+)$/i;

/**
 * Read one typed line.
 *
 * A line naming a MACRO is a macro entry; anything else with a name in it is a
 * food lookup. That single rule keeps the grammar explainable — "if you name a
 * macro I record the macro, otherwise I look for the food" — which matters more
 * than cleverness in a control people use while holding a fork.
 */
export function parseQuickAdd(input: string, vocab: QuickAddVocab = QUICK_ADD_VOCAB): QuickAdd {
  const raw = (input ?? "").trim().replace(/^\+\s*/, "");
  if (!raw) return { kind: "unknown" };

  // Split "200g" into "200" "g" so the grammar below sees uniform tokens.
  //
  // NOT on the comma: "12,5" is one number in the two locales this app ships
  // beside English, and splitting there would read half of it. A comma used as
  // a separator ("300 kcal, 30g protein") is stripped from the token instead.
  const tokens: string[] = [];
  for (const tok of raw.split(/[\s;]+/).map((x) => x.replace(/[,;]+$/, "")).filter(Boolean)) {
    const m = NUM_UNIT_RE.exec(tok);
    if (m && (UNITS[m[2]!.toLowerCase()] !== undefined || isKeyword(m[2]!, vocab))) {
      tokens.push(m[1]!, m[2]!);
    } else tokens.push(tok);
  }

  const macros = readMacros(tokens, vocab);
  if (macros) return macros;
  return readFood(tokens, vocab);
}

/** A unit of mass or volume, as opposed to a food name that happens to be short. */
const isMassUnit = (word: string): boolean => UNITS[word.toLowerCase()] !== undefined;

const isKeyword = (word: string, v: QuickAddVocab): boolean => {
  const w = word.toLowerCase();
  return v.kcal.includes(w) || v.protein.includes(w) || v.carbs.includes(w) || v.fat.includes(w);
};

const macroFieldOf = (word: string, v: QuickAddVocab): keyof QuickAddMacros["facts"] | null => {
  const w = word.toLowerCase();
  if (v.kcal.includes(w)) return "kcal";
  if (v.protein.includes(w)) return "protein";
  if (v.carbs.includes(w)) return "carbs";
  if (v.fat.includes(w)) return "fat";
  return null;
};

/**
 * Macro entry. A keyword takes the number on EITHER side of it — "500 kcal" and
 * "kcal 500" are the same claim, and insisting on one order would make the
 * control feel like a syntax rather than a sentence.
 */
function readMacros(tokens: string[], v: QuickAddVocab): QuickAddMacros | null {
  const facts: QuickAddMacros["facts"] = {};
  let found = false;
  const used = new Set<number>();

  for (let i = 0; i < tokens.length; i++) {
    const field = macroFieldOf(tokens[i]!, v);
    if (!field) continue;
    // The number before the keyword wins; a bare keyword takes the one after.
    // A MASS UNIT in between is noise — "40 g protein" and "40g protein" are
    // the same claim, and the grams are already implied by the field.
    let n: number | null = null;
    const back = i > 0 && isMassUnit(tokens[i - 1]!) ? i - 2 : i - 1;
    const fwd = i + 1 < tokens.length && isMassUnit(tokens[i + 1]!) ? i + 2 : i + 1;
    if (back >= 0 && !used.has(back) && NUMBER_RE.test(tokens[back]!)) { n = num(tokens[back]!); used.add(back); }
    else if (fwd < tokens.length && !used.has(fwd) && NUMBER_RE.test(tokens[fwd]!)) { n = num(tokens[fwd]!); used.add(fwd); }
    if (n == null || !Number.isFinite(n) || n < 0) continue;
    facts[field] = Math.round(n * 10) / 10;
    used.add(i);
    found = true;
  }
  if (!found) return null;

  // A line naming only macros still has to log an energy figure, or the day's
  // ring would not move. 4·4·9 is the same derivation the manual form uses.
  let derivedKcal = false;
  if (facts.kcal == null) {
    const k = Math.round((facts.protein ?? 0) * 4 + (facts.carbs ?? 0) * 4 + (facts.fat ?? 0) * 9);
    if (k > 0) { facts.kcal = k; derivedKcal = true; }
  }
  return { kind: "macros", facts, derivedKcal };
}

/** Food lookup: a name, and how much of it. */
function readFood(tokens: string[], v: QuickAddVocab): QuickAddFood | QuickAddUnknown {
  let grams: number | null = null;
  let count: number | null = null;
  const nameParts: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    if (v.times.includes(tok.toLowerCase())) continue; // the "x" in "2 x whey"
    if (!NUMBER_RE.test(tok)) {
      // A unit with no number in front of it is not a unit, it is a word.
      if (UNITS[tok.toLowerCase()] !== undefined && (grams != null || count != null)) continue;
      nameParts.push(tok);
      continue;
    }
    const n = num(tok);
    const next = tokens[i + 1]?.toLowerCase();
    const factor = next != null ? UNITS[next] : undefined;
    if (factor != null) { grams = n * factor; i++; }
    else count = n;
  }

  const query = nameParts.join(" ").trim();
  if (!query) return { kind: "unknown" };
  if (grams != null) return { kind: "food", query, amount: Math.round(grams * 10) / 10, unit: "g" };
  return { kind: "food", query, amount: count != null && count > 0 ? count : 1, unit: null };
}

/* ── RESOLUTION ───────────────────────────────────────────────────────────── */

/** Something the athlete has already saved, that a typed name can resolve to. */
export interface QuickAddCandidate {
  id: string;
  name: string;
  subname?: string | null;
  servingLabel: string;
  /** the serving's weight, when it was ever recorded */
  servingGrams?: number | null;
  facts: NutritionFacts;
  /** where it came from — decides the tie-break, see `rank` */
  source: "recent" | "product" | "meal";
  verifiedId?: string | null;
}

export interface QuickAddMatch {
  candidate: QuickAddCandidate;
  /** servings to log */
  qty: number;
  /** true when grams were asked for and the serving weight is unknown, so the
   *  quantity could NOT be computed — open the portion editor, don't log */
  needsPortion: boolean;
  /** higher is a better match; a relative figure, never shown */
  score: number;
}

/** Recents beat the library: the food you logged yesterday is a better answer
 *  to a two-word phrase than one you saved in March and never used. */
const SOURCE_RANK: Record<QuickAddCandidate["source"], number> = { recent: 0.06, product: 0.03, meal: 0 };

/** Accent-folded, case-folded — 'jogurt' should find 'Jogurt', and the Polish
 *  fold is the same one the verified search already applies. */
const fold = (s: string): string =>
  s.toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/**
 * Rank the athlete's own foods against a typed name.
 *
 * Deliberately only their OWN foods. A quick-add that reached the community
 * database would be a network round-trip in a control whose whole promise is
 * that it is instant, and it would resolve "chicken" to a stranger's guess
 * rather than to the chicken this athlete actually eats.
 */
export function resolveQuickAdd(
  parsed: QuickAdd,
  candidates: QuickAddCandidate[],
  limit = 5,
): QuickAddMatch[] {
  if (parsed.kind !== "food") return [];
  const q = fold(parsed.query);
  if (!q) return [];

  const scored: QuickAddMatch[] = [];
  for (const c of candidates) {
    const name = fold(c.name);
    const sub = c.subname ? fold(c.subname) : "";
    let score = 0;
    if (name === q) score = 1;
    else if (name.startsWith(q)) score = 0.85;
    else if (new RegExp(`\\b${escapeRe(q)}`).test(name)) score = 0.7;
    else if (name.includes(q)) score = 0.5;
    else if (sub.includes(q)) score = 0.35;
    else continue;

    const { qty, needsPortion } = quantityFor(parsed, c);
    // NOT clamped to 1: an exact name match scores 1 for every candidate, so
    // clamping here would erase the source tie-break in precisely the case it
    // exists to settle (two foods called "Yoghurt", one of them logged
    // yesterday). Scores are compared, never displayed.
    scored.push({ candidate: c, qty, needsPortion, score: score + SOURCE_RANK[c.source] });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * How many servings the phrase asks for.
 *
 * A count is a count. Grams convert ONLY when the serving weight is on record;
 * otherwise the answer is unknown and says so (see the file note) rather than
 * quietly becoming 1.
 */
function quantityFor(parsed: QuickAddFood, c: QuickAddCandidate): { qty: number; needsPortion: boolean } {
  if (parsed.unit !== "g") return { qty: parsed.amount, needsPortion: false };
  const per = c.servingGrams;
  if (per == null || !Number.isFinite(per) || per <= 0) return { qty: 1, needsPortion: true };
  return { qty: Math.round((parsed.amount / per) * 100) / 100, needsPortion: false };
}

/** What a resolved match writes to the diary — per SINGLE serving with a
 *  separate quantity, exactly as every other logging path does, so a
 *  quick-added entry stays rescalable by the Diary's own stepper. */
export interface QuickAddDraft {
  name: string;
  subname: string | null;
  facts: NutritionFacts;
  qty: number;
  verifiedId: string | null;
}

export function quickAddDraft(match: QuickAddMatch): QuickAddDraft {
  const c = match.candidate;
  return {
    name: c.name,
    subname: c.subname ?? null,
    facts: c.facts,
    qty: match.qty,
    verifiedId: c.verifiedId ?? null,
  };
}

/** What a MACRO line writes. It has no food behind it, so the caller supplies
 *  the entry's name (a localized "Quick entry"); everything unstated stays
 *  unstated rather than becoming a zero. */
export function macroDraft(m: QuickAddMacros, name: string): QuickAddDraft {
  return {
    name,
    subname: null,
    facts: {
      kcal: Math.round(m.facts.kcal ?? 0),
      protein: m.facts.protein ?? 0,
      carbs: m.facts.carbs ?? 0,
      fat: m.facts.fat ?? 0,
      satFat: null, sugar: null, fiber: null, salt: null,
    },
    qty: 1,
    verifiedId: null,
  };
}
