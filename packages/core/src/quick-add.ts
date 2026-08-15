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
 * ── AN AMOUNT CONVERTS THROUGH THE FOOD'S OWN MEASURE, OR NOT AT ALL ──────
 * "chicken 200g" against a product whose serving is "100 g" is two servings,
 * and portion.ts is what says so — the SAME reader the portion editor's unit
 * switch uses, so what you type and what the sheet shows cannot disagree about
 * one food. Against a product with no measure at all ("1 slice", no weight on
 * record) it is NOT 2, and it is not 1 either — it is unanswerable, so the
 * match comes back flagged `needsPortion` and the caller opens the editor
 * instead of logging a number nobody computed.
 *
 * A MASS TYPED AT A VOLUME FOOD IS ALSO UNANSWERABLE. "kefir 400ml" against a
 * food sold by the millilitre is 400 ml; against one sold by weight it needs a
 * density this app does not have, so it opens the editor rather than quietly
 * treating millilitres as grams — which is what this module used to do, at
 * water density, for every food alike. That was right for water, close enough
 * for milk, and wrong for oil, with nothing on screen admitting which.
 *
 * Pure + unit-tested, and shared, so the phone and the browser read the same
 * sentence the same way (parity rule).
 */

import type { NutritionFacts } from "./food-facts";
import { portionMeasure } from "./portion";

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

/** The units the parser understands: what to multiply by, and WHICH MEASURE the
 *  result is in. The measure is the half this table used to throw away — every
 *  unit normalized to grams, so a millilitre became a gram before any food had
 *  been consulted about whether that made sense. */
const UNITS: Record<string, { factor: number; measure: "g" | "ml" }> = {
  g: { factor: 1, measure: "g" }, gram: { factor: 1, measure: "g" }, grams: { factor: 1, measure: "g" }, gr: { factor: 1, measure: "g" },
  kg: { factor: 1000, measure: "g" }, kilo: { factor: 1000, measure: "g" }, kilos: { factor: 1000, measure: "g" },
  ml: { factor: 1, measure: "ml" }, l: { factor: 1000, measure: "ml" }, litre: { factor: 1000, measure: "ml" }, liter: { factor: 1000, measure: "ml" },
  cl: { factor: 10, measure: "ml" },
  oz: { factor: 28.349523125, measure: "g" }, ounce: { factor: 28.349523125, measure: "g" }, ounces: { factor: 28.349523125, measure: "g" },
};

export type QuickAddKind = "macros" | "food" | "unknown";

export interface QuickAddMacros {
  kind: "macros";
  /** only the fields the athlete actually named */
  facts: Partial<Pick<NutritionFacts, "kcal" | "protein" | "carbs" | "fat">>;
  /** kcal derived from the macros at 4·4·9 when none was typed */
  derivedKcal: boolean;
  /** THE WORDS THE READING DID NOT ACCOUNT FOR, if any.
   *
   *  "Whey Protein 80" is a macro line by the grammar — and it is also the name
   *  of a tub on a shelf. The reading is kept (it is a row you tap, not an
   *  action taken) and so is the leftover name, so the caller can ALSO ask the
   *  database about "Whey" and let the athlete pick between two visible
   *  answers. Empty for a clean macro line like "40g protein", which has no
   *  food in it and must not spend a round trip pretending otherwise. */
  name: string;
}

export interface QuickAddFood {
  kind: "food";
  /** everything that was not a number, a unit or a keyword */
  query: string;
  /** how much: an amount in `unit`, or a count of servings */
  amount: number;
  /** the MEASURE the amount is in — "g" or "ml", normalized from whatever was
   *  typed ("1.5kg" → 1500 g, "33cl" → 330 ml). Null when it is a count of
   *  servings. The two are never interchanged: see the file note. */
  unit: "g" | "ml" | null;
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
  const leftovers = (used: Set<number>): string[] =>
    tokens.filter((tok, i) =>
      !used.has(i) &&
      !NUMBER_RE.test(tok) &&
      !isMassUnit(tok) &&
      !v.times.includes(tok.toLowerCase()));
  const facts: QuickAddMacros["facts"] = {};
  let found = false;
  /** did any field bind through a ONE-LETTER abbreviation? see the guard below */
  let viaAbbrev = false;
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
    if (tokens[i]!.length === 1) viaAbbrev = true;
    found = true;
  }
  if (!found) return null;

  // ── AN ABBREVIATION SURROUNDED BY PROSE IS A WORD ────────────────────────
  // A one-letter keyword exists for TERSE input — "40g p", "170 w" — and every
  // locale's short forms collide with something. Polish "w" (węglowodany) is
  // also the commonest preposition in the language, so "tuńczyk 170 g w oleju"
  // (tuna, 170 g, in oil) read as 170 g of carbohydrate and 680 kcal. German
  // "k" and English "c" have the same shape of problem.
  //
  // The tell is LEFTOVER NAME WORDS: a real macro line is only numbers, units
  // and keywords, so when a one-letter keyword bound a number and the line
  // still carries words the reading did not account for, this is a food line
  // and the caller should read it as one. Multi-letter keywords are unchanged —
  // "obiad 800 kcal" is still a macro line with a name in front of it.
  //
  // This matters more since the picker merged its two fields (food-picker.ts):
  // a misread used to cost a wrong row under a field whose search box still
  // worked, and now it costs the only input on the screen.
  const rest = leftovers(used);
  if (viaAbbrev && rest.length) return null;

  // A line naming only macros still has to log an energy figure, or the day's
  // ring would not move. 4·4·9 is the same derivation the manual form uses.
  let derivedKcal = false;
  if (facts.kcal == null) {
    const k = Math.round((facts.protein ?? 0) * 4 + (facts.carbs ?? 0) * 4 + (facts.fat ?? 0) * 9);
    if (k > 0) { facts.kcal = k; derivedKcal = true; }
  }
  return { kind: "macros", facts, derivedKcal, name: rest.join(" ").trim() };
}

/** Food lookup: a name, and how much of it. */
function readFood(tokens: string[], v: QuickAddVocab): QuickAddFood | QuickAddUnknown {
  let amount: number | null = null;
  let measure: "g" | "ml" | null = null;
  let count: number | null = null;
  const nameParts: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    if (v.times.includes(tok.toLowerCase())) continue; // the "x" in "2 x whey"
    if (!NUMBER_RE.test(tok)) {
      // A unit with no number in front of it is not a unit, it is a word.
      if (UNITS[tok.toLowerCase()] !== undefined && (amount != null || count != null)) continue;
      nameParts.push(tok);
      continue;
    }
    const n = num(tok);
    const next = tokens[i + 1]?.toLowerCase();
    const u = next != null ? UNITS[next] : undefined;
    if (u != null) { amount = n * u.factor; measure = u.measure; i++; }
    else count = n;
  }

  const query = nameParts.join(" ").trim();
  if (!query) return { kind: "unknown" };
  if (amount != null && measure != null) return { kind: "food", query, amount: Math.round(amount * 10) / 10, unit: measure };
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
  /** where it came from — decides the tie-break, see `rank`, AND is what the
   *  picker prints beside the row (see food-picker.ts PROVENANCE_KEY): once one
   *  ranked list mixes all four sources, a row that cannot say where it came
   *  from is a row the reader has to guess about. */
  source: QuickAddSource;
  verifiedId?: string | null;
}

/** The four lists the athlete's own food lives in, and the order the picker
 *  shows them in. A favourite is its own source rather than a flag because it
 *  ranks differently: a food you starred is a better answer to two words than
 *  one you saved and never used. */
export type QuickAddSource = "recent" | "favorite" | "product" | "meal";

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
 *  to a two-word phrase than one you saved in March and never used. Favourites
 *  sit just under recents — starring one is the athlete saying it matters — and
 *  the gaps stay small enough that a better NAME match always outranks a better
 *  source (0.85 for a prefix hit against 0.06 here). */
const SOURCE_RANK: Record<QuickAddSource, number> = { recent: 0.06, favorite: 0.045, product: 0.03, meal: 0 };

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
 * A count is a count. An AMOUNT converts through the food's own measure — the
 * same `portionMeasure` the portion editor's unit switch is built from, so one
 * food cannot mean two things depending on which control you reached for. When
 * the food has no measure, or has one in the OTHER dimension, the answer is
 * unknown and says so rather than quietly becoming 1 (or quietly becoming a
 * density nobody supplied).
 */
function quantityFor(parsed: QuickAddFood, c: QuickAddCandidate): { qty: number; needsPortion: boolean } {
  if (parsed.unit == null) return { qty: parsed.amount, needsPortion: false };
  const measure = portionMeasure({ serving: c.servingLabel, servingGrams: c.servingGrams });
  if (!measure || measure.unit !== parsed.unit) return { qty: 1, needsPortion: true };
  return { qty: Math.round((parsed.amount / measure.perServing) * 100) / 100, needsPortion: false };
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
  /** the food's own serving, so the caller can write it back to the recents
   *  MRU — whose identity is the food PLUS its serving. A macro line has no
   *  food behind it and so no serving; it does not belong in the MRU. */
  serving: string | null;
  servingGrams: number | null;
}

export function quickAddDraft(match: QuickAddMatch): QuickAddDraft {
  const c = match.candidate;
  return {
    name: c.name,
    subname: c.subname ?? null,
    facts: c.facts,
    qty: match.qty,
    verifiedId: c.verifiedId ?? null,
    serving: c.servingLabel,
    servingGrams: c.servingGrams ?? null,
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
    serving: null,
    servingGrams: null,
  };
}
