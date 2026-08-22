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

/**
 * A CLOCK — `01:42:18`, and it is NOT `formatDuration` under another name.
 *
 * The two formats answer different questions and the difference is not
 * cosmetic. `formatDuration` prints a SPAN as prose (`1h 17min`) — how long a
 * session took, read once, in a sentence or a column. This prints a CLOCK: a
 * running timer, an elapsed readout, a split. It is colon-separated and
 * second-accurate because a clock is watched rather than read, and because the
 * device's own recording is second-accurate (`device-truth.ts` `cardioSeconds`)
 * — printing a measured 7:52 as "8min" contradicts the device panel beside it.
 *
 * Hence SECONDS in, where `formatDuration` takes canonical minutes. A clock
 * that rounded to the minute would tick once a minute, which is not a clock.
 *
 * ── WHY `live` EXISTS, and it is the whole reason this is one function ──────
 *
 * A LIVE clock is zero-padded and never changes width. A FINISHED one is not.
 * That is the same argument as `TABULAR_NUMS` (scale.ts), one level up: a
 * running timer that drops its leading zero shifts every digit beside it at the
 * hour boundary, so the figure twitches for a reason that has nothing to do
 * with the value. A summary is being READ rather than watched, so `1:42:18` is
 * correct there — `01:42:18` in a finished session reads like a stopwatch
 * somebody forgot to stop.
 *
 * Two spellings of one intent is exactly how the app grew five scrims and
 * twelve figure trackings, so both live here with the distinction named.
 *
 * Consolidated from `interval.ts`, which owned an mm:ss-only cut of this that
 * could not print an hour: `>59 min` overflowed the minutes field, so a
 * 1h 42m session read "102:18".
 */
export function formatClock(totalSeconds: number, live = false): string {
  // ROUND, not floor — this is the behaviour the interval timer shipped with,
  // and a countdown that floors shows 0:00 for a whole second before it ends.
  const t = Math.max(0, Math.round(totalSeconds || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (h > 0) return `${live ? pad(h) : h}:${pad(m)}:${pad(s)}`;
  return `${live ? pad(m) : m}:${pad(s)}`;
}
