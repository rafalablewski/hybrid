import type { MuscleGroup } from "./types";
import type { LoggedSession } from "./session";
import { setsForVolume } from "./session";
import { MOVEMENTS, ALL_MUSCLES } from "./movements";

// Volume landmarks (Renaissance-Periodization model): the weekly working-set
// counts that bound productive training for each muscle.
//   MV  — Maintenance Volume:     least weekly sets to HOLD gains.
//   MEV — Minimum Effective Vol.: least weekly sets to GROW.
//   MAV — Maximum Adaptive Vol.:  the productive range [mavLow, mavHigh].
//   MRV — Maximum Recoverable:    ceiling before fatigue outruns recovery.
// Pure: counts working sets (warm-ups/cool-downs already excluded by the
// session engine), compares them to per-muscle landmarks, and prescribes a
// per-muscle volume nudge. Feeds the Volume screen + the analytics hub.

export interface VolumeLandmark {
  mv: number;
  mev: number;
  mavLow: number;
  mavHigh: number;
  mrv: number;
}

/**
 * Starting per-muscle landmarks (weekly working sets), derived from RP-style
 * ranges and mapped onto HYBRID's seven muscle groups. Landmarks are individual
 * and experience-dependent — these are sane defaults; they can later adapt per
 * athlete from fatigue/recovery data (see the volume-landmarks capability).
 */
export const VOLUME_LANDMARKS: Record<MuscleGroup, VolumeLandmark> = {
  quads: { mv: 6, mev: 8, mavLow: 12, mavHigh: 18, mrv: 20 },
  glutes: { mv: 0, mev: 4, mavLow: 8, mavHigh: 14, mrv: 16 },
  posterior: { mv: 4, mev: 6, mavLow: 10, mavHigh: 16, mrv: 18 },
  back: { mv: 8, mev: 10, mavLow: 14, mavHigh: 20, mrv: 22 },
  chest: { mv: 6, mev: 8, mavLow: 12, mavHigh: 18, mrv: 20 },
  shoulders: { mv: 6, mev: 8, mavLow: 14, mavHigh: 20, mrv: 22 },
  triceps: { mv: 4, mev: 6, mavLow: 10, mavHigh: 14, mrv: 18 },
};

/** Where this week's volume sits for a muscle, coarsest interpretation. */
export type VolumeZone = "under" | "productive" | "peak" | "overreaching";
/** The single recommended move for a muscle this week. */
export type VolumeAction = "add" | "progress" | "hold" | "reduce";

export interface MuscleVolumeStatus {
  muscle: MuscleGroup;
  /** Weekly working sets counted toward this muscle. */
  sets: number;
  landmark: VolumeLandmark;
  zone: VolumeZone;
  /** ≥MV but <MEV — holding gains, but not enough to grow. */
  maintaining: boolean;
  /** A weekly set target inside the productive (MAV) range. */
  recommendedSets: number;
  /** Sets to add (+) or drop (−) to reach the recommendation. */
  deltaSets: number;
  action: VolumeAction;
}

const hasReps = (reps: string): boolean => {
  const n = parseFloat(reps);
  return Number.isFinite(n) && n > 0;
};

/**
 * Working sets counted toward each muscle over the last `days` (default 7, up to
 * `now`). Each performed WORKING strength set (warm-ups/cool-downs already
 * dropped, empty sets skipped) counts one set toward EVERY muscle the movement
 * trains per the MOVEMENTS map — so a compound contributes to each muscle it
 * hits. A deliberately simple v1; fractional secondary-muscle weighting can come
 * later. Custom movements with no muscle data are skipped.
 */
export function weeklySetsByMuscle(
  sessions: LoggedSession[],
  opts: { now?: number; days?: number; includeWarmups?: boolean } = {},
): Map<MuscleGroup, number> {
  const now = opts.now ?? Date.now();
  const cutoff = now - (opts.days ?? 7) * 86_400_000;
  const map = new Map<MuscleGroup, number>();
  for (const s of sessions) {
    const t = new Date(s.startedAt).getTime();
    if (!(t > cutoff && t <= now)) continue;
    for (const b of s.blocks) {
      if (b.kind !== "strength") continue;
      const muscles = MOVEMENTS[b.name]?.muscles;
      if (!muscles || muscles.length === 0) continue;
      const n = setsForVolume(b, opts.includeWarmups).filter((set) => hasReps(set.reps)).length;
      if (n === 0) continue;
      for (const m of muscles) map.set(m, (map.get(m) ?? 0) + n);
    }
  }
  return map;
}

/** Which landmark zone a weekly set count falls in. */
export function classifyVolume(sets: number, l: VolumeLandmark): VolumeZone {
  if (sets >= l.mrv) return "overreaching";
  if (sets > l.mavHigh) return "peak";
  if (sets >= l.mev) return "productive";
  return "under";
}

/** Full status (zone + the prescribed nudge) for one muscle's weekly sets. */
export function muscleVolumeStatus(
  muscle: MuscleGroup,
  sets: number,
  l: VolumeLandmark = VOLUME_LANDMARKS[muscle],
): MuscleVolumeStatus {
  const zone = classifyVolume(sets, l);
  const maintaining = sets >= l.mv && sets < l.mev;
  let recommendedSets: number;
  let action: VolumeAction;
  if (zone === "under") {
    // Below the minimum to grow → climb into the productive range.
    recommendedSets = l.mavLow;
    action = "add";
  } else if (zone === "productive") {
    // In MAV → progress toward the top of the range while recovery allows.
    recommendedSets = Math.min(sets + 2, l.mavHigh);
    action = sets < l.mavHigh ? "progress" : "hold";
  } else if (zone === "peak") {
    // Above MAV but under MRV → hold; you're near the ceiling.
    recommendedSets = sets;
    action = "hold";
  } else {
    // At/over MRV → pull back to the top of the productive range (deload).
    recommendedSets = l.mavHigh;
    action = "reduce";
  }
  return { muscle, sets, landmark: l, zone, maintaining, recommendedSets, deltaSets: recommendedSets - sets, action };
}

/** Per-muscle weekly volume status for every muscle group, in display order. */
export function volumeStatus(
  sessions: LoggedSession[],
  opts: { now?: number; days?: number; includeWarmups?: boolean } = {},
): MuscleVolumeStatus[] {
  const counts = weeklySetsByMuscle(sessions, opts);
  return ALL_MUSCLES.map((m) => muscleVolumeStatus(m, counts.get(m) ?? 0, VOLUME_LANDMARKS[m]));
}

const ZONE_PRIORITY: Record<VolumeZone, number> = { overreaching: 0, under: 1, peak: 2, productive: 3 };

/**
 * The actionable prescriptions only — muscles to ADD volume to (below MEV) or
 * REDUCE (at/over MRV) — most urgent first (over-MRV before under-MEV, then by
 * the size of the change). The "what should I change this week" list.
 */
export function volumeAdvice(
  sessions: LoggedSession[],
  opts: { now?: number; days?: number; includeWarmups?: boolean } = {},
): MuscleVolumeStatus[] {
  return volumeStatus(sessions, opts)
    .filter((s) => s.action === "add" || s.action === "reduce")
    .sort((a, b) => ZONE_PRIORITY[a.zone] - ZONE_PRIORITY[b.zone] || Math.abs(b.deltaSets) - Math.abs(a.deltaSets));
}
