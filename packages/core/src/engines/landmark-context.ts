import type { BodyweightPoint } from "../bodyweight";
import { isPlausibleHeightCm } from "../units";
import { heatWeeklyFrequency, type HeatSignalRow } from "./heat";
import { energyBalance, energyStateFromIntake, type EnergyBalance, type FuelSignalRow } from "./fuel";
import type { RecoveryReport } from "./landmark-adapt";
import type { AthleteVolumeProfile } from "./landmark-profile";
import { trainingDaysPerWeek } from "./habits";
import type { LoggedSession } from "./session";

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
 * ENERGY AVAILABILITY HAS TWO PATHS, and which one wins was the question this
 * module got wrong for a year. The old rule was "the scale, always" — the scale
 * is the outcome and the food log is the estimate, so an athlete losing weight
 * IS in a deficit whatever the diary says. That reasoning is still correct and
 * it was still the wrong rule, because the scale answers LATE and sometimes
 * never: `bodyweightTrend` needs three weigh-ins spanning a fortnight before it
 * will speak at all, water masks the first fortnight of any cut, and an athlete
 * who never steps on a scale gets no answer ever — while their food log has
 * held the answer since day four.
 *
 * So the log LEADS and the scale BACKS IT UP: `energyStateFromIntake` where the
 * diary can support a reading (see engines/fuel.ts for the gates it has to
 * clear, which are deliberately strict), `energyBalanceFromBodyweight` where it
 * cannot. The scale did not lose its argument; it lost its monopoly, and it
 * still catches the athlete whose logging is fiction — because when the log is
 * too thin to clear the gates, that IS the fallback firing.
 *
 * PROTEIN has only the one path. There is no outcome measure for it — the scale
 * cannot tell you how much of a kilogram was muscle — so it is read from the
 * log or it is not read at all.
 */

const DAY = 86_400_000;

/** What could be filled in from data the app already holds. */
export interface MeasuredProfile {
  /** Mean check-in sleep (1–5) over the window. */
  sleep?: number;
  /**
   * TRAINING DAYS PER WEEK, from the log — the median of the last four weeks'
   * distinct training days (habits.ts `trainingDaysPerWeek`).
   *
   * Setup used to ask for this and it was the wrong question in two ways. It
   * asked for an INTENTION where the model wants a HABIT, and the two diverge
   * exactly where it matters: the athlete who plans five and trains three is
   * the one whose recovery multiplier is wrong. And it was another standing
   * claim typed on day zero that then outranked every week of evidence after
   * it. Absent until there is at least one week with training in it — a
   * fabricated 3 is what the helper's own `fallback` would give, and this is
   * the one place that must not take it.
   */
  daysPerWeek?: number;
  /** Energy availability — from the food log where it can be read, from the
   *  bodyweight trend where it cannot. `nutritionBasis` says which. */
  nutrition?: AthleteVolumeProfile["nutrition"];
  /**
   * Which path produced `nutrition`. Not decoration: the two are different
   * claims with different lags, and a surface that says "measured" without
   * saying measured HOW cannot be argued with. Absent when `nutrition` is.
   */
  nutritionBasis?: "intake" | "bodyweight";
  /** Mean daily protein per kg of body mass, from the food log. */
  proteinGPerKg?: number;
  /** The whole energy read behind the two fields above, so a surface can quote
   *  the figures (days logged, average intake, maintenance) without recomputing
   *  it — and can explain a SILENCE, which is the case that needs explaining. */
  energy?: EnergyBalance;
  /** Standing height, from the body log (Profile → Body & progress). Not
   *  inferred from anything — it is the athlete's own measurement, read from
   *  where they already entered it so they never type it twice. */
  heightCm?: number;
  /** Body fat percentage, from the same log. Not inferred either, and never
   *  asked on the questionnaire — it makes the body-mass factor read LEAN mass
   *  where it is known, and changes nothing where it is not. */
  bodyFatPct?: number;
  /** The newest weigh-in. The one measured field that OUTRANKS a typed value —
   *  see the note in `withMeasured`. */
  bodyweightKg?: number;
  /**
   * Sauna sittings per week over four weeks, from the logged heat signals.
   *
   * ALWAYS measured, never typed — unlike sleep or height there is no form for
   * it and there is not going to be one, because the log already holds the
   * answer and the athlete would only be copying it back to us.
   */
  heat?: number;
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
  opts: {
    checkins?: RecoveryReport[];
    /** The athlete's logged sessions — read for training FREQUENCY only. */
    sessions?: LoggedSession[];
    bodyweight?: BodyweightPoint[];
    heightCm?: number | null;
    /** The newest body-fat reading from the same body log (`latestBodyFatPct`).
     *  Like height it is the athlete's own entry, read from where they put it. */
    bodyFatPct?: number | null;
    /** The athlete's `sauna` / `saunaTemp` rows. Heat is the purest measured
     *  field on the profile: there is no form for it anywhere and there never
     *  will be — the athlete has already told us by logging. */
    heatSignals?: HeatSignalRow[];
    /**
     * The athlete's `energyIntake` / `protein` / `bodyMass` rows — the food
     * log, on the engine's terms. Omitted and energy availability falls back to
     * the bodyweight trend exactly as it did before this existed, which is also
     * what happens when the log is too thin to clear fuel.ts's gates.
     */
    nutritionSignals?: FuelSignalRow[];
    now?: number;
  } = {},
): MeasuredProfile {
  const out: MeasuredProfile = { measured: [] };
  // NO FALLBACK. trainingDaysPerWeek returns 3 for an empty log by design (its
  // callers want a usable number); here an invented frequency would become a
  // recovery multiplier nobody earned, so the log has to actually contain a
  // training week before this says anything.
  const sessions = opts.sessions ?? [];
  if (sessions.length > 0) {
    const days = trainingDaysPerWeek(sessions, { now: opts.now });
    if (Number.isFinite(days) && days > 0) {
      out.daysPerWeek = days;
      out.measured.push("daysPerWeek");
    }
  }
  const sleep = sleepFromCheckins(opts.checkins ?? [], { now: opts.now });
  if (sleep !== null) {
    out.sleep = sleep;
    out.measured.push("sleep");
  }

  // ── ENERGY AVAILABILITY: the log leads, the scale backs it up ─────────────
  // Both are computed; the log wins where it can support a reading. The scale's
  // answer is not a worse version of the same measurement — it is the one that
  // survives an athlete who logs nothing, and it stays exactly as it was.
  const energy = energyBalance(opts.nutritionSignals ?? [], { now: opts.now });
  out.energy = energy;
  const fromIntake = energyStateFromIntake(energy);
  const fromScale = energyBalanceFromBodyweight(opts.bodyweight ?? [], { now: opts.now });
  const nutrition = fromIntake ?? fromScale;
  if (nutrition) {
    out.nutrition = nutrition;
    out.nutritionBasis = fromIntake ? "intake" : "bodyweight";
    out.measured.push("nutrition");
  }
  // Protein has no second path — read from the log or not read at all. Gated on
  // its OWN sufficiency flag rather than on `energy.sufficient`: protein needs
  // no maintenance estimate, so an athlete whose maintenance is still unknown
  // has a perfectly readable protein average.
  if (energy.proteinSufficient && energy.proteinGPerKg != null && energy.proteinGPerKg > 0) {
    out.proteinGPerKg = energy.proteinGPerKg;
    out.measured.push("proteinGPerKg");
  }
  // Height is KNOWN rather than derived when the body log holds one — the same
  // "don't ask for what you already have" rule, applied to a measurement the
  // athlete typed themselves. Bounds mirror the profile field so an out-of-range
  // row can never be presented back as a measured value.
  if (isPlausibleHeightCm(opts.heightCm)) {
    out.heightCm = Math.round(opts.heightCm);
    out.measured.push("heightCm");
  }
  // THE CURRENT BODY MASS — the newest weigh-in in the log. Emitted as a
  // measured field so `withMeasured` can prefer it over a typed one; see the
  // inversion documented there.
  const points = opts.bodyweight ?? [];
  if (points.length) {
    let newest: { ts: number; kg: number } | null = null;
    for (const pt of points) {
      const ts = Date.parse(pt.date);
      if (!Number.isFinite(ts) || !(pt.weightKg > 0)) continue;
      if (!newest || ts > newest.ts) newest = { ts, kg: pt.weightKg };
    }
    if (newest) {
      out.bodyweightKg = Math.round(newest.kg * 10) / 10;
      out.measured.push("bodyweightKg");
    }
  }

  // Composition, on the same terms as height: the athlete's own entry in their
  // own body log, read rather than re-asked. Same window the frame maths
  // trusts, so a row it would refuse is never shown back as a measured value.
  const bf = opts.bodyFatPct;
  if (typeof bf === "number" && Number.isFinite(bf) && bf >= 3 && bf <= 60) {
    out.bodyFatPct = Math.round(bf * 10) / 10;
    out.measured.push("bodyFatPct");
  }
  // Only when there is something to measure. An athlete with no sauna rows has
  // not told us they never go — they have told us nothing — and a fabricated 0
  // would present an absence as a finding.
  if (opts.heatSignals?.length) {
    out.heat = heatWeeklyFrequency(opts.heatSignals, opts.now);
    out.measured.push("heat");
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
    daysPerWeek: stored.daysPerWeek ?? measured.daysPerWeek,
    heat: measured.heat,
    nutrition: stored.nutrition ?? measured.nutrition,
    // Always measured, never stored — like `heat`, and for the same reason:
    // there is no form for it, `sanitizeVolumeProfile` deliberately does not
    // list it, so it can never arrive here as something the athlete typed.
    proteinGPerKg: measured.proteinGPerKg,
    heightCm: stored.heightCm ?? measured.heightCm,
    // Measured only, like protein: it is a field of the body log, and
    // `sanitizeVolumeProfile` deliberately does not list it, so a stale copy
    // can never outlive the reading it came from.
    bodyFatPct: measured.bodyFatPct,
    // ── BODY MASS INVERTS THE RULE ABOVE, AND ONLY BODY MASS ────────────────
    //
    // Every other field here is a STANDING CLAIM: a training age, a sex, a
    // typical night's sleep. Those the athlete owns, so what they typed wins
    // and the measurement is only a default underneath it.
    //
    // Body mass is not a claim, it is a READING WITH A DATE, and the athlete
    // takes a new one every time they step on a scale. Left under the normal
    // rule, a figure typed once at setup outranked forty subsequent weigh-ins
    // for the rest of the account's life — the volume model, the recovery
    // multiplier and every strength standard still quoting the number from the
    // day they installed the app, eight kilos ago.
    //
    // So the MEASUREMENT wins whenever there is one, and the typed value is the
    // fallback for an athlete who has never weighed in. Setup writes a first
    // weigh-in precisely so that fallback is rarely the live path.
    bodyweightKg: measured.bodyweightKg ?? stored.bodyweightKg,
  };
}

/** Which profile fields ended up coming from measurement rather than the
 *  athlete — the UI marks these so a derived number never reads as typed. */
export function measuredFields(stored: AthleteVolumeProfile, measured: MeasuredProfile): Set<keyof AthleteVolumeProfile> {
  const out = new Set<keyof AthleteVolumeProfile>();
  for (const k of measured.measured) if (stored[k] === undefined) out.add(k);
  return out;
}
