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

export type TypeRole =
  | "nano" //   10 — micro mono eyebrow labels (uppercase, tracked)
  | "micro" //  11 — tiny secondary labels
  | "caption" // 12 — meta / secondary text
  | "body" //   13 — default reading text
  | "bodyLg" // 14 — emphasised body / primary list line
  | "note" //   15 — small lead
  | "subtitle" //16 — small headings
  | "title" //  18 — section titles
  | "heading" //20 — screen sub-headings
  | "headline" //22 — the head of a screen that owns no hero (see below)
  | "display" //26 — screen headings
  | "hero" //   34 — mastheads / cover titles
  | "stat"; //  46 — the one hero figure on a screen (ring kcal, exercise 1RM)

/** Font-size scale (fs.body = the default reading size). px on web, dp on RN.
 *  The ladder ends at `stat` on purpose: there is no rung above it, so a figure
 *  larger than 46 is a design smell, not a missing token. */
export const fs: Record<TypeRole, number> = {
  nano: 10,
  micro: 11,
  caption: 12,
  body: 13,
  bodyLg: 14,
  note: 15,
  subtitle: 16,
  title: 18,
  heading: 20,
  // `headline` was a MAGIC NUMBER before it was a token: 22 appeared 26 times in
  // apps/mobile with no name, and it is where a hand-rolled screen title lands —
  // bigger than a section heading, smaller than a display. Naming it does not
  // bless hand-rolled heads (those should take a HeroRank); it stops the ones
  // that exist from being 22 in one file and 21 or 24 in the next.
  headline: 22,
  display: 26,
  hero: 34,
  stat: 46,
};

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
  | "tight" //   1.15 — display/hero titles, stat figures
  | "snug" //    1.30 — headings, list rows, anything one-to-two lines
  | "normal" //  1.50 — the default for reading text
  | "relaxed"; // 1.62 — long-form prose, empty-state bodies

/** Line-height RATIOS. Multiply by the font size (see `leading`). */
export const lh: Record<LeadingRole, number> = {
  tight: 1.15,
  snug: 1.3,
  normal: 1.5,
  relaxed: 1.62,
};

/**
 * Absolute line height for a size — `leading(fs.body)` → 20.
 *
 * React Native needs `lineHeight` in dp, so this is the mobile entry point;
 * pass the ratio (`lh.normal`) directly wherever a ratio is accepted. Rounded
 * to a whole dp because a fractional line box lands text off the pixel grid.
 */
export const leading = (size: number, role: LeadingRole = "normal"): number =>
  Math.round(size * lh[role]);

export type TrackingRole =
  | "display" // -0.5 — large titles; big type needs the air taken out
  | "normal" //   0   — body text is drawn on its natural sidebearings
  | "label" //    0.9 — uppercase mono kickers (the app's dominant eyebrow)
  | "caps"; //    1.2 — the widest tracked caps: section labels, nav eyebrows

/**
 * Letter spacing in dp, matching React Native's `letterSpacing` unit.
 *
 * `label` (0.9) and `caps` (1.2) codify the two eyebrow trackings that were
 * already in use — 216 and 137 sites respectively — which had drifted apart
 * with nothing to say which was correct. `label` is the default for a kicker;
 * `caps` is for the wider, more architectural section labels.
 */
export const tracking: Record<TrackingRole, number> = {
  display: -0.5,
  normal: 0,
  label: 0.9,
  caps: 1.2,
};

/**
 * THE BIG-FIGURE TIGHTENING, proportional — `trackFigure(fs.stat)` → -1.6.
 *
 * `tracking.display` is the house TITLE tightening and stays exactly that: it
 * is the token, it holds 51 call sites plus two core contracts (the app-header
 * wordmark at 19, the hub masthead's title at fs.hero), and hub-masthead chose
 * it deliberately over the `-1` that shipped before it. Titles are 13–34dp, a
 * narrow enough band that one absolute dp works across it.
 *
 * THE BIG FIGURES ARE NOT TITLES AND THE ABSOLUTE BREAKS ON THEM. The kcal
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
 * It fits what was already drawn: at 46dp it returns -1.6, which is what the
 * three biggest figures in the app already used. The sites that move most are
 * the ones that were most clearly wrong (-1 at 44dp was -0.023em against its
 * siblings' -0.035em), and none moves by more than 0.5dp.
 */
export const TRACK_FIGURE_EM = -0.035;
export const trackFigure = (size: number): number => Math.round(size * TRACK_FIGURE_EM * 10) / 10;
