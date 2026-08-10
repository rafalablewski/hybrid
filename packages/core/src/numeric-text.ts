/**
 * NUMERIC TEXT — what changed between two renderings of the same figure, so a
 * number can ROLL to its new value instead of being swapped for it.
 *
 * This is a training app: numbers changing IS the content. A weight going
 * 80 → 82.5, a rest clock counting down, a macro total climbing as the day is
 * logged — every one of those was a plain re-render, the old string replaced by
 * the new one in a single frame with nothing to say which way it moved. SwiftUI
 * ships `contentTransition(.numericText())` for exactly this case and the whole
 * of iOS uses it; the equivalent has to be built here, once, for both clients.
 *
 * WHY A CORE FUNCTION AND NOT TWO COMPONENTS. The interesting part is not the
 * animation, it is the DIFF: which characters kept their identity, which are
 * new, and which way the value moved. Get that wrong on one client and the same
 * number rolls one way in the browser and the other way on the phone. The
 * clients are left with only "translate this cell up or down".
 *
 * THE DIRECTION IS THE VALUE'S, NOT THE DIGIT'S. 80 → 79 rolls DOWN even though
 * the units digit 0 → 9 is arithmetically an increase, because what the user is
 * watching is the number falling. Per-digit direction is the classic
 * odometer-emulation bug and it reads as noise.
 */

/** One character position in the rendered figure. */
export interface NumericCell {
  /** The character to show now. */
  char: string;
  /** What was in this position before, or null if the position is new. */
  prev: string | null;
  /** Did this position's character change? Only these roll. */
  changed: boolean;
  /** A digit rolls; a separator, unit or sign does not. */
  rolls: boolean;
  /** Stable across renders for the SAME position, so a client can key on it. */
  key: string;
}

export interface NumericDiff {
  cells: NumericCell[];
  /** +1 the value went up, −1 down, 0 no change (or not comparable). */
  dir: 1 | -1 | 0;
}

/** Only the digits roll. A decimal point, a colon, a comma, a unit or a sign is
 *  punctuation: rolling it would animate the shape of the number rather than
 *  its value. */
function rolls(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

/**
 * Which way the value moved. Parsed as a number where both sides parse — the
 * only honest comparison for "80" vs "100", where the strings sort the wrong
 * way — and falling back to a string comparison for anything else (a clock like
 * "1:59", a label). Anything genuinely incomparable is 0 and does not roll.
 */
function direction(prev: string, next: string): 1 | -1 | 0 {
  if (prev === next) return 0;
  const a = Number(prev.replace(/[^\d.-]/g, ""));
  const b = Number(next.replace(/[^\d.-]/g, ""));
  if (Number.isFinite(a) && Number.isFinite(b) && a !== b) return b > a ? 1 : -1;
  // A clock ("12:04") loses its meaning to the strip above, so compare the
  // punctuation-stripped digits positionally instead: same length means the
  // higher string is the higher value, and a longer one is more digits.
  const da = prev.replace(/\D/g, "");
  const db = next.replace(/\D/g, "");
  if (da.length !== db.length) return db.length > da.length ? 1 : -1;
  if (da === db) return 0;
  return db > da ? 1 : -1;
}

/**
 * Align the two strings from the RIGHT.
 *
 * 99 → 100 is the case that decides this: aligned from the left the tens column
 * would be asked to roll 9 → 0 and the units 9 → 0 while a "1" appears from
 * nowhere at the end, which is not what happened. Aligned from the right, the
 * two 9s roll to 0 and the hundreds column is genuinely NEW — which is what the
 * eye expects, and what an odometer does.
 *
 * `key` is therefore counted from the right too: the units column stays the
 * units column when the number grows a digit, so a client keying on it does not
 * remount every cell on the tick from 9 to 10.
 */
export function numericDiff(prev: string, next: string): NumericDiff {
  const dir = direction(prev, next);
  const cells: NumericCell[] = [];
  const n = next.length;
  for (let i = 0; i < n; i++) {
    const fromRight = n - 1 - i;
    const p = prev.length - 1 - fromRight;
    const before = p >= 0 ? prev[p]! : null;
    const char = next[i]!;
    cells.push({
      char,
      prev: before,
      changed: before !== char,
      rolls: rolls(char) && dir !== 0,
      key: `r${fromRight}`,
    });
  }
  return { cells, dir };
}

/**
 * Should this change roll at all?
 *
 * A figure that changed its SHAPE — "—" to "82.5", "3 sets" to "Rest" — is not
 * one value becoming another, it is one thing being replaced by a different
 * thing, and rolling it would animate a relationship that isn't there. The same
 * goes for the first render, where there is no previous value to leave.
 */
export function numericRolls(prev: string | null | undefined, next: string): boolean {
  if (prev == null || prev === "" || prev === next) return false;
  const digits = (s: string) => /\d/.test(s);
  return digits(prev) && digits(next);
}
