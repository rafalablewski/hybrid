/**
 * HISTORY STRIP — the Progress cluster's ONE way of drawing history
 * (consistency wave 2; see the "Progress, made consistent" design study).
 *
 * Every rail tile on Today that shows "how the last stretch went" draws the
 * SAME chart: up to eight bars in one fixed-height zone, past periods at a
 * 34% tint, the current period at full strength, in the block's semantic hue.
 * The clients own the pixels (aurora/history-strip.tsx on both); this module
 * owns the NUMBERS, so web and mobile can never normalize the same series two
 * different ways.
 *
 * Two normalizations exist because two kinds of series exist:
 *
 *  - ZERO-BASED series (weekly km, weekly minutes) — "empty week" is a real
 *    zero and must read as one. volumeBars / sportWeekBars already do this
 *    (v / max); they stay the source of truth for those series.
 *  - LEVEL series (a lift's heaviest set, a run's pace) — the interesting part
 *    is the movement inside a narrow range: 85→92.5 kg drawn zero-based is
 *    eight indistinguishable full bars. historyStripBars() maps the series'
 *    own min→max onto a floor..1 band instead, so the shape of the change is
 *    what the bars show. `reversed` flips pace-like series (lower = better)
 *    so a taller bar is always the better period, matching the sparkline rule
 *    the exercises rail drew before ("faster is up").
 */

/** How many periods the strip shows — one bar per period, newest last. */
export const HISTORY_STRIP_BARS = 8;

/** The floor a level-series bar can shrink to (a 0-height bar would read as
 *  "nothing happened", which is a zero-based series' meaning, not this one's). */
export const HISTORY_STRIP_FLOOR = 0.18;

/**
 * Normalize a LEVEL series (weights, paces, volumes-per-session) to 0..1 bar
 * heights for the strip: the last HISTORY_STRIP_BARS values, min→max mapped
 * onto FLOOR..1 (newest last). A flat series renders mid-band — steady, not
 * absent. `reversed` inverts (for pace: faster = taller). Returns [] for
 * fewer than two values — one bar is not a history.
 */
export function historyStripBars(values: number[], opts: { reversed?: boolean } = {}): number[] {
  const tail = values.slice(-HISTORY_STRIP_BARS).filter((v) => Number.isFinite(v));
  if (tail.length < 2) return [];
  const lo = Math.min(...tail);
  const hi = Math.max(...tail);
  if (hi === lo) return tail.map(() => 0.6);
  return tail.map((v) => {
    const f = (v - lo) / (hi - lo);
    const g = opts.reversed ? 1 - f : f;
    return HISTORY_STRIP_FLOOR + g * (1 - HISTORY_STRIP_FLOOR);
  });
}

/**
 * Normalize a ZERO-BASED series (weekly volumes, weekly minutes) the way
 * volumeBars/sportWeekBars do — v / max, so an empty period reads as the zero
 * it is — but windowed to the strip's bar count. Returns [] with fewer than
 * two values or no signal at all.
 */
export function zeroBasedBars(values: number[]): number[] {
  const tail = values.slice(-HISTORY_STRIP_BARS).filter((v) => Number.isFinite(v));
  const max = Math.max(...tail, 0);
  if (tail.length < 2 || max <= 0) return [];
  return tail.map((v) => v / max);
}

/**
 * The exercises rail's dispatch: which normalization a widget card's spark
 * gets. Weight is a level series; pace is a level series read reversed
 * (faster = taller, the rule the old sparkline drew); volume and time sparks
 * are weekly zero-based buckets. Lives here so both clients bucket the same
 * card the same way.
 */
export function exerciseStripBars(card: { metric: "pace" | "weight" | "volume" | "time"; spark: number[] }): number[] {
  if (card.metric === "weight") return historyStripBars(card.spark);
  if (card.metric === "pace") return historyStripBars(card.spark, { reversed: true });
  return zeroBasedBars(card.spark);
}
