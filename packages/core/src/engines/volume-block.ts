import type { MuscleGroup } from "./types";
import type { LoggedSession } from "./session";
import type { Macrocycle } from "./types";
import { VOLUME_LANDMARKS, weeklySetsByMuscle, type VolumeLandmark, type MuscleVolumeStatus, muscleVolumeStatus } from "./landmarks";
import { ALL_MUSCLES } from "./movements";

/**
 * VOLUME ACROSS A BLOCK.
 *
 * The landmarks are not a target — they are the walls of the corridor you move
 * through. A mesocycle starts at MEV (the least work that still grows you, so
 * there is somewhere to go), adds sets week by week toward the top of the MAV
 * band, and then deloads to around MV before the next block starts over at a
 * slightly higher MEV. Sitting at MRV every week is the classic mistake: it
 * leaves no room to progress and buries you in fatigue by week three.
 *
 * `landmarks.ts` answers "where am I against my walls". This module answers
 * "where should I be THIS WEEK, given where I am in the block" — and re-frames
 * the per-muscle prescription against that week's target rather than against a
 * static band.
 */

/** Where the athlete is inside the current mesocycle. */
export interface VolumeBlock {
  /** 1-indexed week within the block. */
  week: number;
  /** Total weeks in the block, deload included. */
  weeks: number;
  /** Whether the final week is a deload (the default — 3 load + 1 deload). */
  deloadLast?: boolean;
  /**
   * How hard the last accumulation week pushes: "mav" tops out at the MAV
   * ceiling (default, sustainable), "overreach" runs a planned functional
   * overreach into the MAV→MRV gap before the deload.
   */
  peakAt?: "mav" | "overreach";
}

export type BlockWeekKind = "introduction" | "accumulation" | "overreach" | "deload";

export interface BlockWeek {
  week: number;
  kind: BlockWeekKind;
  /** 0…1 — how far this week is along the MEV → peak ramp. */
  ramp: number;
}

export const DEFAULT_BLOCK: VolumeBlock = { week: 1, weeks: 4, deloadLast: true, peakAt: "mav" };

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** Normalize an untrusted/partial block into a coherent one. */
export function resolveBlock(b?: Partial<VolumeBlock> | null): VolumeBlock {
  const weeks = clamp(Math.round(Number(b?.weeks) || DEFAULT_BLOCK.weeks), 1, 16);
  const week = clamp(Math.round(Number(b?.week) || 1), 1, weeks);
  return {
    week,
    weeks,
    deloadLast: b?.deloadLast ?? DEFAULT_BLOCK.deloadLast,
    peakAt: b?.peakAt === "overreach" ? "overreach" : "mav",
  };
}

/** The shape of the whole block: which week does what, and how far along the
 *  MEV → peak ramp each one sits. A one-week block is a deload if flagged and
 *  an introduction otherwise; there is no ramp to speak of either way. */
export function blockWeeks(block: VolumeBlock): BlockWeek[] {
  const b = resolveBlock(block);
  const deloadWeek = b.deloadLast && b.weeks > 1 ? b.weeks : null;
  const loadWeeks = deloadWeek ? b.weeks - 1 : b.weeks;
  return Array.from({ length: b.weeks }, (_, i) => {
    const week = i + 1;
    if (week === deloadWeek) return { week, kind: "deload" as const, ramp: 0 };
    // Week 1 sits at MEV (ramp 0), the last load week at the peak (ramp 1).
    const ramp = loadWeeks > 1 ? (week - 1) / (loadWeeks - 1) : 1;
    const kind: BlockWeekKind =
      week === 1 ? "introduction" : b.peakAt === "overreach" && week === loadWeeks ? "overreach" : "accumulation";
    return { week, kind, ramp };
  });
}

/** The current week's position in the block. */
export function currentBlockWeek(block: VolumeBlock): BlockWeek {
  const b = resolveBlock(block);
  return blockWeeks(b).find((w) => w.week === b.week) ?? { week: b.week, kind: "accumulation", ramp: 0 };
}

/**
 * This week's target working sets for one muscle.
 *   introduction  → MEV exactly.
 *   accumulation  → linear along MEV → MAV-high.
 *   overreach     → the last load week of an overreaching block runs into the
 *                   MAV→MRV gap, stopping one set short of the ceiling.
 *   deload        → MV (the maintenance floor) — enough to hold, not to fatigue.
 */
export function targetSetsForWeek(l: VolumeLandmark, w: BlockWeek, peakAt: VolumeBlock["peakAt"] = "mav"): number {
  if (w.kind === "deload") return l.mv;
  const top = peakAt === "overreach" ? Math.max(l.mavHigh, l.mrv - 1) : l.mavHigh;
  return Math.round(l.mev + (top - l.mev) * clamp(w.ramp, 0, 1));
}

/** One muscle's week: where the athlete is, where the block says to be. */
export interface BlockMuscleTarget {
  muscle: MuscleGroup;
  /** Sets actually logged in the window. */
  sets: number;
  /** What the block prescribes for this week. */
  target: number;
  /** target − sets: add (+) or drop (−) to hit the week's prescription. */
  delta: number;
  landmark: VolumeLandmark;
  /** The landmark-only status (which zone, the static band advice). */
  status: MuscleVolumeStatus;
  /** True when the athlete is at/over their ceiling regardless of the ramp —
   *  the ceiling always wins over the plan. */
  overCeiling: boolean;
}

export interface BlockVolumePlan {
  block: VolumeBlock;
  week: BlockWeek;
  targets: BlockMuscleTarget[];
  /** Total prescribed sets this week across all muscles. */
  totalTarget: number;
  /** Total sets logged this week. */
  totalSets: number;
}

/**
 * The week's plan: per-muscle logged sets vs. the block target, plus the plain
 * landmark status underneath. `sessions` is counted over the same 7-day window
 * the Volume screen uses, so the two views can never disagree.
 */
export function blockVolumePlan(
  sessions: LoggedSession[],
  opts: {
    block?: VolumeBlock;
    landmarks?: Record<MuscleGroup, VolumeLandmark>;
    now?: number;
    days?: number;
    includeWarmups?: boolean;
    fractional?: boolean;
  } = {},
): BlockVolumePlan {
  const block = resolveBlock(opts.block ?? DEFAULT_BLOCK);
  const week = currentBlockWeek(block);
  const lm = opts.landmarks ?? VOLUME_LANDMARKS;
  const counts = weeklySetsByMuscle(sessions, opts);

  const targets: BlockMuscleTarget[] = ALL_MUSCLES.map((m) => {
    const l = lm[m];
    const sets = counts.get(m) ?? 0;
    const target = targetSetsForWeek(l, week, block.peakAt);
    const status = muscleVolumeStatus(m, sets, l);
    return {
      muscle: m,
      sets,
      target,
      delta: Math.round((target - sets) * 2) / 2,
      landmark: l,
      status,
      overCeiling: sets >= l.mrv,
    };
  });

  return {
    block,
    week,
    targets,
    totalTarget: targets.reduce((s, t) => s + t.target, 0),
    totalSets: Math.round(targets.reduce((s, t) => s + t.sets, 0) * 2) / 2,
  };
}

/** Advance to the next week, rolling over into week 1 of the next block. */
export function advanceBlock(block: VolumeBlock): VolumeBlock {
  const b = resolveBlock(block);
  return { ...b, week: b.week >= b.weeks ? 1 : b.week + 1 };
}

/**
 * Read the block position out of a macrocycle built by `periodization.ts`, so
 * the season plan and the volume ramp stay one thing rather than two. The
 * mesocycle the week falls in becomes the block; a recovery microcycle at the
 * end of that mesocycle becomes the deload week.
 */
export function blockFromMacrocycle(macro: Macrocycle, currentWeek = 1): VolumeBlock {
  const b = macro.blocks.find((x) => currentWeek >= x.startWeek && currentWeek <= x.endWeek) ?? macro.blocks[0];
  if (!b) return { ...DEFAULT_BLOCK };
  const weeks = Math.max(1, b.endWeek - b.startWeek + 1);
  const deloadLast = b.micros[b.micros.length - 1]?.kind === "recovery";
  return {
    week: clamp(currentWeek - b.startWeek + 1, 1, weeks),
    weeks,
    deloadLast,
    // A peak/taper mesocycle is not the place for a planned overreach.
    peakAt: b.key === "hypertrophy" || b.key === "base" ? "overreach" : "mav",
  };
}
