/**
 * Video intelligence — markerless motion analysis.
 *
 * A pose model (on-device / client CV — out of scope here) turns a clip into a
 * sequence of keypoint frames. THIS module is the analysis layer: joint angles,
 * left/right asymmetry, rep counting, depth, and a technique score — fused back
 * into the Signal ontology so technique lines up with fatigue. Pure + testable;
 * phone-grade biomechanics without a $100k lab.
 */

import type { Signal } from "./signals";
import { signalUnit } from "./signals";

export interface Keypoint {
  x: number;
  y: number;
  conf?: number;
}

export type PoseName =
  | "leftShoulder" | "rightShoulder"
  | "leftElbow" | "rightElbow"
  | "leftWrist" | "rightWrist"
  | "leftHip" | "rightHip"
  | "leftKnee" | "rightKnee"
  | "leftAnkle" | "rightAnkle";

export type Pose = Partial<Record<PoseName, Keypoint>>;

export interface PoseFrame {
  /** seconds from clip start */
  t: number;
  pose: Pose;
}

/** Interior angle at `b` formed by points a–b–c, in degrees (0..180). */
export function jointAngle(a: Keypoint, b: Keypoint, c: Keypoint): number {
  const ux = a.x - b.x, uy = a.y - b.y;
  const vx = c.x - b.x, vy = c.y - b.y;
  const dot = ux * vx + uy * vy;
  const mag = Math.hypot(ux, uy) * Math.hypot(vx, vy);
  if (mag === 0) return 0;
  const cos = Math.max(-1, Math.min(1, dot / mag));
  return (Math.acos(cos) * 180) / Math.PI;
}

type Side = "left" | "right";
const cap = (s: Side) => (s === "left" ? "left" : "right");

/** Knee angle (hip–knee–ankle) for a side, or null if keypoints are missing. */
export function kneeAngle(pose: Pose, side: Side): number | null {
  if (!pose) return null;
  const hip = pose[`${cap(side)}Hip` as PoseName];
  const knee = pose[`${cap(side)}Knee` as PoseName];
  const ankle = pose[`${cap(side)}Ankle` as PoseName];
  if (!hip || !knee || !ankle) return null;
  return jointAngle(hip, knee, ankle);
}

/** Symmetric percentage difference between two sides (0 = identical). */
export function asymmetryPct(left: number, right: number): number {
  const max = Math.max(Math.abs(left), Math.abs(right));
  if (max === 0) return 0;
  return (Math.abs(left - right) / max) * 100;
}

/**
 * Count reps from a 1D signal (e.g. mean knee angle over frames) using
 * trough detection with hysteresis: one rep per dip below `low` that then
 * recovers above `high`.
 */
export function countReps(signal: number[], low = 110, high = 150): number {
  let reps = 0;
  let armed = false; // true once we've gone below `low` and are awaiting recovery
  for (const v of signal) {
    if (v <= low) armed = true;
    else if (v >= high && armed) {
      reps++;
      armed = false;
    }
  }
  return reps;
}

export interface MotionAnalysis {
  movement: string;
  reps: number;
  /** deepest mean knee flexion reached (lower = deeper); null if unknown */
  minKneeAngle: number | null;
  /** mean left/right knee asymmetry across the clip (%) */
  kneeAsymmetryPct: number | null;
  /** 0..100 movement-quality score */
  techniqueScore: number;
  flags: string[];
}

/**
 * Analyze a squat-pattern clip: rep count, depth, L/R asymmetry, and a
 * technique score that rewards hitting depth and penalizes asymmetry.
 */
export function analyzeSquat(frames: PoseFrame[]): MotionAnalysis {
  const means: number[] = [];
  const asyms: number[] = [];
  let minMean: number | null = null;

  for (const f of frames) {
    const l = kneeAngle(f.pose, "left");
    const r = kneeAngle(f.pose, "right");
    const sides = [l, r].filter((v): v is number => v != null);
    if (sides.length === 0) continue;
    const mean = sides.reduce((a, b) => a + b, 0) / sides.length;
    means.push(mean);
    if (minMean === null || mean < minMean) minMean = mean;
    if (l != null && r != null) asyms.push(asymmetryPct(l, r));
  }

  const reps = countReps(means);
  const kneeAsymmetryPct = asyms.length ? asyms.reduce((a, b) => a + b, 0) / asyms.length : null;

  const flags: string[] = [];
  let score = 100;
  // depth: parallel ≈ 90°; shallower than ~100° loses points
  if (minMean != null && minMean > 100) {
    flags.push("insufficient depth");
    score -= Math.min(35, (minMean - 100) * 1.5);
  }
  // asymmetry: >10% is a flag
  if (kneeAsymmetryPct != null && kneeAsymmetryPct > 10) {
    flags.push(`knee asymmetry ${kneeAsymmetryPct.toFixed(0)}%`);
    score -= Math.min(35, (kneeAsymmetryPct - 10) * 2);
  }
  if (reps === 0) {
    flags.push("no full reps detected");
    score -= 20;
  }

  return {
    movement: "squat",
    reps,
    minKneeAngle: minMean,
    kneeAsymmetryPct,
    techniqueScore: Math.max(0, Math.round(score)),
    flags,
  };
}

/** Turn a motion analysis into Signals (asymmetry feeds injury risk later). */
export function motionSignals(athleteId: string, analysis: MotionAnalysis, ts = new Date().toISOString()): Signal[] {
  const out: Signal[] = [];
  if (analysis.kneeAsymmetryPct != null)
    out.push({ athleteId, kind: "asymmetry", value: Math.round(analysis.kneeAsymmetryPct), unit: signalUnit("asymmetry"), source: "video", ts });
  return out;
}
