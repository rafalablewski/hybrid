/**
 * THE FOOD PICKER — one field, one ranked answer.
 *
 * The add-to-meal screen used to ask the same question twice: a quick-add field
 * that parsed what you ate, and, ninety pixels below it, a search box in the
 * same shape with the same left-hand glyph. Two inputs stacked is the interface
 * admitting it does not know which question it is asking, and it made the
 * athlete choose a MECHANISM before they had said a word.
 *
 * There is now one field, and this module is what it thinks.
 *
 * ── IT IS STILL THE GRAMMAR, NOT A SECOND SEARCH ──────────────────────────
 * Quick add is not removed; it is what the field does FIRST. `pickerAnswer`
 * runs the same `parseQuickAdd` grammar over the text, so "40g protein" is
 * still a macro line and "chicken 200g" is still two servings of the chicken
 * this athlete eats. Only when the phrase names a food does it become a query,
 * and then it is ranked — never silently logged (see quick-add.ts).
 *
 * ── RANKED ACROSS ALL FOUR SOURCES ────────────────────────────────────────
 * Recent, Favorites, Meals and Foods all stay, and the screen still lets you
 * browse each one. But the moment you type, the answer ranks across ALL FOUR AT
 * ONCE: today you have to know which list a food is in before you can look for
 * it, and the honest answer is usually "the one I'm not on". That is only
 * legible if each row says where it came from, which is what `PROVENANCE_KEY`
 * is for — one list mixing four sources without saying so is worse than four
 * lists, not better.
 *
 * ── THE NETWORK IS THE LAST RESORT, NOT THE FIRST ─────────────────────────
 * `pickerRemoteQuery` is deliberately narrow. A macro line never reaches the
 * network — there is no food in "40g protein" to look up — and neither does a
 * single character. The community database answers only when the athlete's own
 * foods could not, which is also the ranking the screen shows: yours first,
 * the world under a section head.
 *
 * Pure + unit-tested, and shared, so the phone and the browser cannot disagree
 * about what one field means (parity rule).
 */

import {
  parseQuickAdd,
  resolveQuickAdd,
  QUICK_ADD_VOCAB,
  type QuickAddCandidate,
  type QuickAddMacros,
  type QuickAddMatch,
  type QuickAddSource,
  type QuickAddVocab,
} from "./quick-add";

/* ── THE FOUR SOURCES ─────────────────────────────────────────────────────── */

/** The keys the picker's source line shows, in the order it shows them. These
 *  are the tab keys the screen already used — the four lists are unchanged,
 *  only the control drawn around them is. */
export type PickerSourceKey = "recent" | "favorites" | "meals" | "personal";

/** ORDER IS PART OF THE CONTRACT: most recently useful first, the long tail
 *  last. Shared so the two clients cannot list them differently. */
export const PICKER_SOURCES: readonly PickerSourceKey[] = ["recent", "favorites", "meals", "personal"];

/** The source line's label for a key. The same i18n keys the tabs used, so no
 *  copy moves and no locale is left behind. */
export const pickerSourceLabelKey = (key: PickerSourceKey): string =>
  `w.recovery.nutrition.tab.${key}`;

/** What a ranked row prints on its right, once one list mixes four sources. */
export const PROVENANCE_KEY: Record<QuickAddSource, string> = {
  recent: "w.recovery.nutrition.tab.recent",
  favorite: "w.recovery.nutrition.tab.favorites",
  meal: "w.recovery.nutrition.tab.meals",
  product: "w.recovery.nutrition.tab.personal",
};

/* ── ONE FOOD, ONE ROW ────────────────────────────────────────────────────── */

/** Accent-folded, case-folded — the same fold quick-add and the verified search
 *  already apply, so "Twaróg" and "twarog" are one food here too. */
const foldName = (s: string): string =>
  s.toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/**
 * Collapse the same food appearing in several of the four sources.
 *
 * The four lists OVERLAP by design: a product you starred and logged yesterday
 * is legitimately in Foods, Favorites and Recent all at once. That is fine while
 * you are browsing one list at a time — it is exactly what those lists mean —
 * but the moment one ranked answer draws from all four, it would print that food
 * three times, and three identical rows is the interface looking broken rather
 * than looking thorough.
 *
 * FIRST OCCURRENCE WINS, so the caller passes candidates in source-rank order
 * (recent, favourite, product, meal) and the row keeps the provenance that
 * ranked it. Identity is the folded NAME plus the serving label, not the id:
 * a recent is written from a product and carries a different id for the same
 * food, which is precisely the duplicate this exists to remove.
 */
export function dedupeCandidates(candidates: QuickAddCandidate[]): QuickAddCandidate[] {
  const seen = new Set<string>();
  const out: QuickAddCandidate[] = [];
  for (const c of candidates) {
    const key = `${foldName(c.name)}|${foldName(c.servingLabel)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/* ── THE ANSWER ───────────────────────────────────────────────────────────── */

export type PickerAnswer =
  /** nothing typed — the screen browses the four sources instead */
  | { kind: "resting" }
  /** a macro line: "40g protein", "500 kcal". No food, so no lookup. */
  | { kind: "macros"; macros: QuickAddMacros; query: null }
  /** a named food, ranked against everything the athlete has saved. `matches`
   *  may be empty — that is a real answer ("nothing of yours matches"), and the
   *  caller falls through to the community database and the create tail. */
  | { kind: "matches"; query: string; matches: QuickAddMatch[] };

export interface PickerOptions {
  /** the athlete's own words — see quickAddVocab(t) */
  vocab?: QuickAddVocab;
  /** how many of their own foods to rank. The picker is a whole screen now, not
   *  a three-row peek under a field, so this is deliberately larger than
   *  resolveQuickAdd's own default. */
  limit?: number;
}

/**
 * What one field means, given what has been typed into it.
 *
 * The text is read ONCE, by the grammar, and the result decides everything
 * downstream: which rows the screen draws, whether the network is touched, and
 * what Enter commits.
 */
export function pickerAnswer(
  text: string,
  candidates: QuickAddCandidate[],
  opts: PickerOptions = {},
): PickerAnswer {
  const raw = text.trim();
  if (!raw) return { kind: "resting" };

  const parsed = parseQuickAdd(raw, opts.vocab ?? QUICK_ADD_VOCAB);
  if (parsed.kind === "macros") return { kind: "macros", macros: parsed, query: null };

  // `unknown` is a phrase with no name in it — bare digits, most usefully a
  // typed barcode. It has nothing to rank against the library, but it is still
  // a perfectly good thing to ask the database, so the RAW text carries on as
  // the query rather than being dropped on the floor.
  // A leading "+" is the grammar's optional opener ("+ 40g protein"), so it is
  // not part of the question — sending it to the database, or quoting it back in
  // the create door's label, would show the athlete punctuation they meant as a
  // gesture.
  const query = parsed.kind === "food" ? parsed.query : raw.replace(/^\+\s*/, "");
  const matches = parsed.kind === "food"
    ? resolveQuickAdd(parsed, candidates, opts.limit ?? 8)
    : [];
  return { kind: "matches", query, matches };
}

/**
 * The query to send to the community database, or null for "don't".
 *
 * Narrow on purpose: a macro line has no food to look up, and one character is
 * not a search — it is the first keystroke of one. Firing on either would spend
 * a round trip to answer a question nobody asked.
 */
export function pickerRemoteQuery(answer: PickerAnswer, minLength = 2): string | null {
  if (answer.kind !== "matches") return null;
  return answer.query.length >= minLength ? answer.query : null;
}

/**
 * What Enter commits: the FIRST interpretation, which is the one on screen —
 * never a second-best the reader cannot see.
 *
 * `portion` means the quantity could not be computed (grams against a food with
 * no serving weight on record), so the caller opens the portion editor rather
 * than logging a number nobody worked out.
 */
export type PickerSubmit =
  | { kind: "macros"; macros: QuickAddMacros }
  | { kind: "log"; match: QuickAddMatch }
  | { kind: "portion"; match: QuickAddMatch }
  | { kind: "none" };

export function pickerSubmit(answer: PickerAnswer): PickerSubmit {
  if (answer.kind === "macros") return { kind: "macros", macros: answer.macros };
  if (answer.kind === "matches") {
    const first = answer.matches[0];
    if (first) return first.needsPortion ? { kind: "portion", match: first } : { kind: "log", match: first };
  }
  return { kind: "none" };
}
