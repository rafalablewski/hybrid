import type { SessionBlock, StrengthBlock, CardioBlock, ConditioningBlock } from "./session";
import { workingSets, cardioPace, sessionVolume } from "./session";
import { formatSportDistance } from "../olympic-sports";

// The Builder's "signal board" math — the live session summary both clients
// show while a routine is being assembled (estimated duration, tonnage, and the
// strength ⇄ conditioning ⇄ endurance balance). Every number here is DERIVED
// from the editable blocks, never stored, so the board can't disagree with the
// prescription it summarises. Shared by web + mobile so the two Builders can't
// drift on what the same session "adds up to".

/** Fallback planned rest between working sets when a block doesn't set one, seconds. */
export const DEFAULT_REST_SEC = 150;

/** Rough seconds a set takes to execute (unloaded time excluded from rest). */
const SET_WORK_SEC = 45;
/** Warm-up / cool-down sets are quick: short work + short rest, ~1 min each. */
const AUX_SET_SEC = 60;

/**
 * Estimated minutes a block will take.
 * - strength: working sets × (planned rest + ~45 s work) + ~1 min per
 *   warm-up/cool-down set. A heuristic — good enough to compare blocks and sum
 *   into a session estimate, not a stopwatch.
 * - cardio: the entered minutes (0 until entered — the estimate reflects the
 *   prescription, it doesn't invent one).
 * - conditioning: the entered minutes, else rounds × (work + rest).
 */
export function estimateBlockMinutes(b: SessionBlock): number {
  if (b.kind === "strength") {
    const working = workingSets(b).length;
    const aux = b.sets.length - working;
    const rest = b.restSec ?? DEFAULT_REST_SEC;
    return (working * (rest + SET_WORK_SEC) + aux * AUX_SET_SEC) / 60;
  }
  if (b.kind === "cardio") return b.minutes ?? 0;
  if (b.minutes) return b.minutes;
  if (b.rounds && (b.work || b.rest)) return (b.rounds * ((b.work ?? 0) + (b.rest ?? 0))) / 60;
  return 0;
}

/** The balance bucket a block's time counts toward. */
export type SignalBucket = "strength" | "conditioning" | "endurance";

export const signalBucket = (b: SessionBlock): SignalBucket =>
  b.kind === "strength" ? "strength" : b.kind === "conditioning" ? "conditioning" : "endurance";

export interface SessionSignal {
  /** Estimated total duration, minutes (rounded). */
  minutes: number;
  /** Working-set tonnage across strength blocks, kg. */
  tonnageKg: number;
  /** Block count. */
  moves: number;
  /**
   * Share of estimated time per bucket, integer percents summing to 100
   * (all zero when nothing has a duration yet).
   */
  split: Record<SignalBucket, number>;
}

/** The live session summary: duration, tonnage, and the modality balance. */
export function sessionSignal(blocks: SessionBlock[]): SessionSignal {
  const mins: Record<SignalBucket, number> = { strength: 0, conditioning: 0, endurance: 0 };
  for (const b of blocks) mins[signalBucket(b)] += estimateBlockMinutes(b);
  const total = mins.strength + mins.conditioning + mins.endurance;
  const split: Record<SignalBucket, number> = { strength: 0, conditioning: 0, endurance: 0 };
  if (total > 0) {
    split.strength = Math.round((mins.strength / total) * 100);
    split.conditioning = Math.round((mins.conditioning / total) * 100);
    split.endurance = 100 - split.strength - split.conditioning;
  }
  return {
    minutes: Math.round(total),
    tonnageKg: sessionVolume(blocks),
    moves: blocks.length,
    split,
  };
}

const num = (s: string | undefined): number => {
  const n = parseFloat(s ?? "");
  return Number.isFinite(n) ? n : NaN;
};

/**
 * The metric row a STRENGTH block shows on its signal card — scheme (working
 * sets × modal reps), top working load, and working tonnage. All derived.
 */
export function strengthBlockStats(b: StrengthBlock): {
  scheme: string;
  topKg: number;
  volumeKg: number;
} {
  const working = workingSets(b).filter((s) => !s.drop);
  let top = 0;
  let volume = 0;
  for (const s of workingSets(b)) {
    const load = num(s.load);
    const reps = num(s.reps);
    if (!Number.isNaN(load)) top = Math.max(top, load);
    if (!Number.isNaN(load) && !Number.isNaN(reps)) volume += load * reps;
  }
  const reps = working[0]?.reps ?? "";
  return {
    scheme: working.length ? `${working.length}×${reps || "—"}` : "—",
    topKg: top,
    volumeKg: Math.round(volume),
  };
}

/**
 * One-line collapsed summary for a signal card, per modality. Deliberately
 * unit-annotated and separator-free beyond the spaced en dash (per the copy
 * rule: no middots).
 */
export function blockSignalSummary(b: SessionBlock): string {
  if (b.kind === "strength") {
    const s = strengthBlockStats(b);
    return s.topKg > 0 ? `${s.scheme} – ${s.topKg} kg` : s.scheme;
  }
  if (b.kind === "cardio") {
    const parts: string[] = [];
    // Distance renders in the sport's natural unit ("1500 m" for a swim,
    // "8 km" for a run) — driven by the block name; storage stays km.
    if (b.distance) parts.push(formatSportDistance(b.distance, b.name));
    if (b.minutes) parts.push(`${b.minutes} min`);
    const pace = cardioPace(b);
    if (pace && parts.length < 2) parts.push(pace);
    return parts.join(" – ") || "—";
  }
  const c = b as ConditioningBlock;
  const parts: string[] = [];
  if (c.format) parts.push(c.format);
  if (c.rounds && (c.work || c.rest)) parts.push(`${c.rounds}×${c.work ?? 0}/${c.rest ?? 0}s`);
  else if (c.minutes) parts.push(`${c.minutes} min`);
  return parts.join(" – ") || "—";
}
