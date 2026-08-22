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
  | "bodyLg" // 14 — emphasised body / primary list line, and the small lead
  | "subtitle" //16 — small headings
  | "title" //  18 — section titles
  | "headline" //22 — screen sub-headings, and the head of a screen with no hero
  | "display" //26 — screen headings
  | "hero" //   34 — mastheads / cover titles
  | "stat"; //  46 — the one hero figure on a screen (ring kcal, exercise 1RM)

/**
 * Font-size scale (fs.body = the default reading size). px on web, dp on RN.
 *
 * THE LADDER ENDS AT `stat` ON PURPOSE: there is no rung above it, so a figure
 * larger than 46 is a design smell, not a missing token.
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
 * TWO THINGS ABOVE 46 ARE NOT VIOLATIONS OF THIS, and naming them is what keeps
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
 */
/**
 * ── TWO RUNGS WERE RETIRED, Aug 2026, AND NEITHER WAS EVER CHOSEN ──────────
 *
 * `note` (15) sat between `body` (13) and `bodyLg` (14) — THREE reading sizes
 * inside two dp. Nobody can see the difference between 14 and 15 and nobody
 * decided it; it accumulated, which is the same way the app grew 29 lineHeights
 * and 18 letterSpacings. Its 190 sites are `bodyLg`, which the ladder already
 * describes as the emphasised body line, and a lead IS an emphasised body line.
 *
 * `heading` (20) and `headline` (22) were one job under two names, one rung
 * apart, with nothing to say which a screen sub-heading should take — so the
 * answer was whichever file you copied from. Its 63 sites are `headline`.
 *
 * THE GENERAL RULE this leaves behind: adjacent rungs are not hierarchy. A
 * level needs two rungs of separation to read as a level, so a ladder whose
 * neighbours differ by one dp is carrying a distinction the eye cannot collect.
 */
export const fs: Record<TypeRole, number> = {
  nano: 10,
  micro: 11,
  caption: 12,
  body: 13,
  bodyLg: 14,
  subtitle: 16,
  title: 18,
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
  | "flush" //   1.00 — a STANDALONE FIGURE, which has no second line to leave room for
  | "tight" //   1.15 — display/hero titles
  | "snug" //    1.30 — headings, list rows, anything one-to-two lines
  | "normal" //  1.50 — the default for reading text
  | "relaxed"; // 1.62 — long-form prose, empty-state bodies

/**
 * Line-height RATIOS. Multiply by the font size (see `leading`).
 *
 * ── `flush` IS THE RUNG THIS LADDER WAS MISSING ────────────────────────────
 *
 * `tight` used to be documented as covering "display/hero titles, stat figures"
 * and it is wrong for the second half of that. A figure has no second line and
 * no descender past the cap band, so 1.15 at fs.stat buys SEVEN dp of line box
 * that nothing can ever occupy — and because the space is INSIDE the text node,
 * a row of four stat tiles gains a visible band of nothing that no amount of
 * padding adjustment explains. That is why it took a rung of its own rather
 * than a tighter `tight`: a title genuinely needs 1.15, because a title wraps.
 *
 * THE APP HAD ALREADY REACHED FOR IT SIX DIFFERENT WAYS, which is the usual
 * evidence that a rung is missing rather than unwanted: `leading(fs.stat,
 * "tight")` at six sites, a hand-typed `lineHeight: fs.stat` at one (that IS
 * flush, arrived at by eye), and 50, 44, 35 and a local `FIGURE_BOX` constant
 * at the rest. Seventeen more figure sites set no lineHeight at all and took
 * whatever the platform's default was.
 */
export const lh: Record<LeadingRole, number> = {
  flush: 1.0,
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
  | "text" //  derived from the SIZE — see the band table below
  | "label" // 0.085em — uppercase mono kickers (the app's dominant eyebrow)
  | "caps"; // 0.115em — the widest tracked caps: section labels, nav eyebrows

/**
 * TRACKING IS AN EM VALUE AND `track()` RESOLVES IT — the dp map is gone.
 *
 * THE DEFECT THE dp MAP HAD is the one `trackFigure` was written to fix one
 * axis over: an absolute letterSpacing is a PERCENTAGE that silently changes
 * meaning at every size it touches. The old `display: -0.5` was -0.033em on a
 * 15dp lead and -0.011em on a 46dp figure — a threefold swing in optical intent
 * out of one constant, doing far too much at the bottom of its range and almost
 * nothing at the top.
 *
 * ── THE TEXT BANDS, AND WHY THE ROLE NAME WENT AWAY FOR THEM ───────────────
 *
 * For TEXT the correct tracking is a function of optical size, not of what the
 * caller thinks the text is for: large type carries too much air at its natural
 * sidebearings (those were drawn for reading sizes) and small type loses counter
 * definition. So there is no display / headline / title role to pick — pass the
 * size and the band decides:
 *
 *     >= 26   -0.020em   display and hero
 *     >= 18   -0.015em   the headline band
 *     >= 16   -0.010em   the last size where tightening is felt but not seen
 *     >= 13    0         the face is fitted for text at these sizes
 *      < 13   +0.005em   a trace of air back into small copy
 *
 * That is not a simplification, it is the removal of a way to be wrong: a
 * caller can no longer apply display tracking to a 13dp row, which three did.
 *
 * ── THE TWO THAT ARE NOT DERIVABLE ────────────────────────────────────────
 *
 * `label` and `caps` are UPPERCASE trackings, and case is a choice the size
 * cannot report. Capitals were never drawn to sit beside one another, so they
 * need air ADDED rather than removed, and how much is a decision. These are the
 * two eyebrow voices the app already had; they keep their names and their
 * meanings, now stated as the proportions they always were.
 *
 * ── THIS CONVERSION IS VERIFIED, NOT ASSERTED ─────────────────────────────
 *
 * The em figures were chosen so the DOMINANT call sites do not move at all:
 * `label` at fs.nano still resolves to 0.9dp (201 sites) and at fs.micro to
 * 0.9dp (48), `caps` at fs.nano to 1.2dp (72), text at fs.display to -0.5dp
 * (19). 340 of the 461 sized sites render byte-identically, the largest move
 * anywhere is 0.5dp, and every move is in the direction the band table says was
 * always intended. `scale.test.ts` holds those figures so the claim stays true.
 */
export const TRACKING_EM: Record<Exclude<TrackingRole, "text">, number> = {
  label: 0.085,
  caps: 0.115,
};

/** The text bands, largest first. Read as: at this size and above, this em. */
const TEXT_BANDS: ReadonlyArray<readonly [number, number]> = [
  [26, -0.02],
  [18, -0.015],
  [16, -0.01],
  [13, 0],
];

/**
 * Tracking in dp for a size — `tracking(fs.nano, "label")` → 0.9.
 *
 * Rounded to 0.1dp, the precision `trackFigure` already uses: RN takes
 * fractional letterSpacing and at eyebrow sizes the tenth is visible across a
 * tracked string. Pass the size you are ACTUALLY rendering, including a
 * computed one — `tracking(compact ? 18 : 21)` is correct, and being able to say
 * that is why this is a function rather than a second map.
 */
export function tracking(size: number, role: TrackingRole = "text"): number {
  const em = role === "text" ? (TEXT_BANDS.find(([min]) => size >= min)?.[1] ?? 0.005) : TRACKING_EM[role];
  return Math.round(size * em * 10) / 10;
}

/**
 * THE BIG-FIGURE TIGHTENING, proportional — `trackFigure(fs.stat)` → -1.6.
 *
 * `tracking(size)` handles TITLES, and its bands are the house tightening. This is
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
 * It fits what was already drawn: at 46dp it returns -1.6, which is what the
 * three biggest figures in the app already used. The sites that move most are
 * the ones that were most clearly wrong (-1 at 44dp was -0.023em against its
 * siblings' -0.035em), and none moves by more than 0.5dp.
 */
export const TRACK_FIGURE_EM = -0.035;
export const trackFigure = (size: number): number => Math.round(size * TRACK_FIGURE_EM * 10) / 10;

/**
 * A FIGURE'S NUMERALS ARE TABULAR — the third figure axis, and the one that had
 * a rule and no owner.
 *
 * Archivo and JetBrains Mono both ship proportional and tabular numeral sets,
 * and by default text gets the PROPORTIONAL one: a `1` is drawn narrower than an
 * `8`. That is correct for a number sitting in a sentence and wrong for every
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
 * A MONOSPACED GLYPH'S ADVANCE, in em — JetBrains Mono's, which is the app's
 * only mono face and the face every FIGURE is set in.
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
