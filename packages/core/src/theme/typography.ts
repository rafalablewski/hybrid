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
 * product to a new face is 2,274 call sites if the face is chosen at the
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
 * Tracking resolves through `tracking(size, role)`, which is why most styles below
 * DO NOT NAME ONE. For text the correct tracking is a function of optical size
 * (scale.ts's band table), so a style declaring `"display"` beside
 * `size: "display"` said the same thing twice and left room for the two to
 * disagree. Only the two uppercase voices and the figure tightening are real
 * choices, so only those are named.
 */

import { fs, lh, measure, promote, STEP, tracking, trackFigure, type LeadingRole, type TrackingRole, type TypeRole } from "../scale";
import { SOHNE } from "./face-metrics";
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
 *
 * ── THERE IS A THIRD CUT IN THE SPEC AND IT IS DELIBERATELY NOT HERE ────────
 *
 * `reference/typography-system.html` ships a CONDENSED cut (Söhne Schmal) for
 * takeover titles on the four editorial surfaces, at 34dp and above and nowhere
 * below. It is a real decision, measured both ways: at `subtitle` it reads as a
 * size drop and cannot be mixed into a list, and at 52 the same condensation
 * reads as deliberate and fits a cover title in two lines instead of three.
 *
 * It is absent from this file because DECLARING A FACE THE APP DOES NOT LOAD is
 * the exact mistake `condensed` (a narrow cut) was deleted for in tokens.ts:
 * it existed as a name in the tokens and a webfont in the browser and nowhere in
 * the thing that ships, so the phone drew the standard cut while the admin panel drew
 * Narrow. A token with no consumer is not a head start, it is a lie with a
 * comment attached.
 *
 * TO ADD IT: load the face in `apps/mobile/app/_layout.tsx`, give it a name in
 * `F` and a PostScript entry in `F_POSTSCRIPT` (native-face.test.ts parses the
 * shipped binary, so the map cannot be a guess), add it to `fonts` in tokens.ts,
 * then add `condensed` here and update the cut-count guard below in the same
 * change. The guard exists so that sequence cannot be short-circuited.
 */
export const cut = {
  sans: fonts.display,
  mono: fonts.mono,
  /**
   * THE SERIF, and it is the one cut with a cap on how often it may appear.
   *
   * ITC Garamond Book. ONE element per screen, never below `fs.editorial`,
   * never a figure, a control, a label or a state, and never in the accent
   * colour — the accent means go, and a conclusion is not a destination. The
   * full rule lives on `text.editorial` below.
   *
   * ENGLISH ONLY. ITC Garamond Std carries Ł and ó but not ą ę ś ż ń ć ź, so a
   * Polish or Czech string cannot be set in it at all. Every consumer resolves
   * to `sans` outside English rather than rendering a line with holes in it.
   */
  serif: fonts.serif,
} as const;

export type Cut = keyof typeof cut;

/**
 * FOUR WEIGHTS, AND ON THIS GROUND THE LADDER STOPS AT 600 — BOTH CUTS.
 *
 * The names are the product's, not the foundry's, so a face swap does not
 * rename every call site: `semibold` is Söhne Halbfett, `bold` is
 * Dreiviertelfett.
 *
 * ── THE STEMS, MEASURED, BECAUSE THIS IS AN ARGUMENT ABOUT INK ─────────────
 *
 * Söhne draws all four cuts on ONE skeleton — x-height 0.523-0.527, cap-height
 * 0.718 flat (theme/face-metrics.ts) — so a weight IS its stem and nothing else:
 *
 *     Buch             0.090em    regular
 *     Kräftig          0.120em    medium      +33%
 *     Halbfett         0.140em    semibold    +56%
 *     Dreiviertelfett  0.160em    bold        +78%
 *
 * ── WHY `bold` IS BANNED IN MONO ───────────────────────────────────────────
 *
 * Every glyph in a monospaced face already sits on the same 0.600em advance, so
 * weight is the only axis left to close a counter with. At `fs.stat` a mono
 * 700's 8, 9, 6 and 0 converge at arm's length — which is the exact distance and
 * the exact figures this product is read at. 600 is the ceiling and the digits
 * are more legible for it. (The face ships no mono 700 at all, so the rule is
 * also simply the truth about what is loadable.)
 *
 * ── AND WHY, ON THE APP'S GROUND, THE SANS STOPS THERE TOO ─────────────────
 *
 * New in Aug 2026, and the largest single correction in the type rebuild.
 *
 * HYBRID paints near-black (`colors.ink`, L* 3.5) and sets light type on it.
 * Light-on-dark IRRADIATES: the lit strokes bleed outward into the dark ground,
 * so every weight reads heavier than the same weight would on paper. The
 * standard response — the one every careful dark interface makes — is to set one
 * step LIGHTER than you otherwise would.
 *
 * The app did the opposite. `F.black`, the heaviest cut, carried 298 call sites
 * against 258 for the regular and 81 for the medium: the weight distribution was
 * INVERTED, with the heaviest cut as the default and the text weights as the
 * exceptions. Worse, 62 of those sites sat at `fs.body` or below, where a 0.16em
 * stem is a 2.2dp stroke and the counters of `a`, `e` and `s` close up. Heavy
 * type at reading size is not emphasis, it is mud — and it is most of the answer
 * to why a Söhne/Garamond pairing that should read expensive read cheap.
 *
 * So: NO NAMED STYLE ON THE DARK GROUND TAKES `bold`, and typography.test.ts
 * holds it. `hero` — the masthead, the one place a 700 had a real argument — is
 * `semibold` now, because at 35dp on near-black Halbfett is already emphatic and
 * Dreiviertelfett is a slab.
 *
 * `bold` IS NOT DEAD, and that is what makes this a rule rather than a deletion:
 * irradiation runs the OTHER WAY on a light or accent-filled surface, where dark
 * ink on a lit ground reads lighter than it measures. There the ladder steps up,
 * `bold` becomes correct, and `text.takeover` — the Wrapped's full-bleed cover
 * title, the app's only such surface — is its one consumer. `weightOnGround`
 * below is the mechanism, stated once.
 */
export const weight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  /** LIGHT / ACCENT GROUNDS ONLY — see `weightOnGround`. Never on `ink`. */
  bold: 700,
} as const;

/** The measured stems, so the ladder's argument can be checked rather than read. */
export const WEIGHT_STEM_EM: Record<number, number> = {
  400: SOHNE.buch.stem,
  500: SOHNE.kraftig.stem,
  600: SOHNE.halbfett.stem,
  700: SOHNE.dreiviertelfett.stem,
};

/** What a surface does to apparent weight. `dark` is the app's ground. */
export type Ground = "dark" | "light";

/**
 * ONE STEP UP ON A LIGHT GROUND, and nothing else, ever.
 *
 * Dark ink on a lit surface loses apparent weight exactly as light ink on a dark
 * one gains it, so a style that reads correct on `ink` reads thin inside a
 * chartreuse pill or on a Wrapped cover. Rather than a second weight ladder —
 * which would drift from the first the week after it was written — the light
 * ground takes the SAME ladder shifted one rung. That is the whole of the
 * correction, and it is reversible by construction.
 *
 * It stops at `bold`: there is no rung above, so a style already there is as
 * heavy as this system goes.
 */
export const weightOnGround = (w: number, ground: Ground = "dark"): number =>
  ground === "light" ? Math.min(weight.bold, w + 100) : w;

export type WeightRole = keyof typeof weight;

/** The ink a style asks for, resolved by the renderer against the live palette
 *  (`chalk` / `ash` in `ThemePalette`). Kept as a ROLE because a style is used
 *  on the page ground and on a card, and neither owns the other's ink. */
export type InkRole = "primary" | "secondary";

export interface TextStyle {
  cut: Cut;
  weight: number;
  /** A rung in `fs` — never a raw number. */
  size: TypeRole;
  /** A ratio in `lh`. A figure that cannot wrap takes `"flush"`. */
  leading: LeadingRole;
  /** `"text"` (the default) derives the tracking from the SIZE via scale.ts's
   *  band table; `"label"` / `"caps"` are the uppercase trackings, which a size
   *  cannot report; `"figure"` is the proportional big-figure tightening
   *  (`trackFigure`). Omit it and the size decides, which is right for every
   *  style that sets a sentence. */
  tracking?: TrackingRole | "figure";
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
 * `fs.bodyLg` (15) and `fs.headline` (20) are absent, and their absence is the
 * point: three reading sizes inside 2dp and two section sizes one rung apart
 * were never chosen, they accumulated. Neither rung is referenced here, so
 * anything migrated onto a named style leaves them behind automatically.
 */
export const text = {
  // ── FIGURES — the mono cut ────────────────────────────────────────────────
  /** THE one hero figure on a screen. A second means neither is the answer. */
  metric: { cut: "mono", weight: weight.semibold, size: "stat", leading: "flush", tracking: "figure", ink: "primary", tabular: true },
  /** A card's KPI. */
  figureLg: { cut: "mono", weight: weight.semibold, size: "display", leading: "flush", tracking: "figure", ink: "primary", tabular: true },
  /** A tile figure, a ranking. */
  figure: { cut: "mono", weight: weight.semibold, size: "headline", leading: "flush", tracking: "figure", ink: "primary", tabular: true },
  /** A figure in a row or a table cell. */
  figureSm: { cut: "mono", weight: weight.semibold, size: "bodyLg", leading: "snug", ink: "primary", tabular: true },
  /**
   * A READOUT — the world reporting itself, at one weight below a result.
   * This is the system's one semantic weight distinction and it is worth the
   * token: a clock, a heart rate, a timestamp are `readout`; a load, a total,
   * a PR, an index are `figure`. It means a screen full of numbers still has a
   * subject.
   */
  readout: { cut: "mono", weight: weight.medium, size: "headline", leading: "flush", tracking: "figure", ink: "primary", tabular: true },
  /** A quiet figure — a logged set, a chart axis, a row's secondary number. */
  datum: { cut: "mono", weight: weight.regular, size: "body", leading: "snug", ink: "secondary", tabular: true },

  // ── LANGUAGE — the sans cut ───────────────────────────────────────────────
  /**
   * THE MASTHEAD. `semibold`, not `bold`, and the drop is deliberate — see the
   * irradiation note on `weight`. At 35dp on near-black, Halbfett is already
   * emphatic; Dreiviertelfett is a slab with the counters filling in.
   */
  hero: { cut: "sans", weight: weight.semibold, size: "hero", leading: "tight", ink: "primary" },
  /**
   * THE TAKEOVER TITLE — the ONE style that takes `bold`, and the only one that
   * may, because it is the only one that never touches the app's dark ground.
   *
   * It sets the Wrapped's cover titles, which are full-bleed accent or
   * photographic panels: dark ink on a lit surface, where the irradiation that
   * makes `bold` a slab on `ink` runs the other way and takes weight OFF. It is
   * `hero`'s size at `hero`'s leading, one weight up, and a call site reaching
   * for it on a normal screen is making the mistake this pair exists to name.
   */
  takeover: { cut: "sans", weight: weight.bold, size: "hero", leading: "tight", ink: "primary" },
  display: { cut: "sans", weight: weight.semibold, size: "display", leading: "tight", ink: "primary" },
  headline: { cut: "sans", weight: weight.semibold, size: "headline", leading: "snug", ink: "primary" },
  /** Section titles — the house standard (the Explore tab's SectionHead). */
  title: { cut: "sans", weight: weight.semibold, size: "title", leading: "snug", ink: "primary" },
  /**
   * `medium`, where the three rungs above it are `semibold` — so the heading
   * band carries a WEIGHT step as well as a size one. Four consecutive heading
   * rungs all at one weight was hierarchy by size alone, which is a third of the
   * available signal being left unused.
   */
  subtitle: { cut: "sans", weight: weight.medium, size: "subtitle", leading: "snug", ink: "primary" },
  /** Primary list line, emphasised body. */
  bodyLg: { cut: "sans", weight: weight.medium, size: "bodyLg", leading: "snug", ink: "primary" },
  /** Default reading text. The floor for prose. */
  body: { cut: "sans", weight: weight.regular, size: "body", leading: "normal", ink: "primary" },
  /** Long-form: empty states, AI insight paragraphs. Primary ink — an insight
   *  the athlete has to hunt for is not an insight. */
  prose: { cut: "sans", weight: weight.regular, size: "body", leading: "relaxed", ink: "primary" },
  /** Metadata — a timestamp, a device name, a source. */
  caption: { cut: "sans", weight: weight.regular, size: "caption", leading: "normal", ink: "secondary" },
  /** A small label inside a dense row. */
  labelSm: { cut: "sans", weight: weight.medium, size: "micro", leading: "snug", ink: "secondary" },

  // ── CONTROLS — the sans cut, and they are NOT body text ──────────────────
  /**
   * A BUTTON LABEL, and the reason it is its own token rather than `bodyLg` in
   * a pill is that a control's label has no measure and never wraps.
   *
   * `medium`, because a control is already marked out by its container — a
   * filled pill, a ring, a 44dp target — and setting its label `semibold` on top
   * of that is the same mistake as the app's inverted weight distribution, one
   * component down. The chrome carries the emphasis; the label carries the word.
   *
   * Ink is PRIMARY: a control the athlete is meant to press cannot be set in the
   * colour the system uses for things that are merely true.
   */
  button: { cut: "sans", weight: weight.medium, size: "bodyLg", leading: "snug", ink: "primary" },
  /** A chip, a segmented-control segment, a dense row's inline action. */
  buttonSm: { cut: "sans", weight: weight.medium, size: "caption", leading: "snug", ink: "primary" },
  /**
   * THE EYEBROW, AND THERE ARE TWO OF THEM — this is the app's dominant label
   * voice and the pair is not a redundancy.
   *
   * `kicker` is the STANDARD eyebrow (+0.085em): the label above a card, a
   * figure, a row. `overline` is the ARCHITECTURAL one (+0.115em): a section
   * label or a nav eyebrow, where the label is structure rather than content
   * and the extra air is what makes it read as a division of the page.
   *
   * Both existed in the app before they had names — 281 sites at the narrower
   * tracking and 142 at the wider — and collapsing them onto one token was
   * tried first. It moved 108 eyebrows by 0.3dp, which is visible on a tracked
   * string, so the distinction the two trackings were already encoding turned
   * out to be real. It is cheaper to name it than to argue with it.
   */
  kicker: { cut: "mono", weight: weight.medium, size: "nano", leading: "snug", tracking: "label", ink: "secondary", upper: true },
  overline: { cut: "mono", weight: weight.medium, size: "nano", leading: "snug", tracking: "caps", ink: "secondary", upper: true },

  // ── INTERPRETATION — the serif cut ────────────────────────────────────────
  /**
   * THE ONE SENTENCE ON A SCREEN THAT CONCLUDES SOMETHING.
   *
   * Söhne measures; this interprets. The two consumers today are the week
   * verdict's lead and the nutrition nudge, and both were ALREADY the only
   * interpretive sentence on their screen — they were simply set in a utility
   * style. The verdict lead was `sans` at `subtitle`, which its own file warned
   * "reads as a caption for something else"; the nudge was `sans` at `body`,
   * the style help text uses. This token does not add a voice, it gives one
   * that already existed the rank it always had.
   *
   * THE RULES, and they are ratcheted in apps/mobile/lib/design-tokens.test.ts:
   *   ONE per screen. A second means neither is the conclusion.
   *   NEVER on a screen used DURING training. Mid-set the athlete needs
   *     measurement, and a serif sentence is not measurement. Workout, interval
   *     timer and the active endurance screens are closed to it.
   *   NEVER a figure, unit, control, label, badge or state.
   *   NEVER uppercase, letterspaced positive, or in the accent colour.
   *   NEVER below 24dp — Garamond's joins break up on `ink` under that.
   *   ENGLISH ONLY (see `cut.serif`).
   *
   * `tabular` is absent on purpose: the guard below requires it to track the
   * mono cut, and a sentence has no column to line up with.
   */
  editorial: { cut: "serif", weight: weight.regular, size: "editorial", leading: "editorial", tracking: "serif", ink: "primary" },
  /**
   * THE ATTRIBUTION under a quote, and it is SANS on purpose.
   *
   * "Never mix the two faces in the same line" is the pairing's governing rule,
   * and an attribution is where it is most often broken — a serif quote with a
   * serif source line reads as one continuous piece of typesetting, so the
   * source competes with the sentence instead of receding from it. The face
   * change IS the demotion: sans, secondary ink, small, on its own line.
   *
   * It is not `caption`, which is metadata; this is a named human, and it sits
   * in a fixed relationship to `editorial` that a general-purpose token would
   * not carry.
   */
  attribution: { cut: "sans", weight: weight.medium, size: "caption", leading: "snug", ink: "secondary" },
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
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DESKTOP SCALE IS THIS SCALE, PROMOTED BY ONE STEP — `resolveText(t, STEP)`
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A desktop is read at roughly 60cm against a phone's 35cm, on a canvas with an
 * order of magnitude more room, so the same rung set at the same px reads small
 * and lost. The usual answer is a second ladder, and a second ladder is how the
 * admin console drifted a pixel under the consumer app in the first place — the
 * defect scale.ts was written to end.
 *
 * There is no second ladder. Resolve with `steps: DESKTOP_PROMOTION` and every
 * rung lands EXACTLY on the next rung up, because the ladder is generated by
 * that ratio and the promotion walks it in INDICES rather than multiplying a
 * rounded px value (`fs.micro × STEP` is 12; the next rung is 13 — see
 * `promote` in scale.ts):
 *
 *     mobile   10  11  13  14  16  18  20  22  28  35  49
 *     desktop  11  13  14  16  18  20  22  25  31  39  55
 *
 * That is not an approximation that happens to be close. It is an identity, and
 * `typography.test.ts` asserts it rung by rung — which is the property a
 * modular scale buys you and an accumulated list cannot.
 *
 * Leading follows automatically (it is a ratio), and so does tracking (the
 * optical curve is a function of the rendered size, so a promoted rung gets the
 * correction its NEW size deserves rather than carrying the old one up).
 *
 * `scaleFactor` IS A DIFFERENT AXIS and the two compose: it serves iOS Dynamic
 * Type, which scales continuously and off-ladder because the OS says so, where a
 * promotion moves between rungs the system chose.
 */
export const DESKTOP_PROMOTION = 1;

/**
 * Resolve a named style to absolute values.
 *
 * `scaleFactor` carries Dynamic Type / a desktop rung promotion: the SIZE moves
 * and the leading moves WITH it, because leading here is a ratio rather than the
 * absolute dp that made Dynamic Type impossible before `leading()` existed.
 * Tracking follows too, for text and figures alike: both are em-derived now, so
 * a scaled style keeps its proportions rather than its dp.
 */
/**
 * THE COLUMN WIDTH A STYLE WANTS, in characters rather than in pixels.
 *
 * `measure()` (scale.ts) turns a character count into a width using Söhne's own
 * average advance, so this answers the brief's "recommended max-width" per rung
 * without anyone typing a 640. 66 characters is the classic centre of the
 * 45-75 band; pass 45 for a deliberately narrow column, 75 where a long line is
 * acceptable.
 *
 * On a phone every reading rung answers wider than the screen, and that IS the
 * answer: it says the mobile reading sizes need no cap, and the surfaces that
 * do need one — a tablet `prose` block, the admin panel's copy on a desktop —
 * take their number from the same place rather than from a fresh guess.
 */
export function measureFor(token: TextToken, chars?: number): number {
  return measure(fs[(text[token] as TextStyle).size], chars);
}

export function resolveText(token: TextToken, scaleFactor = 1, steps = 0): ResolvedText {
  const s = text[token] as TextStyle;
  // `steps` walks the LADDER (see `promote` in scale.ts); `scaleFactor` scales
  // whatever that lands on. They are different operations and conflating them is
  // the bug this signature exists to prevent: `fs.micro × STEP` is 12 while the
  // next rung is 13, because rounding a rung and then multiplying loses the half
  // dp the exact ladder carries. A promotion has to land ON a rung.
  const size = Math.round(promote(s.size, steps) * scaleFactor);
  const ratio = lh[s.leading];
  return {
    fontFamily: cut[s.cut],
    fontWeight: s.weight,
    fontSize: size,
    lineHeight: Math.round(size * ratio),
    letterSpacing: s.tracking === "figure" ? trackFigure(size) : tracking(size, s.tracking ?? "text"),
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
