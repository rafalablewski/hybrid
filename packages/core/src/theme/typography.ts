/**
 * THE NAMED TYPE STYLES — the layer the scale never had.
 *
 * `scale.ts` gives the app its PRIMITIVES: `fs` (11 size rungs), `lh` (leading
 * ratios), `tracking`, `trackFigure`, `TABULAR_NUMS`. Those are correct and this
 * file does not restate any of them — it COMPOSES them into the styles call
 * sites actually want, which is the piece that was missing.
 *
 * WHY THAT GAP MATTERS. `fs.caption` has 591 call sites on mobile alone, and
 * every one of them independently decides the face, the weight, the leading and
 * the ink that go with it. The size is a token; "a caption" is not. So the app
 * has one caption SIZE and a spread of caption STYLES, which is the same class
 * of drift `trackFigure` found in twelve hand-multiplied letterSpacings and
 * `sheetPadBottom` found in four bottom pads — one intent, many spellings,
 * correct at none of them.
 *
 * A named style is also what makes a face swap a one-line change. Migrating the
 * product from Archivo to Söhne is 2,274 call sites if the face is chosen at the
 * call site, and two constants if it is chosen here.
 *
 * ── WHAT THIS FILE DELIBERATELY DOES NOT DO ─────────────────────────────────
 *
 * It does not re-declare `fs`, `lh` or `tracking`, and it does not fork them.
 * A style holds the ROLE NAMES and resolves through the existing maps, so a
 * change to a rung still moves everything that references it. A second copy of
 * the ladder here would be exactly the dead-token failure `condensed` and `card`
 * were deleted for.
 *
 * It does not carry COLOUR. Ink is a theme concern (`palette.ts` chalk / ash)
 * and it changes per surface; a style that hard-coded an ink could not be used
 * on a card and on the page ground. `ink` names the ROLE and the renderer
 * resolves it against the active palette.
 *
 * Tracking is still in dp, because `tracking` is. The spec calls for em
 * (`reference/typography-system.html` §07, migration step 2) and the conversion
 * is a genuine no-op at current sizes — `tracking.label` 0.9dp at fs.micro is
 * 0.082em, `caps` 1.2dp is 0.109em — but it moves 525 call sites and belongs in
 * its own change, verified on its own. Figures already track proportionally via
 * `trackFigure`.
 */

import { fs, lh, tracking, trackFigure, type LeadingRole, type TrackingRole, type TypeRole } from "../scale";
import { fonts } from "./tokens";

/**
 * THE TWO CUTS, AND THE RULE THAT PICKS BETWEEN THEM.
 *
 * `sans` sets every word a person wrote. `mono` sets every value a machine
 * measured. That is the whole decision procedure, and it is why the app can be
 * read at arm's length: monospaced texture means "this is a reading from the
 * world" before a single glyph is identified.
 *
 * The test for a borderline case is NOT "did a machine produce it" — a coach's
 * note is typed and a tempo is prescribed. It is: **is this a value with a fixed
 * format that a person parses positionally?** `3-1-1-0`, `5:12`, `RPE 8` and
 * `24 × 8` all pass. A sentence containing a number does not, and its number
 * stays in `sans`, proportional — a figure in prose is prose.
 */
export const cut = {
  sans: fonts.display,
  mono: fonts.mono,
} as const;

export type Cut = keyof typeof cut;

/**
 * FOUR WEIGHTS, AND MONO STOPS AT 600.
 *
 * The names are the product's, not the foundry's, so a face swap does not
 * rename every call site: `semibold` is Archivo SemiBold today and Söhne
 * Halbfett after the migration.
 *
 * WHY `bold` IS BANNED IN MONO. Every glyph in a monospaced face already sits
 * on the same advance, so weight is the only axis left to close a counter with.
 * At `fs.metric` a mono 700's 8, 9, 6 and 0 converge at arm's length — which is
 * the exact distance and the exact figures this product is read at. 600 is the
 * ceiling and the digits are more legible for it.
 *
 * NOTE THE MAPPING IS NOT IDENTITY. The app's display face runs to 900 (294
 * call sites of `F.black`) and Söhne's equivalent display weight is 700; Söhne's
 * Kräftig sits heavier than Archivo's SemiBold, so 600 → 500 and 700 → 600 when
 * the face changes. Those are FACE-RELATIVE corrections and belong to the swap,
 * not to this table — which is the point of naming the weights by role.
 */
export const weight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  /** Display only — 26dp and up, and never in `mono`. */
  bold: 700,
} as const;

export type WeightRole = keyof typeof weight;

/**
 * A STANDALONE FIGURE SETS SOLID — the leading rung `lh` was missing.
 *
 * `lh.tight` (1.15) is the smallest ratio the scale offers, and on a figure it
 * still buys 7dp of line box at `fs.stat` that nothing will ever occupy: a
 * figure has no second line, and its digits carry neither ascender nor
 * descender beyond the cap band. Across a row of four stat tiles that is a
 * visible band of nothing which no amount of padding adjustment explains,
 * because the space is INSIDE the text node.
 *
 * Additive on purpose. `lh` keeps its four rungs and every existing caller is
 * untouched; this is the fifth, and it is only ever correct on a figure that
 * cannot wrap. Text takes a ratio from `lh`.
 */
export const FLUSH = 1.0;

/** The ink a style asks for, resolved by the renderer against the live palette
 *  (`chalk` / `ash` in `ThemePalette`). Kept as a ROLE because a style is used
 *  on the page ground and on a card, and neither owns the other's ink. */
export type InkRole = "primary" | "secondary";

export interface TextStyle {
  cut: Cut;
  weight: number;
  /** A rung in `fs` — never a raw number. */
  size: TypeRole;
  /** A ratio in `lh`, or `FLUSH` for a figure that cannot wrap. */
  leading: LeadingRole | typeof FLUSH;
  /** A role in `tracking`, or `"figure"` for the proportional big-figure
   *  tightening (`trackFigure(size)` — see scale.ts). */
  tracking: TrackingRole | "figure";
  ink: InkRole;
  /** Numerals line up in a column. True for every measured value. */
  tabular?: boolean;
  /** Rendered uppercase. Only ever legal on `mono` at `nano` / `micro`. */
  upper?: boolean;
}

/**
 * THE STYLES. One ladder — a figure and the heading beside it are the SAME rung
 * in a different cut, which is what makes them optically related by
 * construction rather than by somebody checking.
 *
 * There is deliberately NO parallel numeric scale. The first cut of this file
 * had one, with five figure sizes of its own; every one landed on a rung that
 * already existed, so it was two names for each size and a standing invitation
 * for the two ladders to drift.
 *
 * `fs.note` (15) and `fs.heading` (20) are absent, and their absence is the
 * point: three reading sizes inside 2dp and two section sizes one rung apart
 * were never chosen, they accumulated. Neither rung is referenced here, so
 * anything migrated onto a named style leaves them behind automatically.
 */
export const text = {
  // ── FIGURES — the mono cut ────────────────────────────────────────────────
  /** THE one hero figure on a screen. A second means neither is the answer. */
  metric: { cut: "mono", weight: weight.semibold, size: "stat", leading: FLUSH, tracking: "figure", ink: "primary", tabular: true },
  /** A card's KPI. */
  figureLg: { cut: "mono", weight: weight.semibold, size: "display", leading: FLUSH, tracking: "figure", ink: "primary", tabular: true },
  /** A tile figure, a ranking. */
  figure: { cut: "mono", weight: weight.semibold, size: "headline", leading: FLUSH, tracking: "figure", ink: "primary", tabular: true },
  /** A figure in a row or a table cell. */
  figureSm: { cut: "mono", weight: weight.semibold, size: "bodyLg", leading: "snug", tracking: "normal", ink: "primary", tabular: true },
  /**
   * A READOUT — the world reporting itself, at one weight below a result.
   * This is the system's one semantic weight distinction and it is worth the
   * token: a clock, a heart rate, a timestamp are `readout`; a load, a total,
   * a PR, an index are `figure`. It means a screen full of numbers still has a
   * subject.
   */
  readout: { cut: "mono", weight: weight.medium, size: "headline", leading: FLUSH, tracking: "figure", ink: "primary", tabular: true },
  /** A quiet figure — a logged set, a chart axis, a row's secondary number. */
  datum: { cut: "mono", weight: weight.regular, size: "body", leading: "snug", tracking: "normal", ink: "secondary", tabular: true },

  // ── LANGUAGE — the sans cut ───────────────────────────────────────────────
  hero: { cut: "sans", weight: weight.bold, size: "hero", leading: "tight", tracking: "display", ink: "primary" },
  display: { cut: "sans", weight: weight.semibold, size: "display", leading: "tight", tracking: "display", ink: "primary" },
  headline: { cut: "sans", weight: weight.semibold, size: "headline", leading: "snug", tracking: "display", ink: "primary" },
  /** Section titles — the house standard (the Explore tab's SectionHead). */
  title: { cut: "sans", weight: weight.semibold, size: "title", leading: "snug", tracking: "display", ink: "primary" },
  subtitle: { cut: "sans", weight: weight.semibold, size: "subtitle", leading: "snug", tracking: "display", ink: "primary" },
  /** Primary list line, emphasised body. */
  bodyLg: { cut: "sans", weight: weight.medium, size: "bodyLg", leading: "snug", tracking: "normal", ink: "primary" },
  /** Default reading text. The floor for prose. */
  body: { cut: "sans", weight: weight.regular, size: "body", leading: "normal", tracking: "normal", ink: "primary" },
  /** Long-form: empty states, AI insight paragraphs. Primary ink — an insight
   *  the athlete has to hunt for is not an insight. */
  prose: { cut: "sans", weight: weight.regular, size: "body", leading: "relaxed", tracking: "normal", ink: "primary" },
  /** Metadata — a timestamp, a device name, a source. */
  caption: { cut: "sans", weight: weight.regular, size: "caption", leading: "normal", tracking: "normal", ink: "secondary" },
  /** A small label inside a dense row. */
  labelSm: { cut: "sans", weight: weight.medium, size: "micro", leading: "snug", tracking: "normal", ink: "secondary" },
  /** THE EYEBROW — the app's dominant label voice, 216 call sites' worth. */
  overline: { cut: "mono", weight: weight.medium, size: "nano", leading: "snug", tracking: "caps", ink: "secondary", upper: true },
} as const satisfies Record<string, TextStyle>;

export type TextToken = keyof typeof text;

/** Resolved absolute values for a style — what a renderer actually needs.
 *  Sizes are dp on RN and px on web, exactly as `fs` already is. */
export interface ResolvedText {
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  ink: InkRole;
  tabular: boolean;
  upper: boolean;
}

/**
 * Resolve a named style to absolute values.
 *
 * `scaleFactor` carries Dynamic Type / a desktop rung promotion: the SIZE moves
 * and the leading moves WITH it, because leading here is a ratio rather than the
 * absolute dp that made Dynamic Type impossible before `leading()` existed.
 * Tracking follows too for figures (`trackFigure` is proportional) and does not
 * for text (`tracking` is still dp — see the file header).
 */
export function resolveText(token: TextToken, scaleFactor = 1): ResolvedText {
  const s = text[token] as TextStyle;
  const size = Math.round(fs[s.size] * scaleFactor);
  const ratio = s.leading === FLUSH ? FLUSH : lh[s.leading];
  return {
    fontFamily: cut[s.cut],
    fontWeight: s.weight,
    fontSize: size,
    lineHeight: Math.round(size * ratio),
    letterSpacing: s.tracking === "figure" ? trackFigure(size) : tracking[s.tracking],
    ink: s.ink,
    tabular: s.tabular ?? false,
    upper: s.upper ?? false,
  };
}

/**
 * A UNIT IS DERIVED FROM ITS FIGURE — never declared beside it.
 *
 * THE LAW: the figure is mono, the unit is not. A measured value is the
 * subject; `kg` is a caption attached to it. They must differ in face, weight,
 * size and ink, because at a glance the athlete has to see a NUMBER, not a
 * string — and if the unit is set in the same mono at the same weight, "92.4kg"
 * reads as one seven-character token and the figure stops being scannable.
 *
 * Derived rather than declared because a unit's size is a RATIO of its figure's
 * and there are six figure rungs. Six hand-typed unit sizes is how the twelve
 * figure trackings happened.
 *
 * THE 0.42 IS THE MEASURED RATIO, not a round number: it is where a unit stays
 * clearly subordinate at `fs.stat` (46 → 19) while still clearing the 11dp
 * label floor at `fs.bodyLg` (14 → 11, at the clamp). Below `figureSm` a unit
 * would fall under that floor, which is why the clamp is a floor and not a
 * suggestion.
 */
export const UNIT_RATIO = 0.42;

/** Units that BIND TIGHT — no gap between figure and unit.
 *  These are not units in the SI sense but modifiers of the figure itself, and
 *  typographic convention has always set them closed up: `87%`, not `87 %`. */
export const TIGHT_UNITS = ["%", "°", "′", "″"] as const;

export interface ResolvedUnit {
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  ink: InkRole;
  /** Gap between figure and unit, in em of the FIGURE's size. */
  gapEm: number;
}

/** The unit style for a figure of `figureSize` dp. Pass the unit's own text so
 *  the tight set is handled here rather than at every call site. */
export function unitFor(figureSize: number, unit?: string): ResolvedUnit {
  const tight = unit != null && (TIGHT_UNITS as readonly string[]).includes(unit);
  return {
    fontFamily: cut.sans,
    fontWeight: weight.medium,
    fontSize: Math.min(fs.subtitle, Math.max(fs.micro, Math.round(figureSize * UNIT_RATIO))),
    ink: "secondary",
    gapEm: tight ? 0 : 0.25,
  };
}

/**
 * THE MULTIPLICATION SIGN, once.
 *
 * `100 kg × 5` is the product's most-read string and the × is U+00D7 — not the
 * letter x, which is a glyph from a different alphabet doing an impression of an
 * operator, and not `*`. It is set in `sans` at `regular` in SECONDARY ink so
 * the two figures read as a pair with the operator receding between them; drawn
 * at figure weight it competes with both.
 */
export const TIMES = "×";
