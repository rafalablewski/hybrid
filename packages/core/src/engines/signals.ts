/**
 * Signal ontology — the universal time-series record behind the Performance State.
 *
 * Every measurement about an athlete (recovery, load, biomechanics, blood,
 * composition…) lands here as one shape, from any source. This generalizes the
 * single-purpose `Biometric` row into one stream the engines can read. Today it
 * carries HRV / resting HR / sleep; tomorrow GPS load, jump height, and blood
 * markers slot in with zero new types.
 *
 * Pure data + math. No UI, no I/O.
 */

import type { BiometricMetric, Biometrics } from "./types";

/**
 * What a signal measures. Recovery kinds are live today; the rest are the
 * forward slots the ingestion layer (HealthKit / WHOOP / Garmin / Catapult /
 * bar sensors / wearables) will populate without touching the engines.
 */
export type SignalKind =
  // recovery (live)
  | "hrv"
  | "restingHr"
  | "sleep"
  | "sleepScore"
  // external load (GPS / accelerometer)
  | "totalDistance"
  | "highSpeedRunning"
  | "accelLoad"
  // neuromuscular (jump mat / bar sensor)
  | "jumpHeight"
  | "asymmetry"
  | "barVelocity"
  // composition / physiology
  | "bodyMass"
  | "bloodMarker"
  // heat exposure — the ONE input no device will ever report, so both halves
  // are typed: how long, and how hot. Two rows at an identical ts are one
  // sitting (engines/heat.ts, heatSittings).
  | "sauna"
  | "saunaTemp"
  // nutrition — the four macros the engines read…
  | "energyIntake"
  | "protein"
  | "carbs"
  | "fat"
  | "water"
  // …plus the LABEL panel (food-facts.ts). Logged whenever the food states
  // them, so a day can answer "how much of that fat was saturated?" — these
  // are recorded and rolled up, they do not (yet) drive a target.
  | "satFat"
  | "sugar"
  | "fiber"
  | "salt";

/** Whether a higher reading is good ("high") or bad ("low") for the athlete. */
export type SignalDirection = "high" | "low";

/** One reading, from one device, at one moment. The atom of the Performance State. */
export interface Signal {
  athleteId: string;
  kind: SignalKind;
  value: number;
  unit: string;
  /** "apple" | "whoop" | "garmin" | "catapult" | "manual" | … */
  source: string;
  /** ISO-8601 timestamp. */
  ts: string;
}

/** Rolling statistics for a single signal kind — the athlete's own normal. */
export interface SignalBaseline {
  mean: number;
  /** sample standard deviation; 0 when there isn't enough history. */
  sd: number;
  n: number;
}

const META: Record<SignalKind, { unit: string; better: SignalDirection }> = {
  hrv: { unit: "ms", better: "high" },
  restingHr: { unit: "bpm", better: "low" },
  sleep: { unit: "h", better: "high" },
  sleepScore: { unit: "score", better: "high" },
  totalDistance: { unit: "m", better: "high" },
  highSpeedRunning: { unit: "m", better: "high" },
  accelLoad: { unit: "au", better: "high" },
  jumpHeight: { unit: "cm", better: "high" },
  asymmetry: { unit: "%", better: "low" },
  barVelocity: { unit: "m/s", better: "high" },
  bodyMass: { unit: "kg", better: "high" },
  bloodMarker: { unit: "", better: "high" },
  sauna: { unit: "min", better: "high" },
  saunaTemp: { unit: "C", better: "high" },
  energyIntake: { unit: "kcal", better: "high" },
  protein: { unit: "g", better: "high" },
  carbs: { unit: "g", better: "high" },
  fat: { unit: "g", better: "high" },
  water: { unit: "ml", better: "high" },
  // Label panel: "better: low" is the honest direction for these — they are
  // things to keep under a ceiling, not totals to chase.
  satFat: { unit: "g", better: "low" },
  sugar: { unit: "g", better: "low" },
  fiber: { unit: "g", better: "high" },
  salt: { unit: "g", better: "low" },
};

/** Every known signal kind — the single source of truth (API allow-lists derive from this). */
export const SIGNAL_KINDS = Object.keys(META) as SignalKind[];

/** Whether a higher value is good or bad for a given signal kind. */
export function signalDirection(kind: SignalKind): SignalDirection {
  return META[kind].better;
}

/** Canonical unit for a signal kind. */
export function signalUnit(kind: SignalKind): string {
  return META[kind].unit;
}

/**
 * Rolling baseline (mean + sample SD) over the most recent `window` readings of
 * one kind, newest-first or oldest-first — order doesn't matter.
 *
 * NOTE what this INCLUDES: the newest reading. That makes it the right function
 * for "what has this metric been doing lately", and the WRONG one for "is today
 * unusual for me" — see `priorBaseline` below, which is what the recovery
 * adjustment uses and why.
 */
export function rollingBaseline(
  signals: Signal[],
  kind: SignalKind,
  window = 14,
): SignalBaseline {
  const vals = signals
    .filter((s) => s.kind === kind)
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    .slice(0, window)
    .map((s) => s.value);
  const n = vals.length;
  if (n === 0) return { mean: 0, sd: 0, n: 0 };
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  const variance =
    n > 1 ? vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
  return { mean, sd: Math.sqrt(variance), n };
}

/**
 * Signed z-score of a reading against a baseline, oriented so positive always
 * means "better than normal" for that kind (resting HR up is negative, HRV up
 * is positive). Returns 0 when there's no spread to compare against.
 */
export function orientedZ(
  value: number,
  baseline: SignalBaseline,
  kind: SignalKind,
): number {
  if (baseline.n === 0 || baseline.sd === 0) return 0;
  const z = (value - baseline.mean) / baseline.sd;
  return signalDirection(kind) === "high" ? z : -z;
}

/** Most recent reading of a kind, or undefined if none. */
export function latest(signals: Signal[], kind: SignalKind): Signal | undefined {
  return signals
    .filter((s) => s.kind === kind)
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())[0];
}

/** How many PRIOR readings define "normal". */
export const BIOMETRIC_BASELINE_WINDOW = 14;

/**
 * THE BASELINE TODAY IS MEASURED AGAINST — the newest reading EXCLUDED.
 *
 * `rollingBaseline` includes it, and the recovery adjustment used to compare
 * today's reading against a mean that contained today's reading. That is
 * self-referential: the more unusual today is, the harder it drags the average
 * toward itself, so it always reads as less unusual than it was. The signal
 * partly erased itself, and worst exactly when there was least history —
 * against a single prior reading the deviation came out HALVED (a real 20% HRV
 * rise scored +4 instead of +8), converging to the honest figure only after
 * about a fortnight.
 *
 * It also meant the two entry points disagreed: the legacy `buildBiometrics`
 * always excluded today, so identical readings produced different adjustments
 * depending on which table they happened to live in. This is now the one
 * definition both use.
 *
 * With NO prior readings the caller falls back to today's own value, which
 * makes the deviation exactly 0 — the first-ever reading cannot move a score it
 * has nothing to be compared against.
 */
export function priorBaseline(
  signals: Signal[],
  kind: SignalKind,
  window = BIOMETRIC_BASELINE_WINDOW,
): SignalBaseline {
  const vals = signals
    .filter((s) => s.kind === kind)
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    // Drop the newest — that one IS "today", and it cannot be its own normal.
    .slice(1, 1 + window)
    .map((s) => s.value);
  const n = vals.length;
  if (n === 0) return { mean: 0, sd: 0, n: 0 };
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  const variance = n > 1 ? vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
  return { mean, sd: Math.sqrt(variance), n };
}

/**
 * HOW OLD A READING MAY BE AND STILL COUNT AS TODAY'S.
 *
 * There was no window at all. `latest()` returns the most recent row of a kind
 * — ever, with no date filter — and `toBiometrics` handed it to the readiness
 * and HPI engines as *today's* value. So one sync months ago pinned a permanent
 * ±N onto the score, printed in the present tense ("Includes −3 from your
 * wearable") by an athlete who had not worn anything since.
 *
 * A recovery reading is a statement about a specific morning. Past this window
 * it stops being evidence about today and the term drops out entirely, which is
 * the honest reading: no measurement, no adjustment. Seven days is deliberately
 * generous — it forgives a flat battery or a weekend off, and still guarantees
 * the number on the card was measured this week.
 */
export const BIOMETRIC_FRESH_DAYS = 7;

const DAY_MS = 86400000;

/** How old a reading is, in days, or null when its timestamp is unusable. */
export function signalAgeDays(ts: string, now: number): number | null {
  const t = Date.parse(ts);
  if (!Number.isFinite(t)) return null;
  return (now - t) / DAY_MS;
}

function metric(
  signals: Signal[],
  kind: SignalKind,
  now: number,
): BiometricMetric | undefined {
  const today = latest(signals, kind);
  if (!today) return undefined;
  // STALE IS NOT TODAY. An unparseable timestamp is treated as stale too — the
  // one thing we must never do is present an unknown-age reading as current.
  const age = signalAgeDays(today.ts, now);
  if (age === null || age > BIOMETRIC_FRESH_DAYS) return undefined;
  const base = priorBaseline(signals, kind);
  return {
    today: today.value,
    // ONE prior reading is enough to compare against; with none, today is its
    // own baseline, so the deviation is 0 and the term contributes nothing.
    baseline: base.n > 0 ? base.mean : today.value,
    unit: signalUnit(kind),
    better: signalDirection(kind),
    source: today.source,
    ts: today.ts,
    measured: true,
  };
}

/**
 * Adapter: build the engines' existing `Biometrics` shape from raw recovery
 * signals. This is the bridge — the Performance State stores everything as `Signal`, and the
 * readiness/prescription engines keep consuming `Biometrics` unchanged.
 * Returns undefined when none of HRV / resting HR / sleep are present.
 */
export function toBiometrics(signals: Signal[], now: number = Date.now()): Biometrics | undefined {
  const hrv = metric(signals, "hrv", now);
  const restingHr = metric(signals, "restingHr", now);
  const sleep = metric(signals, "sleep", now);
  // Nothing recent enough to be a statement about today — so there is no
  // adjustment to make, and the card's wearable line disappears rather than
  // asserting a reading from some other week.
  if (!hrv && !restingHr && !sleep) return undefined;
  // A metric with no usable reading is NEUTRALISED, never invented: today ===
  // baseline gives a deviation of exactly 0, so it cannot move the score. This
  // is the behaviour the legacy `buildBiometrics` path lacked.
  const neutral = (better: SignalDirection): BiometricMetric => ({
    today: 1,
    baseline: 1,
    unit: "",
    better,
    measured: false,
  });
  const bio: Biometrics = {
    hrv: hrv ?? neutral("high"),
    restingHr: restingHr ?? neutral("low"),
    sleep: sleep ?? neutral("high"),
  };
  const sleepScore = metric(signals, "sleepScore", now);
  if (sleepScore) bio.sleepScore = sleepScore;
  return bio;
}
