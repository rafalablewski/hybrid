import { textWidthEm } from "./session-wrapped";
import { CAPS_AIR_EM, MONO_ADVANCE_EM, fs, opticalTrackEm } from "./scale";

/**
 * THE NAMEPLATE — the plate whose SUBJECT is its name.
 *
 * ── WHAT IT IS ────────────────────────────────────────────────────────────
 *
 * Every card in this app had settled on the same shape: a small name at
 * `fs.body`, a big figure at `fs.display`, and some drawing underneath. That is
 * the right hierarchy for a card you are READING — you already know which lift
 * you tapped, so the number leads.
 *
 * It is the wrong hierarchy for a card you are SCANNING. A rail of movements, a
 * grid of disciplines, a column of macros: you are not reading those, you are
 * LOOKING FOR ONE. The name is the target and the figure is the payload, and
 * the app had them the other way round — 13dp of name under 26dp of number,
 * with the name the part that truncated.
 *
 * A nameplate inverts it. The name takes `fs.display` in the heaviest cut the
 * app ships — `F.black`, which resolves to Söhne HALBFETT (600) since the
 * weight ladder was capped; there is no 900 in this family any more — in caps,
 * the figure recedes to a caption on the bottom edge, and a hairline between
 * them gives the word a floor.
 *
 * ── THE RULE, AND IT IS THE WHOLE RULE ────────────────────────────────────
 *
 * A NAMEPLATE NEEDS A SHORT NOUN. That is not a preference, it is the
 * treatment's one load-bearing condition: a line is about five and a half em
 * wide at display size, so "Running" is a nameplate and "Standing Overhead
 * Press" is three lines of shouting. `nameplateLines` is where that
 * condition is CHECKED rather than assumed — a caller asks, and a surface whose
 * nouns do not fit is told so instead of shipping a wall of ellipses.
 *
 * Where the noun is long the app uses the other shape (the deck: one full-width
 * card at a time, name at reading size, figure at `fs.stat`). Two treatments,
 * one decision procedure, and the decision is a property of the DATA rather
 * than of whoever built the screen.
 *
 * ── WHY THE SPLIT LIVES IN CORE ───────────────────────────────────────────
 *
 * Because it is the kind of small formatting judgement that grows a second
 * spelling the moment a second surface needs it, and then the disciplines wrap
 * one way on Endurance and another way on Today. It is pure, so it is tested;
 * it is shared, so it cannot drift.
 */

/**
 * THE LINE'S BUDGET, IN EM OF THE NAME'S OWN SIZE — 5.4em, which is the two-up
 * plate on a 390dp screen: 366 content, less an 8dp gap and halved is 179, less
 * `APanel`'s 12dp pad on each side and its rim is ~153dp, over `fs.display`.
 *
 * IT IS EM AND NOT CHARACTERS, and that is the correction rather than a
 * refinement. A character count was the first cut and it shipped a bug within
 * one merge: it said "eleven characters" and Polish "Wioślarstwo" is exactly
 * eleven, so the rule reported FITS while the word measured 172dp against a
 * 153dp plate and would have been clipped on the phone. A count cannot know
 * that `W` and `I` are not the same width, and a nameplate is set in caps at
 * Halbfett caps, where that difference is at its widest: `W` is 0.943em against
 * `I` at 0.272, a 3.5× spread.
 *
 * So the rule MEASURES, through `textWidthEm` and the same Söhne advance table
 * the wrapped-summary hero fits its figures with. It also means the rule
 * survives the type ladder moving underneath it — which is exactly what caught
 * it out: `fs.display` went 26 → 28 when the scale was re-derived from the
 * shipped binaries, and a count has no way to notice.
 */
export const NAMEPLATE_LINE_EM = 5.4;

/** Lines a plate can set before the treatment stops being a nameplate and
 *  starts being a paragraph in capitals. */
export const NAMEPLATE_MAX_LINES = 3;

/**
 * The tracking a nameplate is ACTUALLY drawn with, so the rule measures the
 * thing that gets rendered. Defaulting this to zero measured a nameplate that
 * does not exist and made the rule pessimistic by about 4% of its width —
 * enough to split "Back Squat" onto two lines on paper while the phone set it
 * happily on one.
 */
export const NAMEPLATE_TRACK_EM = CAPS_AIR_EM.wordmark + opticalTrackEm(fs.display);

export interface NameplateName {
  /** The word(s) per line, top to bottom. The FIRST line is the lead and takes
   *  the foreground; the rest recede — one word, two weights, no second colour
   *  channel spent. */
  lines: string[];
  /**
   * The name sets in ONE line — the density the treatment was designed for and
   * the only one that reads as a mark rather than as wrapped text.
   *
   * A surface can use this to decide, per item, whether to render a nameplate
   * at all; `fitsNameplate` is the same question asked of a whole set, which is
   * the question a SECTION actually has.
   */
  compact: boolean;
  /** The name could not be set inside `NAMEPLATE_MAX_LINES` and the last line
   *  carries the remainder. The caller has to decide: another treatment, or a
   *  smaller rung. Nothing here silently truncates. */
  overflows: boolean;
}

/**
 * A name, broken for a nameplate — `nameplateLines("Romanian Deadlift")` →
 * `{ lines: ["Romanian", "Deadlift"], compact: false, overflows: false }`.
 *
 * BREAKS ON WORDS, NEVER INSIDE ONE. A hyphenated display face setting a lift
 * name is a different product; and a word that is on its own too long for a
 * line (there are none in the catalogue today, but "Kettlebell" is close) still
 * gets its own line rather than being cut — the plate is allowed to look tight,
 * it is not allowed to lie about the name.
 */
export function nameplateLines(
  name: string,
  opts: { budgetEm?: number; trackingEm?: number; maxLines?: number; caps?: boolean } = {},
): NameplateName {
  const budgetEm = opts.budgetEm ?? NAMEPLATE_LINE_EM;
  const trackingEm = opts.trackingEm ?? NAMEPLATE_TRACK_EM;
  // MEASURE THE CASE THAT RENDERS. A nameplate sets in capitals, so this
  // uppercases by default and that is right for the wordmark. It is wrong for
  // a caller at a smaller rung, where the name sets as written — and the error
  // is not small: Söhne's capitals average 0.66em against 0.55 for its
  // lowercase, so measuring "Overhead Press" as "OVERHEAD PRESS" over-reads by
  // about 15% and costs the name a whole rung. Same fault as measuring a
  // monospaced string with the proportional table, one level up.
  const caps = opts.caps ?? true;
  const width = (s: string) => textWidthEm(caps ? s.toUpperCase() : s, trackingEm);
  const maxLines = opts.maxLines ?? NAMEPLATE_MAX_LINES;
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { lines: [], compact: false, overflows: false };

  const lines: string[] = [];
  for (const word of words) {
    const last = lines.length - 1;
    // Greedy fill, except once the plate is on its final allowed line: from
    // there everything remaining joins it, so `overflows` reports a real
    // measurement of the name rather than the point the loop gave up.
    if (last >= 0 && (lines.length >= maxLines || width(`${lines[last]} ${word}`) <= budgetEm)) {
      lines[last] = `${lines[last]} ${word}`;
    } else {
      lines.push(word);
    }
  }

  const overflows = lines.length > maxLines || lines.some((l) => width(l) > budgetEm);
  return { lines, compact: lines.length === 1 && !overflows, overflows };
}

/**
 * Does a WHOLE SET of names suit the treatment? — the question a section asks
 * once, at build time, rather than per card at paint time.
 *
 * A rail is only as good as its worst name: five one-word disciplines and one
 * three-line outlier is not "mostly fine", it is a row with a hole in it. So
 * this is deliberately strict — every name must set inside `maxLines`, and the
 * set must be mostly `compact`.
 *
 * Endurance passes it (seven disciplines, every one a single word). The
 * movement catalogue does not, which is the whole reason Today's Exercises
 * keeps the other shape.
 */
export function fitsNameplate(
  names: string[],
  opts: { budgetEm?: number; trackingEm?: number; maxLines?: number } = {},
): boolean {
  if (names.length === 0) return false;
  const broken = names.map((n) => nameplateLines(n, opts));
  if (broken.some((b) => b.overflows)) return false;
  const compact = broken.filter((b) => b.compact).length;
  return compact * 2 >= names.length;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE BASE — the plate's two small facts, and the measurement that got it wrong
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The name is set in the SANS, so it is measured with `textWidthEm` and Söhne's
 * per-glyph table. The base is set in the MONO, and that is a different
 * question with a much easier answer: Söhne Mono's `hmtx` carries a single
 * advance — `numHMetrics` is 1 — so every glyph is 0.600em and a string's width
 * is its LENGTH. `MONO_ADVANCE_EM` in scale.ts has said so all along.
 *
 * The base still shipped mis-measured, because the fitter that was to hand was
 * the proportional one. Run "12 EFFORTS" through `textWidthEm` and it comes
 * back 5.38em — Söhne's narrow `F`, `E` and `T` counted at their sans widths —
 * against a true 6.00em. That is a 10% under-read, and it landed on the wrong
 * side of a line that had 5.86em to give: the note was declared a fit with room
 * to spare and rendered "12 EFFORT…". A proportional table applied to a
 * monospaced face is not an approximation of it, it is a different font.
 *
 * These two functions exist so the next base is measured with the right ruler
 * and against the right budget.
 */

/**
 * THE PLATE'S LINE, IN DP — the width one fact may occupy.
 *
 * 390dp screen, less AuroraScreen's 12dp gutter each side, is 366; less the
 * 8dp grid gap and halved is a 179dp plate; less `APanel`'s 12dp pad each side
 * and its 1dp rim is 153.
 *
 * DP AND NOT EM, unlike `NAMEPLATE_LINE_EM`, because the base carries two
 * DIFFERENT sizes — the note at `fs.nano`, the figure at `fs.bodyLg` — so em of
 * whose size is not a question with one answer.
 */
export const NAMEPLATE_LINE_DP = 153;

/** Rendered width of a mono string at `size` dp. Length × 0.6em, because that
 *  is the whole of Söhne Mono's metric. */
export const monoWidthDp = (value: string, size: number): number =>
  value.length * size * MONO_ADVANCE_EM;

/**
 * Do a plate's note and figure fit — STACKED, each on its own line?
 *
 * This is the question the base actually asks now. It used to ask whether they
 * fit SIDE BY SIDE, sharing one line with an 8dp gap between them, and the
 * answer was no in every language once the figure ran to "14h 43min":
 *
 *     line                        153.0dp
 *     figure "14h 43min"  9 × 9.6  86.4
 *     gap                           8.0
 *     ── leaving the note ─────────────── 58.6dp, which is NINE CHARACTERS
 *     "12 EFFORTS"       10 × 6.0   60.0   over by 1.4
 *     "12 WYSIŁKI"       10 × 6.0   60.0   over by 1.4
 *     "12 EINHEITEN"     12 × 6.0   72.0   over by 13.4
 *
 * Stacked, each fact has the whole 153dp: 25 characters at `fs.nano`, 15 at
 * `fs.bodyLg`. That is not a tuned budget, it is a different shape — which is
 * the point, because a budget nine characters wide is one word away from
 * failing again in a language nobody tested.
 */
export function nameplateBaseFits(
  note: string | undefined,
  figure: string | undefined,
  opts: { lineDp?: number; noteSize?: number; figureSize?: number } = {},
): boolean {
  const line = opts.lineDp ?? NAMEPLATE_LINE_DP;
  const noteSize = opts.noteSize ?? fs.nano;
  const figureSize = opts.figureSize ?? fs.bodyLg;
  if (note && monoWidthDp(note, noteSize) > line) return false;
  if (figure && monoWidthDp(figure, figureSize) > line) return false;
  return true;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RUNG A SET OF NAMES CAN AFFORD — one rule, two sections, no taste
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `fitsNameplate` answers a yes/no: may this surface use the wordmark at all?
 * That was enough while exactly one surface asked. It stopped being enough the
 * moment Today carried TWO name-led sections side by side, because a yes/no
 * leaves the loser with no answer — Endurance got `fs.display` and Exercises
 * got whatever the person building it happened to choose, which is how the
 * screen ended up with a name at 14 over a figure at 28 sitting 200dp from a
 * name at 28 over a figure at 16.
 *
 * That is not two hierarchies, it is one hierarchy and one accident. The fix is
 * not to pick a compromise size; it is to make the size DERIVED:
 *
 *     THE NAME TAKES THE LARGEST RUNG AT WHICH EVERY NAME IN THE SET STILL
 *     SETS INSIDE `maxLines`. THE FIGURE IS ALWAYS `fs.bodyLg`, ON THE BOTTOM
 *     EDGE, UNDER A HAIRLINE.
 *
 * Run it over the six disciplines and it returns `fs.display` — one short word
 * each, so the wordmark is affordable. Run it over the movement catalogue in a
 * card of the same width and it returns `fs.subtitle`, because "Standing
 * Overhead Press" is three words and the rung has to pay for them. Both
 * sections then lead with the name and recede the figure; the RATIO differs
 * because the NAMES differ, which is the system working rather than failing.
 *
 * CAPS IS A PROPERTY OF THE SET, not an input the caller argues about — and it
 * follows the WORD COUNT rather than the size. A single word in capitals is a
 * mark; three words in capitals is the wall of shouting this module exists to
 * prevent, at any size. Tying it to the rung instead was the first cut and it
 * gave a worse answer in two of the app's three languages: Polish
 * "Wioślarstwo" will not set at 28 but sets happily in CAPS at 20, and a rule
 * that dropped it to sentence case there threw away the treatment over a
 * measurement that had nothing to do with case.
 */

/** The rungs a name may take, largest first. `fs.display` is the wordmark; the
 *  floor is `fs.body`, below which a "name-led" card is not name-led. */
export const NAMEPLATE_RUNGS = [fs.display, fs.headline, fs.title, fs.subtitle, fs.bodyLg, fs.body] as const;

export interface NameplateRung {
  /** The type size the name sets at. */
  size: number;
  /** Capitals — true only at the wordmark rung. See the note above. */
  caps: boolean;
  /** Letter-spacing in em at that size, for whichever case it resolved to. */
  trackingEm: number;
  /** The most lines any name in the set needs at this rung, so a caller can
   *  size `numberOfLines` to the real worst case rather than to a guess. */
  lines: number;
}

/**
 * The largest rung at which EVERY name in `names` sets inside `maxLines`.
 *
 * `widthDp` is the name's own line — the card's content width, less anything
 * sharing the name's row. Defaults to `NAMEPLATE_LINE_DP`, the two-up plate.
 *
 * Falls back to the smallest rung rather than reporting failure: by the time a
 * name will not set at `fs.body` in 153dp the answer is not a smaller number,
 * it is a different component, and `fitsNameplate` is where that question
 * belongs.
 */
export function nameplateRung(
  names: string[],
  opts: { widthDp?: number; maxLines?: number; rungs?: readonly number[] } = {},
): NameplateRung {
  const width = opts.widthDp ?? NAMEPLATE_LINE_DP;
  // TWO, not `NAMEPLATE_MAX_LINES`. Three is what a plate will TOLERATE before
  // the name is truncated; it is not what a rung should aim at. Given a set
  // that needs three lines at one rung and two at the next, the two-line rung
  // is the better card every time — and picking it is the whole reason this
  // function exists rather than a constant.
  const maxLines = opts.maxLines ?? 2;
  const rungs = opts.rungs ?? NAMEPLATE_RUNGS;
  // ONE WORD EACH → it is a wordmark, and wordmarks are set in capitals.
  const caps = names.every((n) => n.trim().split(/\s+/).filter(Boolean).length === 1);
  const at = (size: number) => {
    const trackingEm = caps ? CAPS_AIR_EM.wordmark + opticalTrackEm(size) : opticalTrackEm(size);
    const broken = names.map((n) =>
      nameplateLines(n, { budgetEm: width / size, trackingEm, maxLines, caps }),
    );
    return {
      size, caps, trackingEm,
      lines: Math.max(1, ...broken.map((b) => b.lines.length)),
      fits: !broken.some((b) => b.overflows),
    };
  };
  if (names.length === 0) return { ...at(rungs[rungs.length - 1]!), lines: 1 };
  for (const size of rungs) {
    const r = at(size);
    if (r.fits) return { size: r.size, caps: r.caps, trackingEm: r.trackingEm, lines: r.lines };
  }
  const last = at(rungs[rungs.length - 1]!);
  return { size: last.size, caps: last.caps, trackingEm: last.trackingEm, lines: maxLines };
}
