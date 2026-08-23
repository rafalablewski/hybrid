/**
 * WHAT THE SHIPPED BINARIES ACTUALLY MEASURE.
 *
 * Every optical constant in `scale.ts` and `typography.ts` — the modular ladder's
 * reference size, the tracking curve, the figure's line box — resolves through a
 * number in this file. Nothing downstream may
 * hard-code a font metric, because a hard-coded metric is a claim about a
 * binary that nobody re-checks when the binary changes.
 *
 * ── WHY THIS FILE HAD TO EXIST ─────────────────────────────────────────────
 *
 * The type system was designed around a DIFFERENT PAIR OF FACES and then had
 * Söhne + Söhne Mono swapped underneath it. The swap moved the
 * faces and left every optical constant where it was, so the app has been
 * setting Söhne with the old face's numbers ever since — most visibly in the tracking
 * band table, whose em figures were explicitly chosen so that "the DOMINANT call
 * sites do not move at all", i.e. so that the OLD values survived the swap
 * intact. That is the right way to migrate a face and the wrong way to finish.
 *
 * The two faces are not interchangeable at that level of detail. Söhne is fitted
 * tighter than the face it replaced (`n` carries 0.144em of sidebearing against its
 * ~0.17), so that tightening applied to Söhne over-tightens every heading
 * in the app — which is the single most reproducible answer to "the type feels
 * wrong and I cannot point at where".
 *
 * ── HOW THESE NUMBERS WERE TAKEN ───────────────────────────────────────────
 *
 * Read off `apps/mobile/assets/fonts/*` with fontTools: glyph OUTLINE bounds
 * through a BoundsPen, advances from `hmtx`, normalised by `head.unitsPerEm`
 * (1000 for every Söhne cut). Outlines, not the OS/2 fields: a shipped binary's
 * own tables can be wrong, and the retired serif proved it — ITC Garamond's
 * `sxHeight` reported half the real x-height, so anything trusting that table
 * set the face at double the intended size.
 *
 * `face-metrics.test.ts` re-reads the binaries and fails if any figure here has
 * drifted from what ships, so replacing a font file cannot silently invalidate
 * the system built on top of it.
 */

/** A face's vertical proportions, in em. */
export interface FaceMetrics {
  /** The binary these came from, relative to `apps/mobile/assets/fonts/`. */
  file: string;
  unitsPerEm: number;
  /** Outline height of `x` — the one number that decides how two faces pair. */
  xHeight: number;
  /** Outline height of `H`. */
  capHeight: number;
  /** Outline top of `l` — the true ascender, not the hhea field. */
  ascender: number;
  /** Outline bottom of `p` — the true descender, negative. */
  descender: number;
  /** Outline width of `l` — the face's stem, and its real weight. */
  stem: number;
  /** Advance of `n`, the width the face's rhythm is built on. */
  advanceN: number;
  /** `n`'s two sidebearings summed — the face's letterfit. */
  letterfitN: number;
}

/**
 * THE SANS, ALL FOUR CUTS.
 *
 * Note `xHeight` and `capHeight` barely move across the weight axis (0.523 →
 * 0.526, 0.718 flat): Söhne's weights are drawn on one skeleton, so a weight
 * change is a change of `stem` and nothing else. That is why the weight ladder
 * in `typography.ts` can be reasoned about as stem width alone.
 */
/**
 * THREE CUTS, not four — Dreiviertelfett left the bundle with `weight.bold`.
 * The app paints one ground and it is near-black, so the ladder tops out at
 * Halbfett; see the note on `weight` in typography.ts.
 */
export const SOHNE = {
  buch: { file: "Sohne-Buch.otf", unitsPerEm: 1000, xHeight: 0.523, capHeight: 0.718, ascender: 0.718, descender: -0.18, stem: 0.09, advanceN: 0.564, letterfitN: 0.144 },
  kraftig: { file: "Sohne-Kraftig.otf", unitsPerEm: 1000, xHeight: 0.525, capHeight: 0.718, ascender: 0.718, descender: -0.18, stem: 0.12, advanceN: 0.563, letterfitN: 0.122 },
  halbfett: { file: "Sohne-Halbfett.otf", unitsPerEm: 1000, xHeight: 0.526, capHeight: 0.718, ascender: 0.718, descender: -0.178, stem: 0.14, advanceN: 0.573, letterfitN: 0.112 },
} as const satisfies Record<string, FaceMetrics>;

/**
 * THE MONO, and the measurement that makes `fitMonoFigure` possible: every
 * glyph in every cut carries an advance of exactly 0.600em. Three cuts, one
 * advance, no exceptions — checked across the whole glyph order, not sampled.
 */
export const SOHNE_MONO = {
  buch: { file: "SohneMono-Buch.otf", unitsPerEm: 1000, xHeight: 0.523, capHeight: 0.718, ascender: 0.718, descender: -0.18, stem: 0.476, advanceN: 0.6, letterfitN: 0.18 },
  kraftig: { file: "SohneMono-Kraftig.otf", unitsPerEm: 1000, xHeight: 0.525, capHeight: 0.718, ascender: 0.718, descender: -0.18, stem: 0.476, advanceN: 0.6, letterfitN: 0.159 },
  halbfett: { file: "SohneMono-Halbfett.otf", unitsPerEm: 1000, xHeight: 0.526, capHeight: 0.718, ascender: 0.718, descender: -0.178, stem: 0.491, advanceN: 0.6, letterfitN: 0.139 },
} as const satisfies Record<string, FaceMetrics>;

/**
 * THE FIGURE CHARACTER SET'S INK, in em — the tallest and the deepest thing a
 * mono figure can draw, across every character the app's figure formats use.
 *
 * This is the number `lh.flush` is built on, and it is a CLOSED set, which is
 * the only reason a line box can be cut to fit it. The mono cut sets figures and
 * nothing else, and a figure is drawn from `0123456789 : . % × / + -` — so the
 * extremes are knowable in advance rather than discovered on somebody's phone.
 *
 *   digits   top +0.729   bottom -0.011  (the baseline overshoot on 0, 3, 6…)
 *   '/'      top +0.732   bottom -0.072  ← both extremes, and it is in `5:12 /km`
 *   '%'      top +0.718   bottom  0
 *
 * So the span is 0.732 - (-0.072) = 0.804em. Identical across the three mono
 * cuts: the weight axis moves stems, not heights.
 */
export const FIGURE_INK = { top: 0.732, bottom: -0.072 } as const;
export const FIGURE_INK_EM = Number((FIGURE_INK.top - FIGURE_INK.bottom).toFixed(3));

/**
 * THE DECLARED LINE METRICS — the numbers the PLATFORM lays text out with, and
 * the reason a line box has a floor that has nothing to do with the ink in it.
 *
 * All seven shipped cuts agree exactly: hhea ascent 1.037, descent -0.289,
 * lineGap 0 — and OS/2's typo and win pairs carry the same values, so it does
 * not matter which table a platform prefers. `face-metrics.test.ts` re-reads all
 * three tables from every binary.
 *
 * ── WHY THIS IS NOT TRIVIA, AND WHAT IT COST TO LEARN ─────────────────────
 *
 * React Native sets a declared `lineHeight` as BOTH the minimum and the maximum
 * line height (RCTTextAttributes, and it adds no baseline compensation of its
 * own). TextKit then honours it by keeping the font's DESCENT against the bottom
 * of the line fragment and taking the difference out of the ascent — the text
 * does not shrink and it does not centre, it slides down and the top of the
 * glyph is clipped by the fragment.
 *
 * So the space a line box actually offers ABOVE the baseline is
 * `box − descent`, whatever the string is. A box cut to the ink it carries is
 * therefore too small by the descent it will never use, and the failure is
 * silent: no error, no ellipsis, no reflow — the tops of the digits are simply
 * gone, at a size where every figure on the screen is drawn the same way.
 *
 * `lineBoxFloor` is that arithmetic, and `lh.flush` is its one consumer today.
 */
export const FACE_LINE = { ascent: 1.037, descent: 0.289, lineGap: 0 } as const;

/** The font's own line box — what you get when nothing declares a `lineHeight`. */
export const NATURAL_LINE_EM = Number((FACE_LINE.ascent + FACE_LINE.descent + FACE_LINE.lineGap).toFixed(3));

/**
 * The smallest line box, in em, that can carry ink reaching `inkTop` above the
 * baseline without the platform clipping it.
 *
 * The descent is added because it is RESERVED, not because anything occupies it
 * (a figure's deepest glyph is `/` at 0.072em). It cannot be reclaimed with
 * `lineHeight` — only by letting the box be honest and pulling the layout in
 * around it with a negative margin, which is a call-site decision.
 */
export const lineBoxFloor = (inkTop: number): number => Number((inkTop + FACE_LINE.descent).toFixed(3));

/**
 * PER-GLYPH ADVANCES, Söhne Halbfett — the widths a proportional fitter needs.
 *
 * `MONO_ADVANCE_EM` answers "how wide is a mono figure" with one number because
 * every mono glyph is the same width. A PROPORTIONAL value has no such shortcut,
 * and `session-wrapped.ts` needs one anyway: the Wrapped's hero and stat tiles
 * must know whether "2:20 /100m" fits before they commit to a size, and a
 * character COUNT is off by a third (the dot and the space are a third the width
 * of a digit).
 *
 * ── THIS TABLE BELONGED TO THE OLD FACE UNTIL Aug 2026, AND WAS STILL IN USE ──
 *
 * Not a stale comment — a stale MEASUREMENT, driving live layout. The Wrapped
 * fitter had been sizing Söhne figures against the previous face's widths ever
 * since the swap, and the two disagree badly where it matters most:
 *
 *     space   0.360 → 0.202   the old value is 78% too wide
 *     '.'     0.270 → 0.240
 *     'm'     0.770 → 0.879   14% too narrow
 *     digit   0.682 → 0.402 … 0.639
 *
 * So every value containing a space — "1500 m", "10.0 km", "2:20 /100m", which
 * is most of the endurance vocabulary the fitter was ADDED for — was measured
 * far too wide and shrunk further than it needed to be.
 *
 * DIGITS ARE LISTED INDIVIDUALLY, which the old table could not do: Söhne's `1`
 * is 0.402em against `0`'s 0.639, a 59% spread, so a single digit constant is
 * wrong for one end or the other. (The sans has no `tnum` feature to even them
 * out — see `sansHasNoOpenTypeFeatures` — so proportional is what renders.)
 *
 * HALBFETT because that is what `F.black` resolves to since the weight ladder
 * was capped at 600, and the Wrapped's figures are drawn with it. If `F.black`
 * ever moves again this table moves with it.
 *
 * `~` IS ABSENT FROM THE FACE. The Wrapped prefixes estimates with a tilde, and
 * the extended trial cuts do not carry one, so it renders in the platform
 * fallback and is fitted at `ADVANCE_FALLBACK_EM`. Listed here as a known hole
 * rather than discovered as a wrapped tile. `\u00df` is the same case, and so
 * are the two the TICKER DELTA draws: `\u25b2` and `\u25bc`, the up and down
 * triangles in "\u25b2 16.7%". Neither exists in ANY of the shipped cuts —
 * sans or mono, Buch or Halbfett — so both render in the platform's symbol
 * fallback at a width this table cannot know. Assume about 1em rather than the
 * mono cut's 0.6 when a slot has to hold one, and leave the slot room: the
 * arrows are the only characters in the app whose width is genuinely outside
 * our control.
 *
 * Checked with `cmap` lookups against all three binaries, not assumed. The
 * ones that ARE present and matter: `\u00d7` (the set multiplier), `\u2013`,
 * `\u2014`, `\u2192`, `%`, `/`, `:` and every figure.
 *
 * ── IT CARRIED NO CAPITALS UNTIL Aug 2026, AND A CAPS-ONLY RULE USED IT ────
 *
 * The table was built for the Wrapped's figures, so it held digits, punctuation
 * and the lowercase letters those values happen to contain. Every other
 * character fell to `ADVANCE_FALLBACK_EM`, which is fine for a stray unit
 * string and catastrophic for `nameplateLines` — a rule that UPPERCASES its
 * input before measuring it. Not one glyph it measured was in the table, so
 * "measured" meant `length × 0.6`: a character count wearing a decimal point,
 * which is precisely the mistake the rule was rewritten to stop making.
 *
 * Söhne Halbfett's capitals run 0.272em (`I`) to 0.943em (`W`) — a 3.5×
 * spread, against a constant. The under-read reached 14%:
 *
 *     SCHWIMMEN   5.40 assumed   6.27 real     the German name that decided it
 *     RADFAHREN   5.40           6.11
 *     ROMANIAN    4.80           5.43
 *     SQUASH      3.60           4.08
 *     TENNIS      3.60           3.56          ...and sometimes it over-read
 *
 * That is not a rounding difference, it is the difference between "German
 * clears the plate outright" — which `fitsNameplate` and capabilities.ts both
 * asserted — and German being the language that does not. The full Latin set is
 * here now, both cases, plus the Polish and German accents, all read off the
 * binary and re-read by the test beside this file.
 */
export const SOHNE_ADVANCE_EM: Record<string, number> = {
  " ": 0.202, ".": 0.24, ",": 0.24, ":": 0.24, "/": 0.416,
  "+": 0.403, "\u2212": 0.403, "-": 0.368, "%": 0.594, "\u00b0": 0.412,
  "0": 0.639, "1": 0.402, "2": 0.576, "3": 0.58, "4": 0.615,
  "5": 0.58, "6": 0.599, "7": 0.557, "8": 0.606, "9": 0.599,
  // Lowercase — the fitter's original set, completed. b, f, j, q, v, w, x, y
  // and z were absent and fell to the 0.6 fallback, which is 86% too wide for
  // `f` and 19% too narrow for `w`.
  a: 0.544, b: 0.6, c: 0.525, d: 0.6, e: 0.548, f: 0.323, g: 0.601, h: 0.573,
  i: 0.255, j: 0.255, k: 0.562, l: 0.255, m: 0.879, n: 0.573, o: 0.57, p: 0.6,
  q: 0.6, r: 0.391, s: 0.501, t: 0.35, u: 0.573, v: 0.523, w: 0.74, x: 0.528,
  y: 0.523, z: 0.507,
  // UPPERCASE — see the note above about the nameplate. Not one of these was
  // in the table, and the nameplate rule measures nothing else.
  A: 0.721, B: 0.644, C: 0.671, D: 0.702, E: 0.597, F: 0.581, G: 0.73,
  H: 0.738, I: 0.272, J: 0.407, K: 0.671, L: 0.555, M: 0.861, N: 0.731,
  O: 0.733, P: 0.639, Q: 0.733, R: 0.66, S: 0.596, T: 0.628, U: 0.696,
  V: 0.698, W: 0.943, X: 0.687, Y: 0.662, Z: 0.634,
  // Polish and German, both cases. The app ships three languages and the two
  // that are not English are the ones whose names run long.
  "\u0104": 0.721, "\u0106": 0.671, "\u0118": 0.597, "\u0141": 0.555, "\u0143": 0.731,
  "\u00d3": 0.733, "\u015a": 0.596, "\u017b": 0.634, "\u0179": 0.634,
  "\u00c4": 0.721, "\u00d6": 0.733, "\u00dc": 0.696,
  "\u0105": 0.544, "\u0107": 0.525, "\u0119": 0.548, "\u0142": 0.255, "\u0144": 0.573,
  "\u00f3": 0.57, "\u015b": 0.501, "\u017c": 0.507, "\u017a": 0.507,
  "\u00e4": 0.544, "\u00f6": 0.57, "\u00fc": 0.573,
};

/**
 * The width assumed for a character the table does not carry — `~`, and any
 * unit or locale string that grows one. Söhne Halbfett's lowercase averages
 * 0.55em and its digits 0.575em; 0.6 is a deliberate over-estimate, because a
 * fitter that guesses HIGH shrinks a value that would have fitted, while one
 * that guesses low lets a value wrap — and a wrapped figure drags its label out
 * of line with the tiles beside it.
 */
export const ADVANCE_FALLBACK_EM = 0.6;

/** A face's ink span — ascender to descender, the height leading has to clear. */
export const inkSpan = (m: FaceMetrics): number => Number((m.ascender - m.descender).toFixed(4));

/**
 * ── WHAT THE BINARIES DO NOT CARRY, AND WHAT IT COSTS ──────────────────────
 *
 * These are constraints on the SYSTEM, not trivia. Each one invalidates
 * something the type system would otherwise be entitled to assume.
 */
export const FACE_LIMITS = {
  /**
   * THE SANS HAS NO OPENTYPE FEATURES AT ALL. `GSUB` is empty in all four
   * Söhne cuts and all three mono cuts.
   *
   * The consequence is specific and it contradicts a guarantee the system used
   * to make: `font-variant-numeric: tabular-nums` DOES NOTHING on these files,
   * because there is no `tnum` feature to activate. `scale.ts`'s note that "both
   * ship proportional and tabular numeral sets" was true of the previous pair and
   * the mono face it replaced, and is false of what ships.
   *
   * So the app's column alignment does not rest on `tnum` and never can. It
   * rests on the MONO CUT, whose 0.600em advance is uniform by construction —
   * which is why `typography.ts` requires every measured value to be `mono`,
   * and why that rule is load-bearing rather than stylistic. `TABULAR_NUMS` is
   * still emitted, and is correct the day a fuller licence lands, but it is
   * belt-and-braces and must never be cited as the mechanism.
   */
  sansHasNoOpenTypeFeatures: true,
  /**
   * THE SANS DIGITS ARE PROPORTIONAL — eight distinct advances in Buch, from
   * 0.376em (`1`) to 0.623em. Any number set in `cut.sans` will misalign in a
   * column and will jitter if it animates. `unitFor` is sans and that is fine
   * (a unit is not a column); a FIGURE in sans is a bug.
   */
  sansDigitsAreProportional: true,
  /**
   * THE SANS CANNOT SET GERMAN. `ß` is absent from all four Söhne cuts — the
   * files are 121-glyph trial cuts extended by `reference/sohne-extend.py`, and
   * the extension added punctuation, not letters. The `vocabulary-pl-de`
   * capability needs a fuller licence before German can ship, or every `ß`
   * falls through to whatever the platform substitutes mid-word.
   */
  sansMissingEszett: true,
} as const;
