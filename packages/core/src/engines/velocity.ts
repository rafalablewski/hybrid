/**
 * Velocity-based training (VBT) — the load–velocity engine.
 *
 * A bar-mounted sensor or a markerless camera turns a set into a sequence of
 * rep velocities (and, with two axes, a bar path). THIS module is the analysis
 * layer on top of those numbers: per-set summaries, velocity zones, the
 * load–velocity profile (linear regression), a profile-based estimated 1RM, and
 * an autoregulated load recommendation. Pure data + math — no UI, no I/O, no
 * dependency on how the velocities were captured (sensor, camera, or manual).
 *
 * The science is the standard linear load–velocity model: mean concentric
 * velocity falls roughly linearly as load rises, so a few (load, velocity)
 * points fit a line whose load-axis crossing at the exercise's minimal velocity
 * threshold (MVT) estimates the 1RM without ever lifting a true max.
 */

import type { LoggedSession, SessionBlock, StrengthBlock } from "./session";

/** One rep's kinematics. ROM/peak are optional (sensor-dependent). */
export interface RepSample {
  /** mean concentric velocity, m/s */
  meanVelocity: number;
  /** peak velocity, m/s */
  peakVelocity?: number;
  /** range of motion, cm */
  rom?: number;
}

/** A working set: a load and the reps performed under it. */
export interface VelocitySet {
  /** kg */
  load: number;
  reps: RepSample[];
}

/** Summary metrics for a single set. */
export interface SetSummary {
  load: number;
  reps: number;
  /** fastest rep (usually the first) — used to classify set quality */
  bestVelocity: number;
  /** mean velocity across all reps */
  meanVelocity: number;
  /** last rep's velocity */
  finalVelocity: number;
  /** peak velocity if any rep reported one */
  peakVelocity: number | null;
  /** % drop from best to final rep (fatigue within the set) */
  velocityLossPct: number;
  /** mean range of motion across reps (cm), or null */
  meanRom: number | null;
  zone: VelocityZone;
}

// ---------------------------------------------------------------------------
// Velocity zones — the training-quality bands by mean concentric velocity.
// Bands follow the widely-used load–velocity literature (Mann / Bryanton /
// González-Badillo): faster = lighter/more explosive, slower = heavier/maximal.
// ---------------------------------------------------------------------------

export type VelocityZoneId =
  | "absolute-strength"
  | "strength-speed"
  | "speed-strength"
  | "accelerative"
  | "starting-speed";

export interface VelocityZone {
  id: VelocityZoneId;
  label: string;
  /** inclusive lower bound, m/s */
  min: number;
  /** exclusive upper bound, m/s (Infinity for the top band) */
  max: number;
  /** roughly the %1RM range this band corresponds to */
  approxPct: string;
  focus: string;
}

export const VELOCITY_ZONES: VelocityZone[] = [
  { id: "absolute-strength", label: "Absolute strength", min: 0, max: 0.5, approxPct: "≥90%", focus: "Maximal force, top-end 1RM strength" },
  { id: "strength-speed", label: "Strength-speed", min: 0.5, max: 0.75, approxPct: "80–90%", focus: "Heavy strength with intent" },
  { id: "speed-strength", label: "Speed-strength", min: 0.75, max: 1.0, approxPct: "70–80%", focus: "Power — force at speed" },
  { id: "accelerative", label: "Accelerative strength", min: 1.0, max: 1.3, approxPct: "55–70%", focus: "Explosive, rate of force development" },
  { id: "starting-speed", label: "Starting speed", min: 1.3, max: Infinity, approxPct: "<55%", focus: "Maximal velocity, dynamic effort" },
];

/** Classify a mean concentric velocity into its training-quality zone. */
export function velocityZone(meanVelocity: number): VelocityZone {
  const v = Math.max(0, meanVelocity);
  return (
    VELOCITY_ZONES.find((z) => v >= z.min && v < z.max) ??
    VELOCITY_ZONES[VELOCITY_ZONES.length - 1]!
  );
}

// ---------------------------------------------------------------------------
// Minimal velocity threshold (MVT) — the velocity at a true 1RM, per movement.
// Heavier-bias lifts grind to a lower velocity; ballistic lifts keep speed.
// ---------------------------------------------------------------------------

const MVT: Record<string, number> = {
  "back squat": 0.3,
  "front squat": 0.3,
  squat: 0.3,
  "bench press": 0.15,
  bench: 0.15,
  deadlift: 0.15,
  "romanian deadlift": 0.18,
  "overhead press": 0.18,
  "barbell row": 0.3,
  "power clean": 0.7,
};

const DEFAULT_MVT = 0.3;

/** Minimal velocity threshold for a movement (case-insensitive), with a default. */
export function mvtFor(movement: string): number {
  return MVT[movement.trim().toLowerCase()] ?? DEFAULT_MVT;
}

// ---------------------------------------------------------------------------
// Set summary
// ---------------------------------------------------------------------------

/** Summarize a set: best/mean/final velocity, velocity loss, ROM, and zone. */
export function summarizeSet(set: VelocitySet): SetSummary {
  const vels = set.reps.map((r) => r.meanVelocity).filter((v) => Number.isFinite(v));
  const roms = set.reps.map((r) => r.rom).filter((r): r is number => r != null && Number.isFinite(r));
  const peaks = set.reps.map((r) => r.peakVelocity).filter((p): p is number => p != null && Number.isFinite(p));

  const best = vels.length ? Math.max(...vels) : 0;
  const final = vels.length ? vels[vels.length - 1]! : 0;
  const mean = vels.length ? vels.reduce((a, b) => a + b, 0) / vels.length : 0;
  const velocityLossPct = best > 0 ? ((best - final) / best) * 100 : 0;

  return {
    load: set.load,
    reps: set.reps.length,
    bestVelocity: best,
    meanVelocity: mean,
    finalVelocity: final,
    peakVelocity: peaks.length ? Math.max(...peaks) : null,
    velocityLossPct,
    meanRom: roms.length ? roms.reduce((a, b) => a + b, 0) / roms.length : null,
    zone: velocityZone(best),
  };
}

/**
 * Has a set hit its velocity-loss cap? VBT autoregulation stops the set once the
 * fastest rep has decayed by `capPct` (e.g. 20%), holding bar speed (and thus
 * the training quality) constant regardless of how the athlete feels that day.
 */
export function velocityLossReached(set: VelocitySet, capPct: number): boolean {
  return summarizeSet(set).velocityLossPct >= capPct;
}

// ---------------------------------------------------------------------------
// Load–velocity profile
// ---------------------------------------------------------------------------

export interface LVPoint {
  /** kg */
  load: number;
  /** mean concentric velocity at that load, m/s */
  velocity: number;
}

export interface LoadVelocityProfile {
  /** m/s per kg (negative — velocity drops as load rises) */
  slope: number;
  /** velocity-axis intercept = velocity at zero load (v0) */
  intercept: number;
  v0: number;
  /** load-axis intercept = load at zero velocity (theoretical max isometric load) */
  l0: number;
  /** coefficient of determination, 0..1 (fit quality) */
  r2: number;
  /** number of distinct points used */
  n: number;
  /** minimal velocity threshold this profile resolves the 1RM at */
  mvt: number;
  /** load where the line crosses the MVT — the estimated 1RM (kg); 0 if unresolvable */
  estimated1rm: number;
  points: LVPoint[];
}

/**
 * Reduce raw (load, velocity) pairs to one point per load — the fastest
 * velocity seen at each load (the cleanest, least-fatigued attempt).
 */
export function bestPointPerLoad(points: LVPoint[]): LVPoint[] {
  const byLoad = new Map<number, number>();
  for (const p of points) {
    if (!Number.isFinite(p.load) || !Number.isFinite(p.velocity)) continue;
    const cur = byLoad.get(p.load);
    if (cur == null || p.velocity > cur) byLoad.set(p.load, p.velocity);
  }
  return [...byLoad.entries()]
    .map(([load, velocity]) => ({ load, velocity }))
    .sort((a, b) => a.load - b.load);
}

/**
 * Fit a linear load–velocity profile by least squares and resolve the 1RM at
 * the given minimal velocity threshold. Needs ≥2 distinct loads; returns a
 * profile with `n < 2` and `estimated1rm = 0` when there isn't enough data.
 */
export function fitLoadVelocityProfile(raw: LVPoint[], mvt = DEFAULT_MVT): LoadVelocityProfile {
  const points = bestPointPerLoad(raw);
  const n = points.length;
  const empty: LoadVelocityProfile = {
    slope: 0, intercept: 0, v0: 0, l0: 0, r2: 0, n, mvt, estimated1rm: 0, points,
  };
  if (n < 2) return empty;

  const xs = points.map((p) => p.load);
  const ys = points.map((p) => p.velocity);
  const xBar = xs.reduce((a, b) => a + b, 0) / n;
  const yBar = ys.reduce((a, b) => a + b, 0) / n;

  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - xBar;
    const dy = ys[i]! - yBar;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  if (sxx === 0) return empty; // all loads identical — undefined slope

  const slope = sxy / sxx;
  const intercept = yBar - slope * xBar;

  // r² from residual vs total sum of squares
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const pred = intercept + slope * xs[i]!;
    ssRes += (ys[i]! - pred) ** 2;
  }
  const r2 = syy === 0 ? (ssRes === 0 ? 1 : 0) : Math.max(0, 1 - ssRes / syy);

  // 1RM = load where velocity == MVT (only meaningful for a descending line)
  const estimated1rm = slope < 0 ? Math.max(0, (mvt - intercept) / slope) : 0;
  const l0 = slope < 0 ? -intercept / slope : 0;

  return { slope, intercept, v0: intercept, l0, r2, n, mvt, estimated1rm, points };
}

/** Predicted mean velocity at a given load from a fitted profile. */
export function velocityAtLoad(profile: LoadVelocityProfile, load: number): number {
  return profile.intercept + profile.slope * load;
}

/** Load (kg) predicted to produce a target mean velocity. 0 if unresolvable. */
export function loadForVelocity(profile: LoadVelocityProfile, targetVelocity: number): number {
  if (profile.slope >= 0) return 0;
  return Math.max(0, (targetVelocity - profile.intercept) / profile.slope);
}

/** Estimated %1RM that a given velocity corresponds to (0..100+). */
export function percent1rmForVelocity(profile: LoadVelocityProfile, velocity: number): number {
  if (profile.estimated1rm <= 0) return 0;
  return (loadForVelocity(profile, velocity) / profile.estimated1rm) * 100;
}

/** Predicted mean velocity at a target %1RM from a fitted profile. 0 if unresolvable. */
export function velocityForPercent(profile: LoadVelocityProfile, pct: number): number {
  if (profile.estimated1rm <= 0) return 0;
  return velocityAtLoad(profile, (pct / 100) * profile.estimated1rm);
}

/** Round to the nearest plate increment (default 2.5 kg). */
export function roundToIncrement(kg: number, step = 2.5): number {
  if (step <= 0) return Math.round(kg);
  return Math.round(kg / step) * step;
}

export interface LoadSuggestion {
  /** plate-rounded recommended load, kg */
  load: number;
  /** the velocity that load targets, m/s */
  targetVelocity: number;
  /** estimated %1RM of the recommendation */
  percent1rm: number;
  zone: VelocityZone;
}

/**
 * The "AI load" — recommend today's working load from the athlete's profile.
 * Drive it by a target velocity OR a target %1RM (velocity wins if both given).
 * This is autoregulation: the same %1RM maps to a different kg as the profile
 * shifts day to day, so the prescription tracks real readiness, not the calendar.
 */
export function suggestLoad(
  profile: LoadVelocityProfile,
  opts: { targetVelocity?: number; targetPct?: number; step?: number },
): LoadSuggestion | null {
  if (profile.estimated1rm <= 0 || profile.slope >= 0) return null;
  const step = opts.step ?? 2.5;

  let targetVelocity: number;
  if (opts.targetVelocity != null) {
    targetVelocity = opts.targetVelocity;
  } else if (opts.targetPct != null) {
    const load = (opts.targetPct / 100) * profile.estimated1rm;
    targetVelocity = velocityAtLoad(profile, load);
  } else {
    return null;
  }

  const raw = loadForVelocity(profile, targetVelocity);
  const load = roundToIncrement(raw, step);
  return {
    load,
    targetVelocity,
    percent1rm: percent1rmForVelocity(profile, velocityAtLoad(profile, load)),
    zone: velocityZone(targetVelocity),
  };
}

// ---------------------------------------------------------------------------
// Bridge to logged sessions — pull (load, velocity) points for a lift so the
// profile is built from the athlete's REAL training, not a one-off ramp test.
// ---------------------------------------------------------------------------

const isStrength = (b: SessionBlock): b is StrengthBlock => b.kind === "strength";
const num = (s: string | undefined): number => {
  const n = parseFloat(s ?? "");
  return Number.isFinite(n) ? n : NaN;
};

/** Every (load, velocity) pair logged for a lift across the given sessions. */
export function lvPointsFromSessions(sessions: LoggedSession[], lift: string): LVPoint[] {
  const out: LVPoint[] = [];
  for (const s of sessions)
    for (const b of s.blocks)
      if (isStrength(b) && b.name === lift)
        for (const set of b.sets) {
          const load = num(set.load);
          const velocity = num(set.vel);
          if (!Number.isNaN(load) && !Number.isNaN(velocity) && velocity > 0)
            out.push({ load, velocity });
        }
  return out;
}

/** Distinct lift names that have at least one velocity reading logged. */
export function liftsWithVelocity(sessions: LoggedSession[]): string[] {
  const names = new Set<string>();
  for (const s of sessions)
    for (const b of s.blocks)
      if (isStrength(b) && b.sets.some((set) => Number.isFinite(num(set.vel)) && num(set.vel) > 0))
        names.add(b.name);
  return [...names];
}

/** Convenience: build and fit a lift's profile straight from logged sessions. */
export function velocityProfileFor(
  sessions: LoggedSession[],
  lift: string,
  mvt = mvtFor(lift),
): LoadVelocityProfile {
  return fitLoadVelocityProfile(lvPointsFromSessions(sessions, lift), mvt);
}

/**
 * Build a fitted load–velocity profile for every lift that has velocity data,
 * keyed by lift name. The prescription engine reads this to autoregulate load
 * off bar speed (only lifts with a resolvable 1RM are useful to it).
 */
export function velocityProfiles(sessions: LoggedSession[]): Record<string, LoadVelocityProfile> {
  const out: Record<string, LoadVelocityProfile> = {};
  for (const lift of liftsWithVelocity(sessions)) out[lift] = velocityProfileFor(sessions, lift);
  return out;
}
