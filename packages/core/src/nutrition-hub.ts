/**
 * NUTRITION HUB — the bento block that replaced the flat text menu at the
 * bottom of the Nutrition home, and the geometry of its Diary chart.
 *
 * The five destinations (Diary, Insights, Body & weight, Your meals, Your
 * products) used to render as a wrapping row of bare mono-uppercase buttons:
 * no surface, no glyph, no arrow, no data. They are now a bento — Diary as a
 * full-width tile leading four compact stat tiles — because the five are NOT
 * equals and the layout should say so.
 *
 * ── The Diary chart is TWO LINES, not a sparkline ──────────────────────────
 * A single bar per day only says how much was eaten. Two lines say whether it
 * was ENOUGH: the day's target against what was actually logged, with the gap
 * between them shaded. That comparison is only interesting because the target
 * MOVES — adaptiveTargets is training-aware (it adds the day's training fuel
 * on top of the goal target), so the dashed target line steps up on hard days
 * and the shape of the week's training is legible in the same picture as the
 * eating.
 *
 * Two deliberate departures from spark.ts, whose doctrine is a TRUE ZERO
 * BASELINE:
 *  1. This chart is NOT zero-anchored. Both series live in a narrow band around
 *     2 000–3 000 kcal; against a zero baseline they would collapse onto each
 *     other and the comparison — the entire point — would be invisible. The
 *     domain is fitted to the two series with padding. The clients therefore
 *     ALWAYS print the raw pair ("1 840 of 2 600 kcal") beside the chart, so
 *     the exact figures never have to be read off the pixels.
 *  2. A day with nothing logged BREAKS the logged line instead of drawing
 *     through zero — "I didn't log" and "I ate nothing" are different claims,
 *     and a line through zero makes the first look like the second. The target
 *     line is always continuous (the day still asked for its calories), so the
 *     break reads unambiguously as missing data.
 *
 * Pure + unit-tested, and shared, so the line on the phone and the line in the
 * browser are the same line (parity rule).
 */

import type { Signal } from "./engines/signals";
import type { LoggedSession } from "./engines/session";
import { adaptiveTargets, dailyNutrition, type NutritionGoal } from "./engines/nutrition";
import { trainingEnergyOnDay } from "./engines/load";
import { addLocalDays, localDayKey, localMidnightMs } from "./day-key";

/** How many days the Diary tile plots, today included. */
export const HUB_CHART_DAYS = 7;

export interface HubDay {
  /** local calendar day key (YYYY-MM-DD) */
  date: string;
  /** kcal the day asked for — the goal target plus that day's training fuel */
  target: number;
  /** kcal actually logged, or null when the day has NOTHING logged */
  logged: number | null;
  /** the day's estimated training expenditure (kcal); 0 on a rest day */
  trainingKcal: number;
  /** true for the last day in the series — partial by definition */
  today: boolean;
}

export interface HubSeries {
  /** oldest → newest, exactly `days` long, unlogged days included as gaps */
  days: HubDay[];
  /** the newest day (today) */
  today: HubDay;
  /** today's logged − target, in kcal (negative = under). 0 when nothing logged. */
  deltaToday: number;
  /** how many of the plotted days carry any intake at all */
  loggedDays: number;
}

/**
 * The Diary tile's series: the last `days` calendar days, each with the target
 * it asked for and what was logged against it.
 *
 * The target is built ONCE from the athlete's current goal + maintenance and
 * then has each day's own training fuel added — the same composition
 * `adaptiveTargets` performs for today, so today's point on this chart and the
 * hero ring above it cannot disagree. Re-estimating maintenance as of each past
 * day would make the line wobble for reasons that have nothing to do with what
 * the athlete did that day.
 */
export function nutritionHubSeries(
  signals: Signal[],
  sessions: LoggedSession[],
  opts: { goal?: NutritionGoal; bodyMassKg?: number; now?: number; days?: number } = {},
): HubSeries {
  const now = opts.now ?? Date.now();
  const count = Math.max(1, Math.round(opts.days ?? HUB_CHART_DAYS));
  const bodyMassKg = opts.bodyMassKg;

  // The goal target WITHOUT training fuel — each day adds its own below.
  const base = adaptiveTargets(signals, { goal: opts.goal, bodyMassKg, trainingKcal: 0, now });

  const byDate = new Map(dailyNutrition(signals).map((d) => [d.date, d]));
  const midnight = localMidnightMs(now);

  const days: HubDay[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const ms = addLocalDays(midnight, -i);
    const date = localDayKey(ms);
    const day = byDate.get(date);
    // Mid-day for the training lookup: trainingEnergyOnDay keys off the
    // calendar day of `now`, and a local midnight is the safest hour to be
    // away from when a session lands either side of it.
    const trainingKcal = Math.max(0, Math.round(trainingEnergyOnDay(sessions, bodyMassKg ?? 75, ms + 12 * 3_600_000)));
    days.push({
      date,
      target: base.kcal + trainingKcal,
      // A day with no intake at all is a GAP, not a zero (see the file note).
      logged: day && day.kcal > 0 ? Math.round(day.kcal) : null,
      trainingKcal,
      today: i === 0,
    });
  }

  const today = days[days.length - 1]!;
  return {
    days,
    today,
    deltaToday: today.logged == null ? 0 : today.logged - today.target,
    loggedDays: days.filter((d) => d.logged != null).length,
  };
}

export interface HubChartBox {
  width: number;
  height: number;
  /** breathing room on every side so the endpoint dot isn't clipped. Default 5. */
  pad?: number;
}

export interface HubChartPoint {
  x: number;
  targetY: number;
  /** null when the day has nothing logged */
  loggedY: number | null;
}

export interface HubChart {
  /** the target line — always one continuous path */
  targetPath: string;
  /** the logged line, BROKEN at unlogged days: one path per unbroken run */
  loggedPaths: string[];
  /** the gap between the two lines, one closed path per unbroken run */
  bandPaths: string[];
  /** logged days with no logged neighbour — a run of one draws no line, so the
   *  clients mark these with a dot instead of dropping them silently */
  isolated: { x: number; y: number }[];
  /** today's logged point (the endpoint dot); null when today has no intake */
  last: { x: number; y: number } | null;
  points: HubChartPoint[];
  /** the fitted value domain, for callers that want to label the extremes */
  domain: { lo: number; hi: number };
}

const r = (n: number) => Math.round(n * 10) / 10;

/**
 * Map a `HubSeries` into a `width` × `height` box.
 *
 * The domain spans BOTH series (so neither line can leave the box) padded by a
 * tenth of its own span, which keeps the target line off the frame edge on a
 * week of perfect adherence. Deliberately not zero-anchored — see the file note.
 */
export function nutritionHubChart(days: HubDay[], box: HubChartBox): HubChart {
  const { width, height } = box;
  const pad = box.pad ?? 5;
  const n = days.length;

  const values = days.flatMap((d) => (d.logged == null ? [d.target] : [d.target, d.logged]));
  let lo = values.length ? Math.min(...values) : 0;
  let hi = values.length ? Math.max(...values) : 0;
  const span = hi - lo;
  // A flat series (one day, or a week that hit the target exactly) still needs
  // a non-zero domain or every point divides by zero and lands on NaN.
  const breathe = span > 0 ? span * 0.1 : Math.max(1, hi * 0.05);
  lo -= breathe;
  hi += breathe;

  const usableW = Math.max(0, width - pad * 2);
  const usableH = Math.max(0, height - pad * 2);
  const xAt = (i: number) => (n < 2 ? width / 2 : pad + (i * usableW) / (n - 1));
  const yAt = (v: number) => pad + usableH - ((v - lo) / (hi - lo)) * usableH;

  const points: HubChartPoint[] = days.map((d, i) => ({
    x: r(xAt(i)),
    targetY: r(yAt(d.target)),
    loggedY: d.logged == null ? null : r(yAt(d.logged)),
  }));

  const targetPath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.targetY}`).join(" ");

  // Split the logged series into unbroken runs, then draw a line + a gap band
  // for every run of two or more and a dot for every run of one.
  const runs: HubChartPoint[][] = [];
  let run: HubChartPoint[] = [];
  for (const p of points) {
    if (p.loggedY == null) {
      if (run.length) runs.push(run);
      run = [];
    } else run.push(p);
  }
  if (run.length) runs.push(run);

  const loggedPaths: string[] = [];
  const bandPaths: string[] = [];
  const isolated: { x: number; y: number }[] = [];
  for (const rr of runs) {
    if (rr.length < 2) {
      const p = rr[0]!;
      isolated.push({ x: p.x, y: p.loggedY! });
      continue;
    }
    loggedPaths.push(rr.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.loggedY!}`).join(" "));
    // Out along the target, home along the logged line — the enclosed area IS
    // the gap the athlete is being shown.
    const out = rr.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.targetY}`).join(" ");
    const back = [...rr].reverse().map((p) => `L${p.x},${p.loggedY!}`).join(" ");
    bandPaths.push(`${out} ${back} Z`);
  }

  const lastPoint = points[points.length - 1];
  return {
    targetPath,
    loggedPaths,
    bandPaths,
    isolated,
    last: lastPoint && lastPoint.loggedY != null ? { x: lastPoint.x, y: lastPoint.loggedY } : null,
    points,
    domain: { lo, hi },
  };
}
