import type { LoggedSession, CardioBlock } from "./session";
import { olympicSport } from "../olympic-sports";

// Running / cardio analytics — pure aggregates over logged cardio blocks, so the
// web/mobile Running screens (and anything else) read one source of truth. A
// "cardio effort" is any cardio block; pace stats need distance + minutes.
//
// The aggregates below count EVERY cardio block (the Cockpit's "Endurance"
// summary + the AI coach read them as all-cardio). The Running SCREEN wants
// running only — a pool or tennis session must never show up as a "run" — so it
// pre-filters its sessions through `runningSessions` (built on `isRunMove`)
// before handing them here. Keeping the split here means both clients' Running
// screens stay in lockstep from one source of truth.

const isCardio = (b: { kind: string }): b is CardioBlock => b.kind === "cardio";
const WEEK = 7 * 86_400_000;
const ms = (iso: string) => new Date(iso).getTime();

// A "run" is locomotion on foot — not swims, rides, rows, rackets or any other
// logged sport/cardio that also lands in a cardio block. A logged Olympic sport
// resolves through the catalog (only the foot-races count); a generic or custom
// cardio name ("Easy Run", "Treadmill", a typed-in "Bike") falls back to a
// keyword test, with an explicit NON-running block first so a shared word can't
// leak a "Row Sprints" or "Bike Intervals" through.
const RUN_SPORTS = new Set(["Running", "Marathon"]);
const NOT_RUN_RE = /\b(swim|bike|cycl|ride|row|erg|paddle|kayak|canoe|ski|skate|elliptical|walk|hike|ruck|climb|stair|surf|sail)\b/i;
const RUN_RE = /\b(run|running|jog|jogging|sprint|treadmill|fartlek|parkrun)\b/i;

/**
 * True when a cardio move is running on foot. Named Olympic sports resolve
 * through the catalog (only Running/Marathon count — Swimming, Tennis, Cycling,
 * Rowing, … don't); generic/custom names use a keyword test that excludes the
 * other cardio modalities. Powers the Running screen so a swim or tennis session
 * never counts as a run.
 */
export function isRunMove(name: string): boolean {
  if (!name) return false;
  const sport = olympicSport(name);
  if (sport) return RUN_SPORTS.has(sport.name);
  if (NOT_RUN_RE.test(name)) return false;
  return RUN_RE.test(name);
}

/**
 * The sessions with every NON-running cardio block dropped — feed this to the
 * running aggregates so the Running screen shows runs only. Strength and other
 * blocks pass through untouched (the aggregates ignore them anyway); only a
 * cardio block that isn't a run is removed. Pure — a shallow copy per session.
 */
export function runningSessions(sessions: LoggedSession[]): LoggedSession[] {
  return sessions.map((s) => ({
    ...s,
    blocks: s.blocks.filter((b) => !isCardio(b) || isRunMove(b.name)),
  }));
}

export interface RunTotals {
  efforts: number;
  distanceKm: number;
  minutes: number;
}

/** Whole-history cardio totals (efforts, distance, minutes). */
export function runTotals(sessions: LoggedSession[]): RunTotals {
  let efforts = 0;
  let distanceKm = 0;
  let minutes = 0;
  for (const s of sessions)
    for (const b of s.blocks)
      if (isCardio(b)) {
        efforts += 1;
        if (b.distance && b.distance > 0) distanceKm += b.distance;
        if (b.minutes && b.minutes > 0) minutes += b.minutes;
      }
  return { efforts, distanceKm: Math.round(distanceKm * 10) / 10, minutes: Math.round(minutes) };
}

export interface RunStat {
  move: string;
  efforts: number;
  distanceKm: number;
  minutes: number;
  longestKm: number;
  /** best (lowest) pace in sec/km among paced efforts, or null. */
  bestPaceSecPerKm: number | null;
}

/** Per-move cardio stats, most total distance first. */
export function runStats(sessions: LoggedSession[]): RunStat[] {
  const map = new Map<string, RunStat>();
  for (const s of sessions)
    for (const b of s.blocks)
      if (isCardio(b)) {
        const cur =
          map.get(b.name) ??
          { move: b.name, efforts: 0, distanceKm: 0, minutes: 0, longestKm: 0, bestPaceSecPerKm: null };
        cur.efforts += 1;
        if (b.distance && b.distance > 0) {
          cur.distanceKm += b.distance;
          cur.longestKm = Math.max(cur.longestKm, b.distance);
          if (b.minutes && b.minutes > 0) {
            const pace = Math.round((b.minutes * 60) / b.distance);
            cur.bestPaceSecPerKm = cur.bestPaceSecPerKm == null ? pace : Math.min(cur.bestPaceSecPerKm, pace);
          }
        }
        if (b.minutes && b.minutes > 0) cur.minutes += b.minutes;
        map.set(b.name, cur);
      }
  return [...map.values()]
    .map((r) => ({ ...r, distanceKm: Math.round(r.distanceKm * 10) / 10, minutes: Math.round(r.minutes) }))
    .sort((a, b) => b.distanceKm - a.distanceKm || b.efforts - a.efforts);
}

/** Distinct cardio moves that have paced data (distance + minutes), by total km. */
export function pacedRunMoves(sessions: LoggedSession[]): string[] {
  const km = new Map<string, number>();
  for (const s of sessions)
    for (const b of s.blocks)
      if (isCardio(b) && b.distance && b.distance > 0 && b.minutes && b.minutes > 0)
        km.set(b.name, (km.get(b.name) ?? 0) + b.distance);
  return [...km.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => m);
}

export interface WeekMileage {
  weekStart: string; // ISO, start of the 7-day bucket
  km: number;
  minutes: number;
  efforts: number;
}

/** Distance/minutes per week for the last `weeks` windows, oldest → newest. */
export function weeklyMileage(sessions: LoggedSession[], weeks = 8, now = Date.now()): WeekMileage[] {
  const out: WeekMileage[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const to = now - w * WEEK;
    const from = to - WEEK;
    let km = 0;
    let minutes = 0;
    let efforts = 0;
    for (const s of sessions) {
      const t = ms(s.startedAt);
      if (t < from || t >= to) continue;
      for (const b of s.blocks)
        if (isCardio(b)) {
          efforts += 1;
          if (b.distance && b.distance > 0) km += b.distance;
          if (b.minutes && b.minutes > 0) minutes += b.minutes;
        }
    }
    out.push({ weekStart: new Date(from).toISOString(), km: Math.round(km * 10) / 10, minutes: Math.round(minutes), efforts });
  }
  return out;
}

export interface EffortSplit {
  /** minutes at an easy effort (RPE ≤ 6) */
  easy: number;
  /** minutes at a steady effort (near your typical pace, or sparse data) */
  moderate: number;
  /** minutes at a hard effort (near your best pace for that move) */
  hard: number;
}

/**
 * Cardio minutes split into pace zones — easy / steady / hard — DERIVED FROM
 * PACE, no manual input. Intensity is relative to the athlete's own paces PER
 * MOVE (a 5:00/km means different things to different runners), anchored to
 * their best (fastest) pace for that move:
 *   hard  → within ~6% of best pace (a quality / threshold effort)
 *   easy  → ≥16% slower than best (a true recovery / base run)
 *   steady→ in between
 * When a move's paces are tightly clustered (<8% spread) there's no meaningful
 * easy↔hard distinction yet — those minutes count as steady rather than
 * pretending to know the intensity. Needs only distance + minutes.
 */
export function paceEffortSplit(sessions: LoggedSession[]): EffortSplit {
  const byMove = new Map<string, { secPerKm: number; minutes: number }[]>();
  for (const s of sessions)
    for (const b of s.blocks)
      if (isCardio(b) && b.distance && b.distance > 0 && b.minutes && b.minutes > 0) {
        const arr = byMove.get(b.name) ?? [];
        arr.push({ secPerKm: (b.minutes * 60) / b.distance, minutes: b.minutes });
        byMove.set(b.name, arr);
      }

  const split: EffortSplit = { easy: 0, moderate: 0, hard: 0 };
  for (const efforts of byMove.values()) {
    const best = Math.min(...efforts.map((e) => e.secPerKm));
    const worst = Math.max(...efforts.map((e) => e.secPerKm));
    const meaningfulSpread = best > 0 && (worst - best) / best >= 0.08;
    for (const e of efforts) {
      if (!meaningfulSpread) {
        split.moderate += e.minutes;
        continue;
      }
      const ratio = e.secPerKm / best;
      if (ratio <= 1.06) split.hard += e.minutes;
      else if (ratio >= 1.16) split.easy += e.minutes;
      else split.moderate += e.minutes;
    }
  }
  return { easy: Math.round(split.easy), moderate: Math.round(split.moderate), hard: Math.round(split.hard) };
}
