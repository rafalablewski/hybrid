import type { SemanticRole } from "./semantic";
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

/**
 * A DELTA'S DIRECTION → A STATE ROLE. The one mapping for "this number moved".
 *
 * THE DRIFT THIS ENDS (audit/12 §5.4): four surfaces each decided for themselves
 * what a fall looks like — the trends table drew it in sand, the week verdict and
 * the endurance summary in terracotta, and Wrapped in the retired steel blue. So
 * the same fact about the same athlete had three colours depending on which
 * screen was open, and `statSubTone` sat right here returning up/down/flat with
 * ZERO consumers, because the tone→colour half was never written. This is it.
 *
 * WHY ONE MAPPING IS SAFE, which is the part worth checking before trusting it:
 * these directions are already VALENCE-NORMALISED upstream. `statSubTone`'s own
 * contract is that `up` means "the figure moved the way the athlete wanted", and
 * `paceTrend` encodes exactly that — a pace that DROPS returns "up", with the
 * comment "lower pace = faster = improving". So `down` is never merely a smaller
 * number; it is always a regression, and can always take the same role.
 *
 * `danger` rather than `caution`: three of the four surfaces already drew a fall
 * in the danger accent, and with valence normalised a fall IS the strongest
 * negative reading the data has.
 *
 * AND IT IS A ROLE, NOT A FEEDBACK COLOUR. A figure that went down is a reading
 * on the training ramp, not a failed operation — so this resolves through
 * ROLE_COLOR to Muskmelon, and never to FEEDBACK.error. See theme/feedback.ts
 * for the line between the two.
 */
export function deltaRole(dir: StatSubTone): SemanticRole {
  return dir === "up" ? "go" : dir === "down" ? "danger" : "neutral";
}
