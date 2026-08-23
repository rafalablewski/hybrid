import { textWidthEm } from "./session-wrapped";
import { CAPS_AIR_EM, fs, opticalTrackEm } from "./scale";

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
 * A nameplate inverts it. The name takes `fs.display` at weight 900 in caps,
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
 * weight 900 where that difference is at its widest.
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
  opts: { budgetEm?: number; trackingEm?: number; maxLines?: number } = {},
): NameplateName {
  const budgetEm = opts.budgetEm ?? NAMEPLATE_LINE_EM;
  const trackingEm = opts.trackingEm ?? NAMEPLATE_TRACK_EM;
  const width = (s: string) => textWidthEm(s.toUpperCase(), trackingEm);
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
