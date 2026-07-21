import type { LoggedSession, SessionBlock, StrengthBlock } from "./session";
import { blockBestE1rm, setsForVolume, effectiveSetLoadKg } from "./session";
import { bwAt, type BodyweightInput } from "../bodyweight";
import { gymExercise } from "../exercise-db";
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

/** Best estimated 1RM per lift across a set of sessions (kg, rounded) —
 *  bodyweight-aware when `bw` is passed (per-session dated resolution). */
export function bestE1rmMap(sessions: LoggedSession[], bw?: BodyweightInput): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of sessions)
    for (const b of s.blocks)
      if (isStrength(b)) {
        const best = Math.round(blockBestE1rm(b, bwAt(bw, s.startedAt)));
        if (best > 0) map.set(b.name, Math.max(map.get(b.name) ?? 0, best));
      }
  return map;
}

/** Best estimated 1RM per lift within a single session (kg, rounded). */
function bestE1rmInSession(session: LoggedSession, bw?: BodyweightInput): Map<string, number> {
  const map = new Map<string, number>();
  const kg = bwAt(bw, session.startedAt);
  for (const b of session.blocks)
    if (isStrength(b)) {
      const best = Math.round(blockBestE1rm(b, kg));
      if (best > 0) map.set(b.name, Math.max(map.get(b.name) ?? 0, best));
    }
  return map;
}

/**
 * New e1RM personal records set in `session`, compared with everything done
 * BEFORE it (`prior`). A lift never trained before counts as a "first"
 * (previous = null). Ordered by improvement, biggest first. Pass a dated
 * bodyweight lookup so bodyweight lifts PR on their effective load — with the
 * SAME basis on both sides of the comparison.
 */
export function newPrsInSession(session: LoggedSession, prior: LoggedSession[], bw?: BodyweightInput): PrHit[] {
  const before = bestE1rmMap(prior, bw);
  const here = bestE1rmInSession(session, bw);
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
export function prsForSession(all: LoggedSession[], id: string, bw?: BodyweightInput): PrHit[] {
  const target = all.find((s) => s.id === id);
  if (!target) return [];
  const t = new Date(target.startedAt).getTime();
  const prior = all.filter((s) => s.id !== id && new Date(s.startedAt).getTime() < t);
  return newPrsInSession(target, prior, bw);
}

/**
 * Total lifetime personal records — genuine improvements (a lift beating its own
 * prior best) across the whole history, oldest→newest. First-time lifts are
 * excluded so the count reads as "records broken", not "distinct lifts tried".
 */
export function lifetimePrCount(sessions: LoggedSession[]): number {
  const asc = [...sessions].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  let n = 0;
  for (let i = 0; i < asc.length; i++) {
    n += newPrsInSession(asc[i]!, asc.slice(0, i)).filter((h) => h.previous != null).length;
  }
  return n;
}

// ----- Cardio records (distance & pace) -----

export interface CardioPrHit {
  move: string;
  /** "distance" → went further than ever; "pace" → faster than ever over ≥ that far. */
  kind: "distance" | "pace";
  /** distance in km (kind "distance") or pace in sec/km (kind "pace", lower is faster). */
  value: number;
  /** prior best, or null if it's a first. */
  previous: number | null;
}

interface CardioEffort {
  move: string;
  distance: number;
  secPerKm: number | null;
}

/** The paced cardio efforts in a session, the longest distance per move. */
function cardioEfforts(session: LoggedSession): CardioEffort[] {
  const best = new Map<string, CardioEffort>();
  for (const b of session.blocks) {
    if (b.kind !== "cardio" || !b.distance || b.distance <= 0) continue;
    const secPerKm = b.minutes && b.minutes > 0 ? Math.round((b.minutes * 60) / b.distance) : null;
    const cur = best.get(b.name);
    if (!cur || b.distance > cur.distance) best.set(b.name, { move: b.name, distance: b.distance, secPerKm });
  }
  return [...best.values()];
}

/**
 * New cardio personal records in `session` vs everything done BEFORE it: a
 * DISTANCE PR (furthest ever for that move) or, failing that, a PACE PR (beat
 * your best pace among prior runs of that move that were this distance or
 * SHORTER — so you held a faster pace over an equal-or-longer run, and a quick
 * short jog can't fake a long-run pace record). Distance PRs come first.
 */
export function newCardioPrsInSession(session: LoggedSession, prior: LoggedSession[]): CardioPrHit[] {
  const priorEfforts = prior.flatMap(cardioEfforts);
  const hits: CardioPrHit[] = [];
  for (const e of cardioEfforts(session)) {
    const sameMove = priorEfforts.filter((p) => p.move === e.move);
    const prevMaxDist = sameMove.length ? Math.max(...sameMove.map((p) => p.distance)) : null;
    if (prevMaxDist == null || e.distance > prevMaxDist) {
      hits.push({ move: e.move, kind: "distance", value: e.distance, previous: prevMaxDist });
    } else if (e.secPerKm != null) {
      const paces = sameMove.filter((p) => p.distance <= e.distance && p.secPerKm != null).map((p) => p.secPerKm!);
      const prevBestPace = paces.length ? Math.min(...paces) : null;
      if (prevBestPace != null && e.secPerKm < prevBestPace) {
        hits.push({ move: e.move, kind: "pace", value: e.secPerKm, previous: prevBestPace });
      }
    }
  }
  // Distance PRs first, then biggest distance / fastest pace.
  return hits.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "distance" ? -1 : 1));
}

/** Cardio PRs newly set in the session with `id`, from a full session list. */
export function cardioPrsForSession(all: LoggedSession[], id: string): CardioPrHit[] {
  const target = all.find((s) => s.id === id);
  if (!target) return [];
  const t = new Date(target.startedAt).getTime();
  const prior = all.filter((s) => s.id !== id && new Date(s.startedAt).getTime() < t);
  return newCardioPrsInSession(target, prior);
}

export interface MuscleVolume {
  muscle: MuscleGroup;
  volume: number;
}

/**
 * Tonnage (effective load × reps) attributed to each muscle a session trained,
 * using the MOVEMENTS map — each strength set's volume counts toward every
 * muscle the movement touches. Bodyweight-aware: pass `bodyweightKg` so
 * bodyweight lifts (dips, pull-ups…) count their true work (effectiveSetLoadKg;
 * 10 dips at 70 kg = 700 kg) instead of reading 0. Holds and carries (seconds /
 * metres) are never tonnage, matching sessionVolume. Working sets only by
 * default (warm-up / cool-down excluded); pass `includeWarmups` to count them.
 * Strongest first; custom movements with no muscle data are skipped.
 */
export function volumeByMuscle(
  blocks: SessionBlock[],
  includeWarmups = false,
  bodyweightKg?: number | null,
): MuscleVolume[] {
  const map = new Map<MuscleGroup, number>();
  for (const b of blocks) {
    if (b.kind !== "strength") continue;
    const muscles = MOVEMENTS[b.name]?.muscles;
    if (!muscles || muscles.length === 0) continue;
    // A hold or carry's "reps" are seconds/metres — never tonnage (mirrors
    // sessionVolume), so a plank can't gain bodyweight × seconds of "work".
    if ((gymExercise(b.name)?.measure ?? "reps") !== "reps") continue;
    let tonnage = 0;
    for (const s of setsForVolume(b, includeWarmups)) {
      const reps = parseFloat(s.reps);
      if (Number.isFinite(reps)) tonnage += effectiveSetLoadKg(b.name, s.load, bodyweightKg) * reps;
    }
    if (tonnage <= 0) continue;
    for (const m of muscles) map.set(m, (map.get(m) ?? 0) + tonnage);
  }
  return [...map.entries()]
    .map(([muscle, volume]) => ({ muscle, volume: Math.round(volume) }))
    .sort((a, b) => b.volume - a.volume);
}

export interface ExerciseUse {
  name: string;
  kind: "strength" | "cardio" | "conditioning";
  count: number;
  lastUsed: string; // ISO
}

/**
 * Every exercise the athlete has logged, most-recently-used first (ties broken
 * by frequency). Powers a "your lifts" shortcut in the live workout picker so
 * repeating a movement — including a custom one they typed — is one tap.
 */
export function exerciseHistory(sessions: LoggedSession[]): ExerciseUse[] {
  const map = new Map<string, ExerciseUse>();
  for (const s of sessions)
    for (const b of s.blocks) {
      const cur = map.get(b.name);
      if (cur) {
        cur.count += 1;
        if (s.startedAt > cur.lastUsed) cur.lastUsed = s.startedAt;
      } else {
        map.set(b.name, { name: b.name, kind: b.kind, count: 1, lastUsed: s.startedAt });
      }
    }
  return [...map.values()].sort((a, b) => b.lastUsed.localeCompare(a.lastUsed) || b.count - a.count);
}
