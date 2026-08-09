/**
 * DURATION — the app's ONE way to print a span of training time.
 *
 * A logged sport, a cardio lane, the week's training-time column: every one of
 * them stores canonical MINUTES and every one of them used to print those
 * minutes as DECIMAL HOURS — `Math.round(minutes / 6) / 10`, copied into five
 * files. Sixty-seven minutes of tennis came out as "1.1 h", which is not a
 * duration anybody reads: an hour is sixty minutes, not a hundred, so the
 * tenths digit means nothing until you multiply it back. Worse, it is lossy in
 * a way the athlete can see — 67 and 68 minutes both print 1.1, and the sport
 * page rounded the same 67 minutes to a flat "1".
 *
 * A duration reads in HOURS AND MINUTES: `1h 17min`. Under an hour it is
 * minutes alone (`45min`); on the hour the minutes are dropped (`2h`) rather
 * than printed as a hollow `2h 0min`.
 *
 * THE UNITS ARE PARAMETERS, not literals, so a localised caller can pass its
 * own — but they DEFAULT to "h"/"min", which is what the app's three languages
 * (en/pl/de) all use, so a caller with no `t()` in reach still prints correct
 * copy rather than an English fallback.
 *
 * Pure, so web and mobile print the identical string.
 */

export interface DurationParts {
  hours: number;
  /** 0…59 — the remainder, never 60. */
  minutes: number;
}

export interface DurationUnits {
  h: string;
  min: string;
}

/** The units every client already ships in en/pl/de (`w.home.act.uH`/`uMin`). */
export const DURATION_UNITS: DurationUnits = { h: "h", min: "min" };

/** The athlete's own units, from either client's `t`. The two keys live HERE
 *  rather than in each client so a screen can't quietly pick a different pair. */
export const durationUnits = (t: (key: string) => string): DurationUnits => ({
  h: t("w.home.act.uH"),
  min: t("w.home.act.uMin"),
});

/**
 * Canonical minutes → whole hours + whole minutes.
 *
 * The total is rounded ONCE, before the split — rounding the remainder instead
 * (`Math.round(minutes % 60)`) turns 59.7 minutes into "0h 60min".
 */
export function durationParts(totalMinutes: number): DurationParts {
  const m = Math.max(0, Math.round(totalMinutes || 0));
  return { hours: Math.floor(m / 60), minutes: m % 60 };
}

/** Canonical minutes → `1h 17min` / `45min` / `2h`. */
export function formatDuration(totalMinutes: number, u: DurationUnits = DURATION_UNITS): string {
  const { hours, minutes } = durationParts(totalMinutes);
  if (hours === 0) return `${minutes}${u.min}`;
  if (minutes === 0) return `${hours}${u.h}`;
  return `${hours}${u.h} ${minutes}${u.min}`;
}
