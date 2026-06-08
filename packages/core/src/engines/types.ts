/** Shared engine types. Pure data shapes — no UI, no I/O. */

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
  /** Steady cardio target (aerobic days): distance + duration + goal pace. */
  distance?: number;
  minutes?: number;
  rpe?: number;
  /** Goal pace for a steady run, e.g. "5:30 /km". */
  paceTarget?: string;
}

export type PrescribedBlock =
  | PrescribedStrengthBlock
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
  /** When autoregulated off bar speed: the mean concentric velocity to hit on the work sets (m/s). */
  velocityTarget?: number;
}
