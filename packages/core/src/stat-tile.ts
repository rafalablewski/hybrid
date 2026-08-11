/**
 * THE STAT TILE's contract — the one anatomy both clients draw for "a mono
 * label over one big figure", and the rule for how its sub-line is toned.
 *
 * Web has `Stat` (apps/web/lib/ui.tsx) and mobile has `AStat` (the aurora kit).
 * Everything about the tile that is a DECISION rather than a style lives here,
 * so the two cannot answer it differently.
 */

/** What a stat's sub-line is saying. */
export type StatSubTone =
  /** A gain — the figure moved the way the athlete wanted. */
  | "up"
  /** A loss. */
  | "down"
  /** Not a delta at all: a caption, a date, a denominator, a band name. */
  | "flat";

/**
 * How to tone a stat tile's sub-line.
 *
 * ONLY a sign-led sub carries a tone. Both clients used to paint every
 * non-negative sub in the "good" accent, which meant a sub that was not a
 * delta at all got congratulated: web rendered `sub={dateStr}` — a DATE — in
 * chartreuse, along with "not enough data", "ARR $1.2M" and every portion
 * subtitle. Colour is supposed to encode state in this app, and a green date
 * encodes nothing.
 *
 * The deliberate cases are preserved, because they are already sign-led: the
 * admin panels prefix a failing threshold with a literal minus ("−below 40",
 * "−runs dry") precisely so it reads as bad, and a delta like "+124" reads as
 * good. Everything else is now neutral, which is what it always meant.
 *
 * `↑`/`↓` are accepted alongside `+`/`−` (and ASCII `-`) because both arrows
 * appear in shipped copy.
 */
export function statSubTone(sub: string | null | undefined): StatSubTone {
  if (!sub) return "flat";
  const head = sub.trim().charAt(0);
  if (head === "−" || head === "-" || head === "↓") return "down";
  if (head === "+" || head === "↑") return "up";
  return "flat";
}
