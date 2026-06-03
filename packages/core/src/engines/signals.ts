/**
 * Signal ontology — the universal time-series record behind the Athlete Twin.
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
 * force plates / markerless motion) will populate without touching the engines.
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
  // neuromuscular (force plate / jump mat / bar sensor)
  | "jumpHeight"
  | "asymmetry"
  | "barVelocity"
  // composition / physiology
  | "bodyMass"
  | "bloodMarker";

/** Whether a higher reading is good ("high") or bad ("low") for the athlete. */
export type SignalDirection = "high" | "low";

/** One reading, from one device, at one moment. The atom of the Twin. */
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
};

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
 * one kind, newest-first or oldest-first — order doesn't matter. Mirrors the
 * "today vs. your own baseline" logic the readiness engine already trusts.
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

function metric(
  signals: Signal[],
  kind: SignalKind,
): BiometricMetric | undefined {
  const now = latest(signals, kind);
  if (!now) return undefined;
  const base = rollingBaseline(signals, kind);
  return {
    today: now.value,
    // fall back to today's reading when there's no history yet (neutral)
    baseline: base.n > 1 ? base.mean : now.value,
    unit: signalUnit(kind),
    better: signalDirection(kind),
  };
}

/**
 * Adapter: build the engines' existing `Biometrics` shape from raw recovery
 * signals. This is the bridge — the Twin stores everything as `Signal`, and the
 * readiness/prescription engines keep consuming `Biometrics` unchanged.
 * Returns undefined when none of HRV / resting HR / sleep are present.
 */
export function toBiometrics(signals: Signal[]): Biometrics | undefined {
  const hrv = metric(signals, "hrv");
  const restingHr = metric(signals, "restingHr");
  const sleep = metric(signals, "sleep");
  if (!hrv && !restingHr && !sleep) return undefined;
  const neutral = (better: SignalDirection): BiometricMetric => ({
    today: 1,
    baseline: 1,
    unit: "",
    better,
  });
  const bio: Biometrics = {
    hrv: hrv ?? neutral("high"),
    restingHr: restingHr ?? neutral("low"),
    sleep: sleep ?? neutral("high"),
  };
  const sleepScore = metric(signals, "sleepScore");
  if (sleepScore) bio.sleepScore = sleepScore;
  return bio;
}
