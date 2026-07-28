import type { BodyweightPoint } from "../bodyweight";
import type { RecoveryReport } from "./landmark-adapt";
import type { AthleteVolumeProfile } from "./landmark-profile";

/**
 * MEASURED INPUTS → PROFILE DEFAULTS.
 *
 * The volume profile asks the athlete questions the app can often answer for
 * itself. Anything HYBRID already measures should be filled in from the
 * measurement, leaving the athlete to correct it rather than compose it.
 *
 * Two rules keep this honest:
 *
 *   1. A derived value is a DEFAULT, never an override. Whatever the athlete
 *      typed wins — see `withMeasured`.
 *   2. Nothing is inferred across a change of meaning. Sleep is read from the
 *      check-in's sleep field, which is the same 1–5 scale asking the same
 *      question. STRESS is deliberately NOT derived: the check-in asks about
 *      mood and energy, and quietly relabelling either as "life stress" would
 *      put a number the athlete never gave into a model that scales their
 *      training ceiling. Mood and energy earn their keep in the OBSERVED layer
 *      instead (landmark-adapt.ts), where a flat week is evidence about that
 *      week rather than a standing claim about the athlete.
 *
 * Energy availability comes from the bodyweight trend rather than from calorie
 * logging, because the scale is the outcome and the food log is the estimate:
 * an athlete losing weight IS in a deficit whatever the diary says.
 */

const DAY = 86_400_000;

/** What could be filled in from data the app already holds. */
export interface MeasuredProfile {
  /** Mean check-in sleep (1–5) over the window. */
  sleep?: number;
  /** Energy availability, read off the bodyweight trend. */
  nutrition?: AthleteVolumeProfile["nutrition"];
  /** Which fields came from measurement — the UI marks these as not-typed. */
  measured: (keyof AthleteVolumeProfile)[];
}

const mean = (xs: number[]): number | null =>
  xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;

/**
 * Mean self-reported sleep over the last `days` of check-ins (1–5), or null
 * when nobody has checked in. Same scale in and out — no reinterpretation.
 */
export function sleepFromCheckins(reports: RecoveryReport[], opts: { now?: number; days?: number } = {}): number | null {
  const now = opts.now ?? Date.now();
  const since = now - (opts.days ?? 28) * DAY;
  const values: number[] = [];
  for (const r of reports) {
    const t = new Date(r.date).getTime();
    if (!Number.isFinite(t) || t > now || t < since) continue;
    const v = r.sleep;
    if (typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= 5) values.push(v);
  }
  return mean(values);
}

/** Fitted body-mass change, as a percentage of body mass per week. Named
 *  apart from composition.ts's `WeightTrend` (an EWMA of the scale for the body
 *  screen) — different fit, different job, and both are exported from core. */
export interface BodyMassTrend {
  /** e.g. −0.42 for "losing 0.42% of bodyweight a week". */
  percentPerWeek: number;
  /** Least-squares slope in kg/day (negative = losing). */
  kgPerDay: number;
  /** Measurements the fit used. */
  points: number;
  /** Days between the first and last measurement used. */
  spanDays: number;
}

/**
 * Least-squares body-mass trend over the window. Least squares rather than
 * first-vs-last because a single dehydrated morning should not decide whether
 * an athlete is "cutting". Null until there is enough to fit: at least three
 * measurements spanning at least two weeks.
 */
export function bodyweightTrend(
  points: BodyweightPoint[],
  opts: { now?: number; days?: number; minPoints?: number; minSpanDays?: number } = {},
): BodyMassTrend | null {
  const now = opts.now ?? Date.now();
  const since = now - (opts.days ?? 42) * DAY;
  const rows = points
    .map((p) => ({ t: Date.parse(p.date), v: p.weightKg }))
    .filter((p) => Number.isFinite(p.t) && p.t <= now && p.t >= since && Number.isFinite(p.v) && p.v > 0)
    .sort((a, b) => a.t - b.t);

  const minPoints = opts.minPoints ?? 3;
  const minSpanDays = opts.minSpanDays ?? 14;
  if (rows.length < minPoints) return null;
  const spanDays = (rows[rows.length - 1]!.t - rows[0]!.t) / DAY;
  if (spanDays < minSpanDays) return null;

  const xs = rows.map((r) => (r.t - rows[0]!.t) / DAY);
  const ys = rows.map((r) => r.v);
  const n = rows.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - mx) * (ys[i]! - my);
    den += (xs[i]! - mx) ** 2;
  }
  if (den === 0) return null;
  const kgPerDay = num / den;
  const percentPerWeek = my > 0 ? Math.round(((kgPerDay * 7) / my) * 10000) / 100 : 0;
  return { percentPerWeek, kgPerDay, points: n, spanDays: Math.round(spanDays) };
}

/** Below this rate of change (percent of body mass per week, either way) the
 *  athlete is holding weight — well inside normal water-weight noise. */
export const ENERGY_BALANCE_THRESHOLD_PCT = 0.25;

/**
 * Energy availability from the scale: losing weight is a deficit, gaining is a
 * surplus, holding is maintenance. Null when the trend can't be fitted — an
 * unknown is left unknown rather than defaulted to "maintenance", because
 * assuming maintenance would silently hand back a recovery multiplier of 1.
 */
export function energyBalanceFromBodyweight(
  points: BodyweightPoint[],
  opts: { now?: number; days?: number } = {},
): AthleteVolumeProfile["nutrition"] | null {
  const trend = bodyweightTrend(points, opts);
  if (!trend) return null;
  if (trend.percentPerWeek <= -ENERGY_BALANCE_THRESHOLD_PCT) return "deficit";
  if (trend.percentPerWeek >= ENERGY_BALANCE_THRESHOLD_PCT) return "surplus";
  return "maintenance";
}

/** Everything the app can answer on the athlete's behalf, in one call. */
export function measuredProfile(
  opts: { checkins?: RecoveryReport[]; bodyweight?: BodyweightPoint[]; now?: number } = {},
): MeasuredProfile {
  const out: MeasuredProfile = { measured: [] };
  const sleep = sleepFromCheckins(opts.checkins ?? [], { now: opts.now });
  if (sleep !== null) {
    out.sleep = sleep;
    out.measured.push("sleep");
  }
  const nutrition = energyBalanceFromBodyweight(opts.bodyweight ?? [], { now: opts.now });
  if (nutrition) {
    out.nutrition = nutrition;
    out.measured.push("nutrition");
  }
  return out;
}

/**
 * Layer measured defaults UNDER what the athlete typed. `stored` is the profile
 * as saved (only the fields they actually set), so anything absent there falls
 * through to the measurement, and anything present survives it.
 */
export function withMeasured(stored: AthleteVolumeProfile, measured: MeasuredProfile): AthleteVolumeProfile {
  return {
    ...stored,
    sleep: stored.sleep ?? measured.sleep,
    nutrition: stored.nutrition ?? measured.nutrition,
  };
}

/** Which profile fields ended up coming from measurement rather than the
 *  athlete — the UI marks these so a derived number never reads as typed. */
export function measuredFields(stored: AthleteVolumeProfile, measured: MeasuredProfile): Set<keyof AthleteVolumeProfile> {
  const out = new Set<keyof AthleteVolumeProfile>();
  for (const k of measured.measured) if (stored[k] === undefined) out.add(k);
  return out;
}
