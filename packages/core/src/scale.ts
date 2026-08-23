// Shared TYPE + SPACING scale — the single source of truth for sizing across
// BOTH clients (web + mobile). Before this, every fontSize/gap was an inline
// magic number duplicated in two separate trees with no shared definition,
// which is exactly how the admin console drifted ~1px smaller than the consumer
// app (same widths, smaller text → it read miniature). Screens now reference a
// named rung (fs.body, space.lg) so the two surfaces can't silently diverge.
//
// ONE map serves both clients. The data showed web and mobile already use the
// SAME integer ladder (11/12/13/14/16/18/26 …); they differed only in WHICH
// rungs each screen picked, not in the rungs available — so a single map is both
// accurate and the strongest guarantee against drift. If a genuine per-platform
// need ever appears, split into WEB_FS / MOBILE_FS here and the call sites
// (fs.body, …) won't have to change.

import { SOHNE, SERIF_SIZE_RATIO, FIGURE_INK_EM, inkSpan, ITC_GARAMOND } from "./theme/face-metrics";

/**
 * RE-EXPORTED so the ONE place a font metric is written down stays
 * theme/face-metrics.ts. These were literals here until Aug 2026, and the serif
 * one was wrong: 0.445 against the binary's measured 0.4409.
 */
export { SERIF_SIZE_RATIO };
/** @deprecated The name says x-height; the thing is a SIZE ratio. Use `SERIF_SIZE_RATIO`. */
export const SERIF_X_HEIGHT_RATIO = SERIF_SIZE_RATIO;
export const X_HEIGHT_EM = { sans: SOHNE.buch.xHeight, serif: ITC_GARAMOND.book.xHeight } as const;

export type TypeRole =
  | "nano" //    10 — micro mono eyebrow labels (uppercase, tracked)
  | "micro" //   11 — tiny secondary labels
  | "caption" // 13 — meta / secondary text
  | "body" //    14 — default reading text
  | "bodyLg" //  16 — emphasised body / primary list line. THE REFERENCE RUNG.
  | "subtitle" //18 — small headings
  | "title" //   20 — section titles
  | "headline" //22 — screen sub-headings, and the head of a screen with no hero
  | "display" // 28 — screen headings
  | "hero" //    35 — mastheads / cover titles
  | "stat" //    49 — the one hero figure on a screen (ring kcal, exercise 1RM)
  | "editorial"; // 33 — SERIF ONLY. Derived from `display`; see the note under `fs`.

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE MODULAR LADDER — one ratio, one reference size, every rung derived.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * WHAT WAS HERE BEFORE, AND WHY IT HAD TO GO. The ladder was 10, 11, 12, 13, 14,
 * 16, 18, 22, 26, 34, 46 — an accumulation, not a scale. Consecutive ratios ran
 * 1.100, 1.091, 1.083, 1.077, 1.143, 1.125, 1.222, 1.182, 1.308, 1.353: four
 * one-dp steps at the bottom, where the file's own rule says "adjacent rungs are
 * not hierarchy", and two enormous ones at the top. Nothing generated it, so
 * nothing could say whether a new rung belonged, which is exactly how it grew
 * the `note` (15) and `heading` (20) rungs that were later deleted for having
 * never been chosen.
 *
 * ── THE RATIO: a MAJOR THIRD, 1.25, taken in half-steps ────────────────────
 *
 * `STEP` is √1.25 = 1.118034, so every rung is 1.25^(n/2) and the ladder is one
 * ratio throughout. The golden ratio was measured and rejected: φ from a 16dp
 * body puts the next rung at 25.9 and the one after at 41.9, which cannot
 * furnish a UI — an interface needs a rung between a list row and a section
 * title, and φ has none to give.
 *
 * GRANULARITY FOLLOWS THE EYE, and that is why the ladder uses two intervals of
 * the SAME ratio rather than two ratios:
 *
 *   READING / UI BAND (nano → headline) — consecutive HALF-steps, 11.8% apart.
 *     These sizes are read, not seen, and they sit in dense layouts where a
 *     rung has to land near a specific dp. Rank down here is carried by INK and
 *     WEIGHT (a caption is secondary ash; a body line is primary chalk), not by
 *     size — at 13dp against 14dp no size difference can signal rank anyway, so
 *     the rungs exist to give each role its right optical size and nothing more.
 *
 *   DISPLAY BAND (headline → display → hero) — FULL steps, 25% apart. Up here
 *     type is seen before it is read and size IS the hierarchy, so each level
 *     has to be unmistakable across a room.
 *
 *   THE HERO FIGURE (hero → stat) — a step and a HALF, 39.7%. `stat` is the one
 *     figure on a screen that answers the question the athlete opened the screen
 *     with, and it has to beat a masthead sitting above it, not tie with it.
 *
 * ── THE REFERENCE SIZE: 16, AND IT IS MEASURED RATHER THAN PICKED ──────────
 *
 * 16dp is the size Söhne is FITTED FOR — the size at which the sidebearings
 * Klim drew are the sidebearings you want, so it is the one size on the ladder
 * that needs no optical correction at all. That makes it the only defensible
 * seed, and it does a second job: `tracking()` below measures its correction as
 * a distance from this same 16, so the type scale and the optical-tracking curve
 * share one origin. One number, two axes, and they cannot drift apart.
 *
 * ── WHAT THIS MOVED, STATED PLAINLY ────────────────────────────────────────
 *
 *   caption 12 → 13   body 13 → 14   bodyLg 14 → 16   subtitle 16 → 18
 *   title   18 → 20   display 26 → 28   hero 34 → 35   stat 46 → 49
 *   nano, micro and headline do not move.
 *
 * The reading text of a training app gets bigger, and that is a second reason
 * for the change rather than a side effect of it: 13dp is iOS's *Footnote*, and
 * this product is read at arm's length, mid-set, by someone out of breath. The
 * cost is that layouts tuned by eye to the old rungs have ~10% more type to
 * hold; `fitMonoFigure` exists for the figures, and the rest is flex.
 */

/** The modular ratio — a major third. */
export const SCALE_RATIO = 1.25;
/** One rung: a HALF major third, √1.25. The ladder is `TYPE_REF × STEP^n`. */
export const STEP = Math.sqrt(SCALE_RATIO);
/**
 * The ladder's origin AND the tracking curve's zero: the size Söhne is drawn to
 * be set at. See `SOHNE.buch` in theme/face-metrics.ts.
 */
export const TYPE_REF = 16;

/** A rung `n` half-steps from the reference size, rounded to whole dp. */
export const rung = (n: number): number => Math.round(TYPE_REF * STEP ** n);

/**
 * Font-size scale. px on web, dp on RN.
 *
 * THE LADDER ENDS AT `stat` ON PURPOSE: there is no rung above it, so a figure
 * larger than it is a design smell, not a missing token.
 *
 * That was written as a rule and enforced by nothing, and the app answered with
 * nine figures above it: 48, 48, 52, 56, 60 and 68 (the portion sheet's kcal,
 * the exercise page's hero, the routine builder's minutes, the food page's
 * energy, the create-food kcal, the volume screen's in-range count) plus the
 * interval clock at 56. Every one of them was "the ONE hero figure on a screen"
 * — which is the definition of `stat`, written a rung and a half higher each
 * time somebody wanted it to feel important. A 42% spread over six sites is not
 * a missing rung, it is six unrelated guesses, exactly like the twelve figure
 * trackings `trackFigure` replaced. They are all `fs.stat` now.
 *
 * TWO THINGS ABOVE IT ARE NOT VIOLATIONS OF THIS, and naming them is what keeps
 * the rule honest instead of merely loud:
 *
 *   THE TAKEOVER FIGURE — `HERO_FIGURE` in hero.ts (76). `fs.stat` is the
 *     ceiling for a figure INSIDE A PAGE; the Wrapped's count-up is not inside
 *     a page, it IS the panel. It is one exported constant with the argument
 *     written next to it, which is the opposite of a hand-typed 68.
 *
 *   GLYPH ARTWORK — the watermark emoji bled off the corner of a recipe tile or
 *     a plan cover (78, 96, 118). Those carry no font face and no reading role;
 *     they are art sized to a card, and snapping them to a type rung would be
 *     applying a reading ladder to a picture.
 *
 * ── TWO RUNGS WERE RETIRED, Aug 2026, AND NEITHER WAS EVER CHOSEN ──────────
 *
 * `note` (15) sat between `body` and `bodyLg` — THREE reading sizes inside two
 * dp. Nobody can see the difference and nobody decided it; it accumulated,
 * which is the same way the app grew 29 lineHeights and 18 letterSpacings. Its
 * 190 sites are `bodyLg`, which the ladder already describes as the emphasised
 * body line, and a lead IS an emphasised body line.
 *
 * `heading` (20) and `headline` (22) were one job under two names, one rung
 * apart, with nothing to say which a screen sub-heading should take — so the
 * answer was whichever file you copied from. Its 63 sites are `headline`.
 *
 * THE GENERAL RULE this leaves behind, now that the ladder is generated: a
 * rung that is not `rung(n)` for an integer `n` is not a rung. There is nowhere
 * left to put a number that "felt right", which is the entire point.
 */
/**
 * WHERE EACH ROLE SITS ON THE LADDER, in half-steps from the reference size.
 *
 * The INDEX is the primary datum and the dp is derived from it — not the other
 * way round. That matters for one specific reason, and it is a bug that was
 * caught by a test rather than by reading: PROMOTING A ROUNDED SIZE IS NOT THE
 * SAME AS TAKING THE NEXT RUNG. `micro` is 11.45 rounded to 11; multiply that 11
 * by STEP and you get 12.3, while the next rung is 12.80 → 13. Double rounding
 * loses the half-dp that the exact ladder carries, so anything that walks the
 * ladder — the desktop promotion, a step-down ramp, a fitter — has to walk it in
 * INDICES. See `promote`.
 */
export const RUNG_INDEX: Record<Exclude<TypeRole, "editorial">, number> = {
  nano: -4, //    10.24  → 10
  micro: -3, //   11.45  → 11
  caption: -2, // 12.80  → 13
  body: -1, //    14.31  → 14
  bodyLg: 0, //   16.00  → 16   the reference rung
  subtitle: 1, // 17.89  → 18
  title: 2, //    20.00  → 20
  // `headline` was a MAGIC NUMBER before it was a token: 22 appeared 26 times in
  // apps/mobile with no name, and it is where a hand-rolled screen title lands —
  // bigger than a section heading, smaller than a display. Naming it does not
  // bless hand-rolled heads (those should take a HeroRank); it stops the ones
  // that exist from being 22 in one file and 21 or 24 in the next.
  headline: 3, //  22.36 → 22   ← the display band starts here
  display: 5, //   27.95 → 28
  hero: 7, //      34.94 → 35
  stat: 10, //     48.83 → 49
};

/**
 * THE ROLE ONE OR MORE STEPS ALONG THE LADDER, resolved exactly.
 *
 * `promote("body")` is 16 — `bodyLg`'s value, arrived at through the ladder
 * rather than through `fs.body × STEP` (which is 15.7 and rounds to 16 only by
 * luck; at `micro` the same arithmetic gives 12 where the ladder says 13).
 *
 * This is the desktop scale's whole implementation and the step-down ramp's too:
 * walking in indices means a promotion always LANDS ON A RUNG, so a promoted
 * ladder is the same ladder rather than a set of near-misses beside it.
 */
export const promote = (role: TypeRole, steps = 1): number =>
  role === "editorial"
    ? Math.round(promote("display", steps) * SERIF_SIZE_RATIO)
    : rung(RUNG_INDEX[role] + steps);

export const fs: Record<TypeRole, number> = {
  nano: rung(RUNG_INDEX.nano),
  micro: rung(RUNG_INDEX.micro),
  caption: rung(RUNG_INDEX.caption),
  body: rung(RUNG_INDEX.body),
  bodyLg: rung(RUNG_INDEX.bodyLg),
  subtitle: rung(RUNG_INDEX.subtitle),
  title: rung(RUNG_INDEX.title),
  headline: rung(RUNG_INDEX.headline),
  display: rung(RUNG_INDEX.display),
  hero: rung(RUNG_INDEX.hero),
  stat: rung(RUNG_INDEX.stat),
  /**
   * SERIF ONLY, and it is not a hole in the ladder — it is a second ladder with
   * one rung on it.
   *
   * DERIVED, NOT TYPED: `display` × `SERIF_SIZE_RATIO`, the x-height ratio read
   * off the two shipped binaries (theme/face-metrics.ts). 28 × 1.18621 is 33.2,
   * so 33. Move `display` and the serif follows it, which is the only way the
   * pairing survives a change to the sans ladder — a hard-coded value would have
   * silently stopped matching.
   *
   * THE PREVIOUS SPELLING ROUNDED TO EVEN and this one does not. Even-rounding
   * was arbitrary dressing on a derived number: it threw away 0.8dp of a
   * measured ratio to buy a property — evenness — that nothing in the system
   * asks for or checks.
   *
   * PUTTING IT ON `display` INSTEAD WAS TRIED AND IS WRONG: at 28 the Garamond
   * sets an x-height of 12.3dp against the sans's 14.6, so the sentence reads as
   * smaller than the heading above it while claiming more rank.
   *
   * IT MATCHES ON CAPS TOO, which is the check that the x-height match is not
   * buying one axis at another's expense: `capMatchAt(28, 33)` returns 20.10 and
   * 20.56 — half a dp apart on a 20dp cap. Garamond's short caps (0.623em) and
   * Söhne's tall ones (0.718em) happen to cancel the size difference almost
   * exactly, and that coincidence is most of why these two faces can share a
   * screen at all.
   *
   * NOTHING IN `cut.sans` OR `cut.mono` MAY TAKE THIS RUNG. typography.test.ts
   * holds that, because a 33dp sans heading would sit two dp off `hero` for no
   * reason anybody could name — which is exactly how `heading` died.
   */
  editorial: Math.round(rung(RUNG_INDEX.display) * SERIF_SIZE_RATIO),
};

/**
 * THE MEASURE — how wide a column of this size may run.
 *
 * The brief every typographer works to is 45–75 characters a line, and 66 is the
 * classic centre of it. That is a count of CHARACTERS, so turning it into a
 * width needs the face's average advance, which is a thing this file can now
 * ask rather than guess: Söhne's lowercase averages `advanceN` = 0.564em (`n`
 * and `o` are both 0.564, and they are the two glyphs a text face's rhythm is
 * built on).
 *
 *   measure(fs.body) → 14 × 66 × 0.564 ≈ 521dp
 *
 * On a phone that is wider than any screen, which is the correct answer and a
 * useful one: it says the reading sizes need no max-width on mobile, and the
 * rungs that DO — a `prose` block on a tablet, the admin panel's copy on a
 * desktop — get their number from the same place instead of a hand-typed 640px.
 *
 * `chars` is the knob for the two ends of the band: 45 for a caption column
 * that should stay narrow, 75 where a long line is acceptable.
 */
export const AVERAGE_ADVANCE_EM = SOHNE.buch.advanceN;
export const IDEAL_MEASURE_CHARS = 66;
export const measure = (size: number, chars: number = IDEAL_MEASURE_CHARS): number =>
  Math.round(size * chars * AVERAGE_ADVANCE_EM);

export type SpaceToken =
  | "none"
  | "xxs" //  4
  | "xs" //   6
  | "sm" //   8
  | "ms" //  10
  | "md" //  12
  | "lg" //  16
  | "xl" //  20
  | "xxl" // 24
  | "xxxl" //32
  | "huge"; //40

/** Spacing scale — gaps, padding, margins. Identical on both clients. */
export const space: Record<SpaceToken, number> = {
  none: 0,
  xxs: 4,
  xs: 6,
  sm: 8,
  ms: 10,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
};

/**
 * THE PAD UNDER A SHEET'S LAST ROW — one number, both clients, once.
 *
 * A presented sheet's panel sits ON the screen's bottom edge, so the device's
 * home-indicator inset is the FLOOR of that pad, never an addition to it. Both
 * clients had this wrong in opposite directions and nothing reconciled them:
 * mobile wrote `insets.bottom + 20` (54dp on any notched iPhone) while its web
 * twin wrote a flat 24, so the same sheet ended 30px taller on the phone.
 *
 * Worse, the pad was never OWNED, so surfaces added their own on top of it: the
 * exercise anatomy sheet trailed another 30, the sport picker another 28, the
 * sheet's own scroller another 4, and the web More sheet a full 110 — reserving
 * room for a floating pill bar that the sheet itself renders over and hides.
 * Stacked, those read exactly as reported: a dead band under every sheet.
 *
 * `max`, not `+`. Pass the safe-area inset (0 on web, or on a phone without a
 * home indicator) and the pad never falls below the comfortable 24, never
 * doubles the inset, and never differs between the two clients.
 *
 * THE RULE: content inside a sheet does not add a trailing pad of its own —
 * this is the pad, and the sheet applies it.
 */
export const sheetPadBottom = (insetBottom = 0) => Math.max(insetBottom, space.xxl);

// ─────────────────────────────────────────────────────────────────────────────
// LEADING + TRACKING — the two axes that had no token, and therefore no limit.
//
// Before this, `fs` and `space` were the whole scale, so line height and letter
// spacing were decided at every call site: apps/mobile alone carried 29 distinct
// lineHeight values (nine of them — 15,16,17,18,19,19.5,20,21,22 — all serving
// body-ish text) and 18 distinct letterSpacings. Two paragraphs set at the same
// size read at different densities depending on which screen you were on.
//
// LEADING IS A RATIO, NOT A NUMBER. Every one of those 29 values was absolute
// dp, which is also why Dynamic Type could not work: the OS scales the glyphs
// and an absolute lineHeight leaves the line box where it was, so text collides
// with itself before it clips. `leading()` derives the box from the size, so a
// scaled size carries its leading with it.
// ─────────────────────────────────────────────────────────────────────────────

export type LeadingRole =
  | "flush" //     0.90 — a STANDALONE FIGURE, cut to the figure set's own ink
  | "tight" //     1.15 — display/hero titles
  | "snug" //      1.30 — headings, list rows, anything one-to-two lines
  | "normal" //    1.50 — the default for reading text
  | "relaxed" //   1.62 — long-form prose, empty-state bodies
  | "editorial"; //1.23 — SERIF ONLY, derived from ITC Garamond's own ink span

/**
 * Line-height RATIOS. Multiply by the font size (see `leading`).
 *
 * ── `flush` IS CUT TO THE FIGURE SET'S INK, AND 1.00 WAS NEVER THAT ────────
 *
 * `tight` used to be documented as covering "display/hero titles, stat figures"
 * and it is wrong for the second half of that. A figure has no second line and
 * no descender past the cap band, so a title's leading buys line box that
 * nothing can ever occupy — and because the space is INSIDE the text node, a row
 * of four stat tiles gains a visible band of nothing that no amount of padding
 * adjustment explains. That is why it took a rung of its own rather than a
 * tighter `tight`: a title genuinely needs 1.15, because a title wraps.
 *
 * THE APP HAD ALREADY REACHED FOR IT SIX DIFFERENT WAYS, which is the usual
 * evidence that a rung is missing rather than unwanted: `leading(fs.stat,
 * "tight")` at six sites, a hand-typed `lineHeight: fs.stat` at one (that IS
 * flush, arrived at by eye), and 50, 44, 35 and a local `FIGURE_BOX` constant
 * at the rest. Seventeen more figure sites set no lineHeight at all and took
 * whatever the platform's default was.
 *
 * BUT 1.00 WAS ITSELF A GUESS — the round number nearest the intent, not the
 * intent. Measured (theme/face-metrics.ts `FIGURE_INK`), the mono cut's figure
 * characters span 0.804em: digits from +0.729 to -0.011, and `/` — which is in
 * `5:12 /km` — from +0.732 to -0.072. So a 1.00 box was still carrying 0.196em
 * of nothing, 9dp of it at `fs.stat`, which is the same defect one notch
 * quieter.
 *
 * `flush` IS 0.90, NOT 0.804, and the gap is deliberate. React Native positions
 * a line's baseline from the font's own ascent (Söhne's hhea ascent is 1.037em,
 * so the natural box is 1.326em), and a declared lineHeight far below that
 * starts to move the baseline rather than only tightening the box. 0.90 clears
 * the measured ink by 0.096em — about 4.7dp at `fs.stat` — which is headroom for
 * that placement rather than slack in the design. The theoretical floor is
 * written down here so the next person shaving it knows which number is the
 * design and which is the platform.
 *
 * IT IS SAFE ONLY BECAUSE THE FIGURE SET IS CLOSED. `flush` is legal on `mono`
 * figures and nothing else — typography.test.ts holds that — and a figure is
 * drawn from `0123456789 : . % × / + -`. Put a lowercase `g` in a flush box and
 * its descender is outside the ink this number was cut to.
 */
const FLUSH_HEADROOM_EM = 0.096;

export const lh: Record<LeadingRole, number> = {
  flush: Number((FIGURE_INK_EM + FLUSH_HEADROOM_EM).toFixed(2)), // 0.804 + 0.096 = 0.90
  tight: 1.15,
  snug: 1.3,
  normal: 1.5,
  relaxed: 1.62,
  /**
   * THE SERIF'S OWN LEADING, and it exists because the serif's em is INFLATED.
   *
   * `fs.editorial` is 33 so that a 0.4409em x-height lands where the sans's
   * 0.523em does at 28. That compensation is correct for SIZE and it quietly
   * breaks LEADING, because a leading ratio multiplies the em — and the serif's
   * em is 18.6% bigger than the size it is pretending to be. Setting the
   * editorial voice at `snug` therefore gave it 33 × 1.30 = 43dp of line box,
   * which is 1.53× the apparent size: BODY leading, on a display-size pull
   * quote. That is precisely the "reads as a caption for something else"
   * complaint the token was created to fix, arriving back through the other axis.
   *
   * DERIVED FROM THE FACE'S OWN INK, so the em drops out of the question: ITC
   * Garamond spans 0.9209em ascender-to-descender (`l` +0.6948 to `p` -0.2261),
   * and a line box one third again the height of the ink it carries is the
   * oldest rule in setting display type. 0.9209 × 4/3 = 1.2279 → 1.23, i.e.
   * 40dp at `fs.editorial`, or 1.45× the apparent size. A pull quote that holds
   * together as a block instead of drifting apart into separate lines.
   *
   * SERIF ONLY. A sans style taking it would be setting 1.23 on a face whose ink
   * is 0.898em — tighter than `tight` — for no reason anyone could name.
   */
  editorial: Number(((inkSpan(ITC_GARAMOND.book) * 4) / 3).toFixed(2)),
};

/**
 * Absolute line height for a size — `leading(fs.body)` → 21.
 *
 * React Native needs `lineHeight` in dp, so this is the mobile entry point;
 * pass the ratio (`lh.normal`) directly wherever a ratio is accepted. Rounded
 * to a whole dp because a fractional line box lands text off the pixel grid.
 */
export const leading = (size: number, role: LeadingRole = "normal"): number =>
  Math.round(size * lh[role]);

export type TrackingRole =
  | "text" //  derived from the SIZE by a continuous curve — see `OPTICAL_K`
  | "label" // +0.085em of CAPS AIR over the curve — the app's dominant eyebrow
  | "caps" //  +0.115em of CAPS AIR over the curve — section labels, nav eyebrows
  | "serif"; // ITC Garamond, which takes half the curve — see below

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * TRACKING IS A CONTINUOUS FUNCTION OF OPTICAL SIZE — the band table is gone.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * THE DEFECT THE dp MAP HAD, and it is worth keeping written down, is the one
 * `trackFigure` was made to fix one axis over: an absolute letterSpacing is a
 * PERCENTAGE that silently changes meaning at every size it touches. The old
 * `display: -0.5` was -0.033em on a 15dp lead and -0.011em on a 46dp figure — a
 * threefold swing in optical intent out of one constant.
 *
 * ── THE DEFECT THE *BAND TABLE* HAD, WHICH IS WHY IT IS ALSO GONE ──────────
 *
 * Converting to em fixed the units and left two problems standing.
 *
 * (1) THE NUMBERS BELONGED TO THE OLD FACE. The bands were adopted with the note that
 *     "the em figures were chosen so the DOMINANT call sites do not move at
 *     all" — i.e. so that the values fitted to the OLD face survived the face swap
 *     to Söhne untouched. That is the right way to MIGRATE a face and the wrong
 *     way to finish one. Söhne is fitted tighter than the face it replaced (`n` carries
 *     0.144em of sidebearing; the old one's is nearer 0.17), so that
 *     tightening applied on top of Söhne's own tighter fit over-tightens
 *     everything from `subtitle` up. Four headings a row, squeezed — and no
 *     single screen looks broken, which is why it survived so long.
 *
 * (2) A STEP TABLE HAS STEPS. At 25dp it returned -0.015em and at 26dp
 *     -0.020em, so a rung boundary was a visible discontinuity in the middle of
 *     the ladder, and a computed size (`tracking(compact ? 18 : 21)`) could
 *     land either side of one for reasons having nothing to do with optics.
 *
 * ── WHAT REPLACES IT ───────────────────────────────────────────────────────
 *
 *     trackText(size) = OPTICAL_K × ln(TYPE_REF / size)
 *
 * One curve, no steps, zero AT THE REFERENCE SIZE BY CONSTRUCTION — which is
 * the whole idea: 16dp is where Söhne's drawn sidebearings are already right
 * (theme/face-metrics.ts), so the correction at 16 must be nothing, and the
 * type ladder and the tracking curve now share that one origin. Above it the
 * curve tightens (large type carries too much air at sidebearings drawn for
 * reading sizes); below it the curve opens up (small type loses counter
 * definition without a trace of air put back).
 *
 * LOGARITHMIC because optical size is perceived in RATIOS, exactly like the
 * type ladder itself — the correction from 16 to 32 has to equal the correction
 * from 32 to 64, and only a log does that. A linear ramp would run away at the
 * top of the range and do nothing at the bottom.
 *
 * `OPTICAL_K` IS ONE CONSTANT WITH ITS ANCHOR NAMED: it is set so that the
 * curve passes through -0.020em at 46dp, the tightening the app's biggest type
 * was already using and the one value in the old table that was demonstrably
 * right (it is what the three largest figures had independently converged on).
 * Everything else follows from the curve rather than from a fresh opinion.
 *
 * WHAT IT MOVES, and every move is a LOOSENING, which is the correction Söhne
 * was owed:
 *
 *       size   was      now      Δdp
 *       10    +0.1     +0.1       0
 *       11    +0.1     +0.1       0
 *       13    +0.1     +0.1       0
 *       14      0        0        0
 *       16      0        0        0
 *       18    -0.3       0      +0.3
 *       20    -0.3     -0.1     +0.2
 *       22    -0.3     -0.1     +0.2
 *       28    -0.5     -0.3     +0.2
 *       35    -0.7     -0.5     +0.2
 *       49    -1.0     -1.0       0
 *
 * The reading band does not move at all, the display band gets its air back,
 * and the top of the ladder lands where it already was.
 */
export const OPTICAL_K = 0.020 / Math.log(46 / TYPE_REF);

/**
 * The optical-size correction in em for a size. Clamped, because Dynamic Type
 * and `resolveText`'s `scaleFactor` can hand this a size far off the ladder and
 * an unbounded log has no opinion about 4dp or 400dp.
 */
export const TRACK_CLAMP_EM = { min: -0.024, max: 0.012 } as const;
export const opticalTrackEm = (size: number): number =>
  Math.min(TRACK_CLAMP_EM.max, Math.max(TRACK_CLAMP_EM.min, OPTICAL_K * Math.log(TYPE_REF / size)));

/**
 * THE TWO UPPERCASE VOICES — CAPS AIR **over** the curve, not instead of it.
 *
 * Capitals were never drawn to sit beside one another, so they need air ADDED,
 * and how much is a decision a size cannot report — which is why these two are
 * named rather than derived. But the SIZE correction still applies underneath:
 * a 10dp eyebrow and a 16dp one do not want the same total tracking just
 * because both are uppercase. So the two compose —
 *
 *     tracking(size, "label") = 0.085em + opticalTrackEm(size)
 *
 * — and the old flat-em spelling was simply the composition with the second
 * term dropped.
 *
 * THIS COSTS THE DOMINANT CALL SITES NOTHING, which is how it is known to be
 * the same intent rather than a new one: at `fs.nano` the curve contributes
 * +0.0089em, so `label` resolves to 0.9dp (201 sites) and `caps` to 1.2dp (72
 * sites) — byte-identical to what shipped. The 48 `label` sites at `fs.micro`
 * move by 0.1dp, and they move in the direction the model says they always
 * should have: smaller caps, more air.
 */
export const CAPS_AIR_EM = { label: 0.085, caps: 0.115 } as const;

/**
 * THE SERIF TAKES HALF THE CURVE, and the halving is the rule for any face the
 * curve was not measured on.
 *
 * `opticalTrackEm` is fitted to Söhne. ITC Garamond is a phototype-era design
 * that is already tightly fitted — 0.0298em of sidebearing on `n` against
 * Söhne's 0.144em, a fifth as much — so the correction Söhne wants at 33dp
 * (-0.0127em) would close the counters on `e` and `a` at reading distance. Half
 * of it is the value, and the halving is stated as a factor rather than baked
 * into a number so that it stays visibly a JUDGEMENT about a second face rather
 * than looking like another measurement.
 */
export const SERIF_TRACK_FACTOR = 0.5;

/**
 * Tracking in dp for a size — `tracking(fs.nano, "label")` → 0.9.
 *
 * Rounded to 0.1dp, the precision `trackFigure` already uses: RN takes
 * fractional letterSpacing and at eyebrow sizes the tenth is visible across a
 * tracked string. Pass the size you are ACTUALLY rendering, including a
 * computed one — `tracking(compact ? 18 : 21)` is correct, and being able to say
 * that is why this is a function rather than a second map. A computed size can
 * no longer land on the wrong side of a band boundary, because there are none.
 */
export function tracking(size: number, role: TrackingRole = "text"): number {
  const optical = opticalTrackEm(size);
  const em =
    role === "text" ? optical
    : role === "serif" ? optical * SERIF_TRACK_FACTOR
    : CAPS_AIR_EM[role] + optical;
  return Math.round(size * em * 10) / 10;
}

/**
 * THE BIG-FIGURE TIGHTENING, proportional — `trackFigure(fs.stat)` → -1.7.
 *
 * `tracking(size)` handles TITLES, and its curve is the house tightening. This is
 * its twin for FIGURES, and the two are separate because a figure is not a
 * title: it is set in the mono cut, whose advances are generous by construction,
 * and it runs to 46dp where a title stops at 34. One constant across that range
 * is right for neither.
 *
 * THE BIG FIGURES ARE NOT TITLES AND AN ABSOLUTE BREAKS ON THEM. The kcal
 * readouts, the weight entries, the volume totals run 30–68dp — a 2.3× span —
 * and -0.5 across that is -0.017em at 30 and -0.007em at 68: at the top of the
 * range it is doing nothing at all. Which is why every one of these figures had
 * hand-multiplied its own value instead (-1, -1.6, -1.9, -2, -2.4, -2.5), and
 * why `letterSpacing: -1` appeared at 20dp AND at 48dp — one optical intent,
 * twelve spellings, correct at none of them.
 *
 * Converted to em those twelve collapse into one band centred on -0.035em, so
 * that is the constant, and this is `leading(size, role)`'s twin: the same
 * argument, one axis over. Rounded to 0.1dp — RN takes fractional letterSpacing
 * and a figure this large shows the difference.
 *
 * It fits what was already drawn: at the old 46dp `stat` it returns -1.6, which
 * is what the three biggest figures in the app already used; the ladder's move
 * to 49 carries it to -1.7 by the same em, which is the point of an em. The sites that move most are
 * the ones that were most clearly wrong (-1 at 44dp was -0.023em against its
 * siblings' -0.035em), and none moves by more than 0.5dp.
 */
export const TRACK_FIGURE_EM = -0.035;
export const trackFigure = (size: number): number => Math.round(size * TRACK_FIGURE_EM * 10) / 10;

/**
 * A FIGURE'S NUMERALS ARE TABULAR — the third figure axis, and the one that had
 * a rule and no owner.
 *
 * A face that ships both numeral sets gives text the PROPORTIONAL one by
 * default: a `1` is drawn narrower than an `8`.
 *
 * ── READ `FACE_LIMITS` BEFORE YOU RELY ON THIS. IT IS NOT THE MECHANISM. ───
 *
 * This constant was adopted under the previous pair of faces, which
 * both carry a `tnum` feature. THE SHIPPED SÖHNE CUTS CARRY NO OPENTYPE
 * FEATURES AT ALL — `GSUB` is empty in all seven binaries — so emitting
 * `tabular-nums` against them activates nothing, and the sans digits stay
 * proportional across eight distinct advances.
 *
 * What actually holds a column together is THE MONO CUT, whose 0.600em advance
 * is uniform by construction. That is why `typography.ts` requires every
 * measured value to be `mono`: the rule is load-bearing, not stylistic. This
 * constant stays because it is free, it is correct the day a fuller licence
 * lands, and web and mobile should keep spelling one value — but it must never
 * be cited as the guarantee. That is correct for a number sitting in a sentence and wrong for every
 * other place this app puts one, because the app's numbers are not prose — they
 * are a column of weights, a clock, a stat tile that updates, a figure mid-roll.
 *
 * Two failures, and the second is not cosmetic:
 *
 *   A COLUMN stops being a column. Four stat tiles in a row, or a table of
 *     loads, align on their glyphs rather than their digit slots, so 111 and 888
 *     are visibly different widths and nothing lines up under anything.
 *
 *   A ROLLING FIGURE JITTERS. `RollingNumber` gives each digit its own column
 *     and animates only the ones that changed — so a units digit going 1 → 8
 *     RESIZES its column mid-animation and shoves every digit beside it
 *     sideways. The roll was built to make one change read as one event; a
 *     proportional numeral makes the whole figure twitch instead.
 *
 * It was applied at ~25 call sites on mobile and NOWHERE on web — and, the part
 * that matters, at no call site that all the others pass through: neither
 * `RollingNumber` nor the stat tiles declared it, so the system's own figure
 * primitives did not guarantee the system's own rule, and every new figure was
 * a fresh chance to forget. The primitives declare it now; the constant is here
 * so the two clients spell the same value (mobile `fontVariant: [TABULAR_NUMS]`,
 * web `fontVariantNumeric: TABULAR_NUMS` — one CSS value, two property names).
 */
export const TABULAR_NUMS = "tabular-nums" as const;

/**
 * A MONOSPACED GLYPH'S ADVANCE, in em — Söhne Mono's, which is the app's only
 * mono face and the face every FIGURE is set in. Measured across the whole
 * glyph order of all three cuts, not sampled: exactly one advance, 0.600em.
 * (The mono face this replaced happened to share the value — which is
 * why the swap was a no-op here and why the next one may not be.)
 *
 * Every glyph in a monospaced face is exactly this wide. That is the whole
 * reason this constant can exist: a proportional face's width is unknowable
 * without measuring the actual string, but a figure set in mono is
 * `characters × size × advance` before it is drawn, so a layout can ask whether
 * a figure fits BEFORE committing to a size — instead of shipping a guess and
 * discovering the answer on somebody's phone.
 *
 * The activity card discovered exactly that: four figures in four columns, each
 * needing more width than a quarter of the card, so two of them broke mid-word
 * in production. The arithmetic that would have caught it is one multiplication.
 */
export const MONO_ADVANCE_EM = 0.6;

/**
 * THE LARGEST RUNG A MONO FIGURE FITS AT — the derived alternative to picking a
 * font size and hoping.
 *
 * `sizes` is a DESCENDING ladder of candidate rungs; the first that fits `width`
 * wins, and the last is the floor when none does (a floor is not a failure — it
 * is the smallest setting the caller is willing to draw, and the caller decides
 * what happens past it: ellipsis, a second line, or nothing at all because the
 * floor was chosen to be unreachable).
 *
 * `scale` is the OS text scale (Dynamic Type), so the question asked is the one
 * that matters: does this figure fit on THIS athlete's phone at THEIR text size.
 * Pass the value the caller's own `maxFontSizeMultiplier` will actually allow —
 * asking about a scale the text is capped below would shrink a figure to make
 * room for growth that cannot happen.
 *
 * Pure and unit-scaled: `width` and the sizes are in the same unit (dp on
 * mobile, px on web), so the same call answers on both clients.
 */
export function fitMonoFigure(text: string, width: number, sizes: readonly number[], scale = 1): number {
  const last = sizes[sizes.length - 1];
  if (last === undefined) return 0;
  // An unmeasured container answers nothing useful, and answering "the floor"
  // would render every figure small for one frame and then jump. The caller's
  // first choice is the honest default until a real width arrives.
  if (!(width > 0)) return sizes[0]!;
  for (const size of sizes) {
    if (text.length * size * scale * MONO_ADVANCE_EM <= width) return size;
  }
  return last;
}
