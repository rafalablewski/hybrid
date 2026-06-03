/**
 * Future Self Simulator — see who you become.
 *
 * The payoff of training is distant and invisible; present bias wins. This
 * engine projects the athlete's trajectory FORWARD from their current behavior:
 * a strength (e1RM) or bodyweight path, a goal ETA, and an honest probability of
 * hitting the goal by a target date. Consistency bends the curve — a steady
 * athlete is projected to progress faster than an erratic one, so the simulator
 * also shows the cost of slipping. Pure data + math.
 */

import type { LoggedSession } from "./session";
import { e1rmSeries } from "./session";
import type { Signal } from "./signals";
import { sessionsInWeek } from "./habits";

const WEEK = 7 * 86_400_000;

// --- standard normal CDF (erf approximation) ---------------------------------
function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return x >= 0 ? y : -y;
}
function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

export interface ProjectionPoint {
  weeksAhead: number;
  value: number;
}

export interface FutureProjection {
  metric: string;
  /** "up" for strength (more is better), "down" for fat-loss bodyweight goals */
  direction: "up" | "down";
  current: number;
  /** fitted change per week, after adherence scaling (engine units, e.g. kg/wk) */
  ratePerWeek: number;
  /** 0.5..1.2 — how much recent consistency speeds or slows the projection */
  adherenceFactor: number;
  horizonWeeks: number;
  series: ProjectionPoint[];
  goal?: number;
  /** weeks to reach the goal at the projected rate, or null if not trending toward it */
  etaWeeks: number | null;
  /** probability of reaching the goal by `byWeeks`, or null when unresolvable */
  goalProbability: number | null;
  /** true when there isn't enough history to project (series is flat) */
  insufficient: boolean;
}

interface TVP {
  /** time, ms */
  t: number;
  /** value */
  v: number;
}

interface Fit {
  slopePerWeek: number;
  intercept: number;
  residualSd: number;
  last: number;
  n: number;
}

/** Least-squares fit of value vs time (in weeks), with residual SD. */
function linfit(points: TVP[]): Fit | null {
  if (points.length < 2) return null;
  const t0 = points[0]!.t;
  const xs = points.map((p) => (p.t - t0) / WEEK);
  const ys = points.map((p) => p.v);
  const n = xs.length;
  const xBar = xs.reduce((a, b) => a + b, 0) / n;
  const yBar = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - xBar;
    sxx += dx * dx;
    sxy += dx * (ys[i]! - yBar);
  }
  if (sxx === 0) return null;
  const slopePerWeek = sxy / sxx;
  const intercept = yBar - slopePerWeek * xBar;
  let ss = 0;
  for (let i = 0; i < n; i++) ss += (ys[i]! - (intercept + slopePerWeek * xs[i]!)) ** 2;
  const residualSd = Math.sqrt(ss / Math.max(1, n - 2));
  return { slopePerWeek, intercept, residualSd, last: ys[ys.length - 1]!, n };
}

/** Recent training consistency → a 0.5..1.2 multiplier on projected progress. */
export function adherenceFactor(sessions: LoggedSession[], targetPerWeek = 3, now = Date.now()): number {
  const target = Math.max(1, targetPerWeek);
  const recent = (sessionsInWeek(sessions, 0, now) + sessionsInWeek(sessions, 1, now)) / 2;
  return Math.max(0.5, Math.min(1.2, recent / target));
}

interface ProjectOpts {
  horizonWeeks?: number;
  goal?: number;
  byWeeks?: number;
  adherence?: number;
  direction?: "up" | "down";
  now?: number;
}

function project(metric: string, points: TVP[], opts: ProjectOpts): FutureProjection {
  const direction = opts.direction ?? "up";
  const horizonWeeks = opts.horizonWeeks ?? 12;
  const fit = linfit(points);
  const current = points.length ? points[points.length - 1]!.v : 0;
  const adj = opts.adherence ?? 1;

  if (!fit) {
    return {
      metric, direction, current, ratePerWeek: 0, adherenceFactor: adj,
      horizonWeeks, series: [{ weeksAhead: 0, value: current }, { weeksAhead: horizonWeeks, value: current }],
      goal: opts.goal, etaWeeks: null, goalProbability: null, insufficient: true,
    };
  }

  // Consistency scales the magnitude of progress (only in the improving direction).
  const improving = direction === "up" ? fit.slopePerWeek > 0 : fit.slopePerWeek < 0;
  const ratePerWeek = improving ? fit.slopePerWeek * adj : fit.slopePerWeek;

  const series: ProjectionPoint[] = [];
  const step = Math.max(1, Math.round(horizonWeeks / 6));
  for (let w = 0; w <= horizonWeeks; w += step) series.push({ weeksAhead: w, value: round1(current + ratePerWeek * w) });
  if (series[series.length - 1]!.weeksAhead !== horizonWeeks)
    series.push({ weeksAhead: horizonWeeks, value: round1(current + ratePerWeek * horizonWeeks) });

  let etaWeeks: number | null = null;
  let goalProbability: number | null = null;
  if (opts.goal != null) {
    const goal = opts.goal;
    const towardGoal = direction === "up" ? goal > current : goal < current;
    if (ratePerWeek !== 0 && towardGoal && improving) etaWeeks = round1((goal - current) / ratePerWeek);

    const byWeeks = opts.byWeeks ?? horizonWeeks;
    const predicted = current + ratePerWeek * byWeeks;
    // uncertainty grows with the horizon; floor it so a perfect fit isn't 100%.
    const sd = Math.max(fit.residualSd * Math.sqrt(byWeeks), Math.abs(current) * 0.03, 1e-6);
    const z = (predicted - goal) / sd;
    goalProbability = direction === "up" ? clamp01(normalCdf(z)) : clamp01(normalCdf(-z));
  }

  return {
    metric, direction, current, ratePerWeek: round2(ratePerWeek), adherenceFactor: round2(adj),
    horizonWeeks, series, goal: opts.goal, etaWeeks, goalProbability, insufficient: false,
  };
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const round2 = (x: number) => Math.round(x * 100) / 100;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Project a lift's estimated 1RM forward from logged history. */
export function projectLift(
  sessions: LoggedSession[],
  lift: string,
  opts: { horizonWeeks?: number; goal?: number; byWeeks?: number; targetPerWeek?: number; now?: number } = {},
): FutureProjection {
  const pts = e1rmSeries(sessions, lift).map((p) => ({ t: Date.parse(p.date), v: p.e1rm }));
  return project(`${lift} e1RM`, pts, {
    ...opts,
    direction: "up",
    adherence: adherenceFactor(sessions, opts.targetPerWeek ?? 3, opts.now),
  });
}

/** Project bodyweight forward from bodyMass signals (goal can be loss or gain). */
export function projectBodyweight(
  signals: Signal[],
  opts: { horizonWeeks?: number; goal?: number; byWeeks?: number; direction?: "up" | "down"; now?: number } = {},
): FutureProjection {
  const pts = signals
    .filter((s) => s.kind === "bodyMass")
    .map((s) => ({ t: Date.parse(s.ts), v: s.value }))
    .sort((a, b) => a.t - b.t);
  const direction = opts.direction ?? "down";
  return project("Bodyweight", pts, { ...opts, direction, adherence: 1 });
}
