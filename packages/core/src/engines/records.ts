import type { LoggedSession, SessionBlock, StrengthBlock } from "./session";
import { blockBestE1rm } from "./session";
import { MOVEMENTS } from "./movements";
import type { MuscleGroup } from "./types";

// Personal-record detection. Pure helpers shared by the post-workout summary
// (celebrate a PR the moment it's set) and the session-detail screen (badge the
// lifts that were records when that session happened).

export interface PrHit {
  lift: string;
  /** the new best estimated 1RM (kg, rounded) */
  e1rm: number;
  /** the prior best for this lift, or null if it's the first time trained */
  previous: number | null;
}

const isStrength = (b: SessionBlock): b is StrengthBlock => b.kind === "strength";

/** Best estimated 1RM per lift across a set of sessions (kg, rounded). */
export function bestE1rmMap(sessions: LoggedSession[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of sessions)
    for (const b of s.blocks)
      if (isStrength(b)) {
        const best = Math.round(blockBestE1rm(b));
        if (best > 0) map.set(b.name, Math.max(map.get(b.name) ?? 0, best));
      }
  return map;
}

/** Best estimated 1RM per lift within a single session (kg, rounded). */
function bestE1rmInSession(session: LoggedSession): Map<string, number> {
  const map = new Map<string, number>();
  for (const b of session.blocks)
    if (isStrength(b)) {
      const best = Math.round(blockBestE1rm(b));
      if (best > 0) map.set(b.name, Math.max(map.get(b.name) ?? 0, best));
    }
  return map;
}

/**
 * New e1RM personal records set in `session`, compared with everything done
 * BEFORE it (`prior`). A lift never trained before counts as a "first"
 * (previous = null). Ordered by improvement, biggest first.
 */
export function newPrsInSession(session: LoggedSession, prior: LoggedSession[]): PrHit[] {
  const before = bestE1rmMap(prior);
  const here = bestE1rmInSession(session);
  const hits: PrHit[] = [];
  for (const [lift, e1rm] of here) {
    const prev = before.get(lift) ?? null;
    if (prev == null || e1rm > prev) hits.push({ lift, e1rm, previous: prev });
  }
  return hits.sort((a, b) => e1rm_gain(b) - e1rm_gain(a));
}

const e1rm_gain = (h: PrHit) => h.e1rm - (h.previous ?? 0);

/**
 * The PRs newly set in the session with `id`, taken from a full session list.
 * Prior = every session that started strictly before the target.
 */
export function prsForSession(all: LoggedSession[], id: string): PrHit[] {
  const target = all.find((s) => s.id === id);
  if (!target) return [];
  const t = new Date(target.startedAt).getTime();
  const prior = all.filter((s) => s.id !== id && new Date(s.startedAt).getTime() < t);
  return newPrsInSession(target, prior);
}

export interface MuscleVolume {
  muscle: MuscleGroup;
  volume: number;
}

/**
 * Tonnage (load × reps) attributed to each muscle a session trained, using the
 * MOVEMENTS map — each strength set's volume counts toward every muscle the
 * movement touches. Answers "what did this session actually work?" Strongest
 * first; custom movements with no muscle data are skipped.
 */
export function volumeByMuscle(blocks: SessionBlock[]): MuscleVolume[] {
  const map = new Map<MuscleGroup, number>();
  for (const b of blocks) {
    if (b.kind !== "strength") continue;
    const muscles = MOVEMENTS[b.name]?.muscles;
    if (!muscles || muscles.length === 0) continue;
    let tonnage = 0;
    for (const s of b.sets) {
      const load = parseFloat(s.load);
      const reps = parseFloat(s.reps);
      if (Number.isFinite(load) && Number.isFinite(reps)) tonnage += load * reps;
    }
    if (tonnage <= 0) continue;
    for (const m of muscles) map.set(m, (map.get(m) ?? 0) + tonnage);
  }
  return [...map.entries()]
    .map(([muscle, volume]) => ({ muscle, volume: Math.round(volume) }))
    .sort((a, b) => b.volume - a.volume);
}
