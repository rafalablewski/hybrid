/**
 * WHAT THE SHIPPED BINARIES ACTUALLY MEASURE.
 *
 * Every optical constant in `scale.ts` and `typography.ts` — the modular ladder's
 * reference size, the tracking curve, the figure's line box, the serif's size
 * compensation — resolves through a number in this file. Nothing downstream may
 * hard-code a font metric, because a hard-coded metric is a claim about a
 * binary that nobody re-checks when the binary changes.
 *
 * ── WHY THIS FILE HAD TO EXIST ─────────────────────────────────────────────
 *
 * The type system was designed around a DIFFERENT PAIR OF FACES and then had
 * Söhne + Söhne Mono + ITC Garamond swapped underneath it. The swap moved the
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
 * (1000 for the Söhne cuts, 2048 for ITC Garamond). Outlines, not the OS/2
 * fields — ITC Garamond's `sxHeight` reports 0.220em, which is not a possible
 * x-height and is exactly half the real one, so the table is wrong in the
 * binary and anything trusting it lands at double the intended size.
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
 * THE SERIF — ITC Garamond Std Book, one weight, and the reason the pairing is
 * possible at all.
 *
 * ITC Garamond is a 1975 phototype interpretation, not an old-style revival, and
 * its x-height is famously enormous for a Garamond: 0.441em against a true
 * Garamond's ~0.40 and Söhne's 0.523. That 0.441 is what lets a serif sit beside
 * a grotesque without reading as a smaller, older voice — see
 * `SERIF_SIZE_RATIO` in scale.ts.
 *
 * Its cap-height (0.623) is much shorter than Söhne's (0.718), and that is a
 * gift rather than a problem: at the x-height-matched sizes the two faces' CAPS
 * land within half a dp of each other as well (see `capMatchAt` below), so the
 * pairing is correct on both of the axes a reader actually registers.
 */
export const ITC_GARAMOND = {
  book: { file: "ITCGaramondStd-Bk.ttf", unitsPerEm: 2048, xHeight: 0.4409, capHeight: 0.623, ascender: 0.6948, descender: -0.2261, stem: 0.2461, advanceN: 0.5815, letterfitN: 0.0298 },
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
 * rather than discovered as a wrapped tile.
 */
export const SOHNE_ADVANCE_EM: Record<string, number> = {
  " ": 0.202, ".": 0.24, ",": 0.24, ":": 0.24, "/": 0.416,
  "+": 0.403, "\u2212": 0.403, "-": 0.368, "%": 0.594, "\u00b0": 0.412,
  "0": 0.639, "1": 0.402, "2": 0.576, "3": 0.58, "4": 0.615,
  "5": 0.58, "6": 0.599, "7": 0.557, "8": 0.606, "9": 0.599,
  a: 0.544, c: 0.525, d: 0.6, e: 0.548, g: 0.601, h: 0.573, i: 0.255,
  k: 0.562, l: 0.255, m: 0.879, n: 0.573, o: 0.57, p: 0.6, r: 0.391,
  s: 0.501, t: 0.35, u: 0.573,
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
 * The size at which `serif` matches `sans` optically — the x-height ratio.
 *
 * TWO FACES READ AS ONE SIZE WHEN THEIR x-HEIGHTS MATCH, not when their point
 * sizes do. Lowercase is what a reader measures a face by; the em square is an
 * arbitrary box neither face fills.
 */
export const SERIF_SIZE_RATIO = Number((SOHNE.buch.xHeight / ITC_GARAMOND.book.xHeight).toFixed(5));

/**
 * What the two faces' CAPS do at the x-height-matched pair — the check that the
 * ratio above is not buying agreement on one axis at another's expense.
 * At sans 28 / serif 33 this returns { sans: 20.1, serif: 20.56 }: half a dp
 * apart on a 20dp cap, which is below the threshold anyone can see.
 */
export const capMatchAt = (sansSize: number, serifSize: number) => ({
  sans: Number((sansSize * SOHNE.buch.capHeight).toFixed(2)),
  serif: Number((serifSize * ITC_GARAMOND.book.capHeight).toFixed(2)),
});

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
  /**
   * THE SERIF CANNOT SET POLISH OR CZECH. ITC Garamond Std carries `Ł ł ó Ó`
   * but not `ą ę ś ż ź ć ń`. This is why `cut.serif` is English-only and why
   * every consumer falls back to `sans` rather than rendering a line with holes
   * in it — a rule that predates this file and is confirmed by it.
   */
  serifMissingPolish: true,
  /**
   * THE SERIF'S FIGURES DESCEND — top +0.742, bottom -0.102, an 0.844em span
   * against the mono's 0.804. They are hybrid figures, not lining ones, so they
   * will not sit in a row of mono figures and will not fit a `flush` box. The
   * serif is barred from figures on typographic grounds anyway; this is the
   * metric reason the bar is not negotiable.
   */
  serifFiguresDescend: true,
} as const;
