/**
 * WHAT THE DAY STILL OWES.
 *
 * Nobody opens the food picker to search. They open it because the day still
 * owes them something — and until now the picker never said what. The figure
 * lived one screen away on the hub's ring, and the arithmetic behind it lived
 * INLINE in both clients, under two different names for the same constant
 * (KCAL_OVER_THRESHOLD on the phone, KCAL_OVER_FACTOR in the browser). Two
 * copies of one sum is how the ring and the header end up disagreeing about
 * whether you are over.
 *
 * ── A TARGET YOU DO NOT HAVE IS NOT A GAP ─────────────────────────────────
 * `nutritionGap` returns NULL when there is no usable energy target, and the
 * caller renders nothing. That is the same discipline the targets card already
 * follows: until maintenance can be estimated from the athlete's own weight
 * trend, the screen asks for a weigh-in rather than presenting a population
 * default as a personal number. A header reading "2 000 left" against a target
 * nobody set would be a confident wrong number, which is the failure this
 * codebase is built to avoid.
 *
 * ── A MACRO NOBODY SET STAYS UNSET ────────────────────────────────────────
 * Per-field manual targets mean protein can be fixed while carbs keep adapting
 * (see nutrition-targets.ts). A macro with no target reports `want: null` and
 * is skipped by the caller — never drawn as a bar at 0 %, which would read as
 * "you have eaten none of your carbs" when the truth is "you have no carb
 * target".
 *
 * ── OVER IS A BAND, NOT A LINE ────────────────────────────────────────────
 * Landing on 2 003 against 2 000 is not overeating, it is arithmetic. The 5 %
 * tolerance is the one both clients were already applying to the ring; it lives
 * here now so they cannot drift apart on where "over" begins.
 *
 * Pure + unit-tested, and shared (parity rule).
 */

/** Where "over" begins: 5 % past the target, not one kilocalorie past it. */
export const KCAL_OVER_TOLERANCE = 1.05;

export type GapMacroKey = "protein" | "carbs" | "fat";
export const GAP_MACROS: readonly GapMacroKey[] = ["protein", "carbs", "fat"];

export interface GapFigure {
  have: number;
  /** null when no target is set for this figure — never 0, which is a target */
  want: number | null;
  /** want − have; null when there is no target. Negative means over. */
  left: number | null;
  /** 0–100, clamped for drawing. 0 when there is no target. */
  pct: number;
  /** past the tolerance band, not merely past the number */
  over: boolean;
}

export interface NutritionGap {
  kcal: GapFigure;
  macros: { key: GapMacroKey; figure: GapFigure }[];
}

export interface MacroTotals {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

const usable = (n: number | null | undefined): n is number =>
  typeof n === "number" && Number.isFinite(n) && n > 0;

/**
 * ONE logged figure against ONE target.
 *
 * Exported because it is the arithmetic behind every `have / want` in the app,
 * and the second screen to draw those figures (the diary's day card) must not
 * re-derive it: a percentage computed twice is a meter and a ring disagreeing
 * about the same day, which is the drift `nutritionGap` was written to end.
 */
export function gapFigure(
  have: number,
  want: number | null | undefined,
  tolerance = KCAL_OVER_TOLERANCE,
): GapFigure {
  const h = Number.isFinite(have) ? Math.max(0, have) : 0;
  if (!usable(want)) return { have: h, want: null, left: null, pct: 0, over: false };
  return {
    have: h,
    want,
    left: Math.round(want - h),
    pct: Math.min(100, Math.max(0, (h / want) * 100)),
    over: h > want * tolerance,
  };
}

/**
 * THE FIGURE'S ONE SPELLING — `have/want`, both rounded, no spaces, no unit.
 *
 * Five surfaces state a logged figure against its target and, before this, four
 * of them spelled it differently: the ledger wrote `118/150`, the hub's macro
 * meters `118 / 150 g`, the hub's ring `1675 / 2325`, the Today sheet
 * `1675 / 2325 kcal today`. A reader crossing two screens has to work out
 * whether the `g` and the spaces mean something. They do not.
 *
 * The UNIT is the label's job (a macro is grams, kcal says kcal), so the figure
 * carries none. Both halves are ROUNDED here rather than at each call site: an
 * overridden target is taken exactly as typed (nutrition-targets.ts), so a
 * target of 2325.5 would otherwise reach the glass wherever a call site
 * interpolated it raw — as two of them did.
 *
 * No target is not a target of zero: with none, the figure states the amount
 * alone, and its caller draws no track.
 */
export function figureText(have: number, want?: number | null): string {
  const h = Math.round(Number.isFinite(have) ? Math.max(0, have) : 0);
  return usable(want) ? `${h}/${Math.round(want)}` : String(h);
}

/**
 * The day's four figures, whether or not there is a target behind them.
 *
 * This is what a RECORD of a day needs — the diary lists what was eaten and
 * says which of it was measured against something. A figure nobody set a target
 * for still reports `want: null`, so the caller draws the amount and no track;
 * it is never a bar at 0 %.
 */
export function nutritionFigures(
  have: MacroTotals,
  want: Partial<MacroTotals> | null | undefined,
  tolerance = KCAL_OVER_TOLERANCE,
): NutritionGap {
  return {
    kcal: gapFigure(have.kcal, want?.kcal, tolerance),
    macros: GAP_MACROS.map((key) => ({ key, figure: gapFigure(have[key], want?.[key], tolerance) })),
  };
}

/**
 * What is left of today, against the targets in force.
 *
 * `null` means "no energy target yet" — the caller shows nothing rather than a
 * number nobody set. That guard is the ONLY thing between this and
 * `nutritionFigures`: a screen about the GAP needs a target to have a subject,
 * a screen about the DAY does not.
 */
export function nutritionGap(
  have: MacroTotals,
  want: Partial<MacroTotals> | null | undefined,
  tolerance = KCAL_OVER_TOLERANCE,
): NutritionGap | null {
  if (!want || !usable(want.kcal)) return null;
  return nutritionFigures(have, want, tolerance);
}

/**
 * Would logging this take the day past its energy target?
 *
 * Used to mark a row that would put the athlete over — the one piece of
 * information the row cannot already be read off the screen, since it needs
 * today's running total and the target as well as the food's own figure. It is
 * a STATEMENT, never a block: an athlete who wants the extra 400 kcal is not
 * asking permission.
 */
export function wouldOvershoot(gap: NutritionGap | null, kcal: number, tolerance = KCAL_OVER_TOLERANCE): boolean {
  if (!gap || gap.kcal.want == null) return false;
  if (!Number.isFinite(kcal) || kcal <= 0) return false;
  return gap.kcal.have + kcal > gap.kcal.want * tolerance;
}
