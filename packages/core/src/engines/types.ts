/** Shared engine types. Pure data shapes — no UI, no I/O. */

import type { ReadinessFeeling } from "../readiness-feeling";

export type MuscleGroup =
  | "quads"
  | "glutes"
  | "posterior"
  | "back"
  | "chest"
  | "shoulders"
  | "triceps";

export type EnergySystem = "anaerobic" | "threshold" | "aerobic";

export type ProgressionAction = "progress" | "hold" | "deload";

export interface Movement {
  pattern: string;
  muscles: MuscleGroup[];
  /** working baseline load in kg, or null for conditioning movements */
  baseLoad: number | null;
  /** energy system trained, or null for pure-strength movements */
  system: EnergySystem | null;
}

/** One logged movement within a session. */
export interface LogItem {
  move: string;
  e1rm?: number;
  topRpe?: number;
  hardSets?: number;
  system?: EnergySystem;
  minutes?: number;
  rpe?: number;
  /** distance covered (km) for cardio items — lets the engine read your pace. */
  distance?: number;
}

export interface TrainingSession {
  /** how many days ago this session happened — drives fatigue decay */
  daysAgo: number;
  items: LogItem[];
}

export type TrainingLog = TrainingSession[];

export interface Fatigue {
  /** per-muscle fatigue, normalized 0..100 */
  muscles: Record<MuscleGroup, number>;
  /** raw accumulated load per energy system */
  systems: Record<EnergySystem, number>;
}

export interface BiometricMetric {
  today: number;
  baseline: number;
  unit: string;
  better: "high" | "low";
  /**
   * PROVENANCE, so the athlete can be told where their number came from.
   *
   * The wearable term printed "Includes −3 from your wearable" while carrying
   * no record of what wrote the reading or when — so an athlete with no device
   * could not tell a live measurement from a months-old one, and the copy
   * asserted a wearable even when the source was a manual entry. These three
   * fields are what the explainer sheet reads.
   */
  /** `Signal.source` — "apple" / "whoop" / "oura" / "manual" / … */
  source?: string;
  /** ISO timestamp of the reading being treated as today's. */
  ts?: string;
  /**
   * False when no usable reading existed and the metric was NEUTRALISED —
   * today === baseline, so it contributes exactly nothing. Distinguishing this
   * from a real reading that happens to sit on baseline is what lets the sheet
   * say "not measured" instead of implying a measurement of zero deviation.
   */
  measured?: boolean;
}

export interface Biometrics {
  hrv: BiometricMetric;
  restingHr: BiometricMetric;
  sleep: BiometricMetric;
  sleepScore?: BiometricMetric;
}

export interface Readiness {
  /** 35..98 */
  score: number;
  /** -15..+15 contribution from wearable biometrics */
  bioAdj: number;
  /**
   * 0..HEAT_CREDIT_MAX from logged heat exposure (engines/heat.ts). Never
   * negative, and always 0 when `bioAdj` came from a fresh reading — the
   * wearable measures what the sauna did, so the prior stands down.
   */
  heatAdj: number;
  /**
   * −FUEL_PENALTY_MAX..0 from how far rolling logged intake sits below this
   * athlete's own maintenance estimate (engines/fuel.ts). Never POSITIVE — a
   * deficit costs points, a surplus earns none — and never suppressed by a
   * wearable, because a fortnight's energy availability and last night's HRV
   * are different quantities rather than two accounts of one night.
   */
  fuelAdj: number;
}

export interface ProgressionSignal {
  action: ProgressionAction;
  reason: string;
  confidence: number;
}

export interface Phase {
  key: string;
  label: string;
  weeks: number;
  intensity: number;
  volume: number;
  color: string;
  focus: string;
  pattern: string;
}

export interface Microcycle {
  week: number;
  kind: "load" | "recovery";
  intensity: number;
  volume: number;
}

export interface MacroBlock extends Phase {
  startWeek: number;
  endWeek: number;
  micros: Microcycle[];
}

export interface Macrocycle {
  model: string;
  goalOrSport: string;
  totalWeeks: number;
  eventInWeeks: number | null;
  blocks: MacroBlock[];
}

export interface PrescribedStrengthBlock {
  uid: number;
  kind: "strength";
  name: string;
  sets: { load: string; reps: string; rpe: string }[];
}

export interface PrescribedConditioningBlock {
  uid: number;
  kind: "conditioning";
  name: string;
  format: string;
  /** Interval shape (threshold/anaerobic days). */
  work?: number;
  rest?: number;
  rounds?: number;
  minutes?: number;
  rpe?: number;
}

export interface PrescribedCardioBlock {
  uid: number;
  kind: "cardio";
  name: string;
  /** Steady cardio target: distance + duration + goal pace. */
  distance?: number;
  minutes?: number;
  rpe?: number;
  /** Goal pace for a steady run, e.g. "5:30 /km". */
  paceTarget?: string;
}

export type PrescribedBlock =
  | PrescribedStrengthBlock
  | PrescribedCardioBlock
  | PrescribedConditioningBlock;

export interface PrimaryPick {
  move: string;
  musFatigue: number;
  sig: ProgressionSignal;
  recovery: number;
}

export interface Prescription {
  readiness: number;
  fatigue: Fatigue;
  primary: PrimaryPick;
  blocks: PrescribedBlock[];
  why: string;
  confidence: number;
  pickSys: EnergySystem;
  bioAdj: number;
  /** The 1RM the working load was derived from (kg). */
  oneRm: number;
  /** Whether `oneRm` came from the velocity profile (autoregulated) or rep-based e1RM. */
  oneRmSource: "velocity" | "e1rm";
  /**
   * True when the working load rests on a generic starting default (no velocity
   * profile and no logged e1RM for this lift yet) rather than the athlete's own
   * data — so the UI can flag it as an estimate to calibrate.
   */
  loadEstimated: boolean;
  /** When autoregulated off bar speed: the mean concentric velocity to hit on the work sets (m/s). */
  velocityTarget?: number;
  /**
   * How today's one-tap check-in FEELING moved the session, when it moved
   * anything — present only when a subjective readiness was supplied AND it
   * changed the load (or shed a set). Lets the UI show a glanceable "eased to
   * 94% because you checked in flat" strip instead of burying it in `why`.
   * Absent when no feeling was logged, or the feeling was neutral ("good").
   */
  readinessAdjust?: {
    feeling: ReadinessFeeling;
    /** Working load as a % of the progression dose (100 = unchanged). Omitted
     *  for bodyweight tiers, which carry no external load to scale. */
    loadPct?: number;
    /** Sets the check-in shed (wrecked → −1), else 0. */
    setAdj: number;
  };
}
