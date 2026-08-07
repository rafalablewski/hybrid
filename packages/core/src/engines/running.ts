import { cardioDiscipline, cardioSeconds, type LoggedSession, type CardioBlock, type CardioDiscipline } from "./session";
import { deviceTrueSessions } from "../device-truth";

// Running / cardio analytics — pure aggregates over logged cardio blocks, so the
// web/mobile Running screens (and anything else) read one source of truth. A
// "cardio effort" is any cardio block; pace stats need distance + minutes.
//
// The aggregates below count EVERY cardio block they're handed. Callers narrow
// FIRST via the filters here: the Running screen feeds `runningSessions` (runs
// only — a pool or tennis session must never show up as a "run"); the Cockpit's
// Endurance summary feeds `enduranceSessions` (drops racket/team/combat sports
// but keeps swims/rides/rows). Both filters read the block's `discipline` tag
// (stamped at log time, else backfilled from the name by migrateBlocks), so the
// two clients can't drift on what counts.

const isCardio = (b: { kind: string }): b is CardioBlock => b.kind === "cardio";
const WEEK = 7 * 86_400_000;
const ms = (iso: string) => new Date(iso).getTime();

/** A cardio block's modality — the stamped tag if present, else classified from
 *  the name (the same fallback migrateBlocks uses to backfill it). */
export const blockDiscipline = (b: CardioBlock): CardioDiscipline => b.discipline ?? cardioDiscipline(b.name);

/** Sessions with each cardio block kept only when `keep(discipline)` is true;
 *  strength/other blocks pass through untouched (the aggregates ignore them).
 *  Pure — one shallow copy per session. The building block for the filters below. */
function filterCardio(sessions: LoggedSession[], keep: (d: CardioDiscipline) => boolean): LoggedSession[] {
  // Project the device's measurement BEFORE narrowing: attribution reads the
  // session as it was logged, and dropping blocks first could hand a recording
  // to the wrong effort (see device-truth.ts).
  return deviceTrueSessions(sessions).map((s) => ({
    ...s,
    blocks: s.blocks.filter((b) => !isCardio(b) || keep(blockDiscipline(b))),
  }));
}

/**
 * True when a cardio move is running on foot — a swim, ride, row, or any logged
 * sport is not. Name-based (the Running screen's block-level filter reads the
 * stamped tag directly); exported for callers that only have a move name.
 */
export function isRunMove(name: string): boolean {
  return cardioDiscipline(name) === "running";
}

/**
 * The sessions with every NON-running cardio block dropped — feed this to the
 * running aggregates so the Running screen shows runs only. A swim or tennis
 * session never counts as a run.
 */
export function runningSessions(sessions: LoggedSession[]): LoggedSession[] {
  return filterCardio(sessions, (d) => d === "running");
}

/**
 * The sessions with only NON-endurance SPORTS dropped from their cardio — feed
 * this to the "Endurance" summaries so a tennis/football session doesn't count
 * as endurance while swims, rides, rows and generic cardio still do. (Contrast
 * `runningSessions`, which keeps runs alone.)
 */
export function enduranceSessions(sessions: LoggedSession[]): LoggedSession[] {
  return filterCardio(sessions, (d) => d !== "sport");
}

/**
 * The sessions narrowed to ONE discipline's cardio — the per-discipline building
 * block for the Endurance hub (feed the result to runTotals/runStats/weeklyMileage/
 * paceEffortSplit/paceSeries to get that discipline's analytics).
 */
export function disciplineSessions(sessions: LoggedSession[], discipline: CardioDiscipline): LoggedSession[] {
  return filterCardio(sessions, (d) => d === discipline);
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
          // Second-accurate (device-truth): this best is the SAME anchor
          // paceEffortSplit measures its zones against, so the table's "best
          // pace" and the zone card beside it cannot disagree about one effort.
          const sec = cardioSeconds(b);
          if (sec != null) {
            const pace = Math.round(sec / b.distance);
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
  /** minutes ≥16% slower than your best pace for that move (a base / recovery effort) */
  easy: number;
  /** minutes between the two thresholds — or every minute of a move whose paces
   *  are too tightly clustered to call (see paceEffortSplit) */
  moderate: number;
  /** minutes within ~6% of your best pace for that move (a quality effort) */
  hard: number;
}

/**
 * Cardio minutes split into pace zones — easy / steady / hard — DERIVED FROM
 * PACE, no manual input (no RPE, no heart rate, nothing typed). Intensity is
 * relative to the athlete's own paces PER MOVE (a 5:00/km means different
 * things to different runners), anchored to their best (fastest) pace for that
 * move:
 *   hard  → within ~6% of best pace (a quality / threshold effort)
 *   easy  → ≥16% slower than best (a true recovery / base run)
 *   steady→ in between
 * When a move's paces are tightly clustered (<8% spread) there's no meaningful
 * easy↔hard distinction yet — those minutes count as steady rather than
 * pretending to know the intensity. Needs only distance + duration.
 *
 * DEVICE TRUTH: both the pace and the weighting read `cardioSeconds` — the
 * watch's exact duration where it recorded one — not the display-rounded
 * `minutes`. A 7:52 effort typed as "8 min" sits 1.7% off its own pace, which
 * is enough to push an effort across the 6%/16% lines and contradict the pace
 * shown beside it. Callers hand in already-projected sessions (the filters
 * above, sportSessions), so `seconds` is the device's where there is one.
 */
export function paceEffortSplit(sessions: LoggedSession[]): EffortSplit {
  const byMove = new Map<string, { secPerKm: number; seconds: number }[]>();
  for (const s of sessions)
    for (const b of s.blocks) {
      if (!isCardio(b) || !b.distance || b.distance <= 0) continue;
      const seconds = cardioSeconds(b);
      if (seconds == null) continue;
      const arr = byMove.get(b.name) ?? [];
      arr.push({ secPerKm: seconds / b.distance, seconds });
      byMove.set(b.name, arr);
    }

  // Accumulated in seconds, converted once at the end: summing rounded minutes
  // lets per-effort rounding drift into the totals the percentages come off.
  const split = { easy: 0, moderate: 0, hard: 0 };
  for (const efforts of byMove.values()) {
    const best = Math.min(...efforts.map((e) => e.secPerKm));
    const worst = Math.max(...efforts.map((e) => e.secPerKm));
    const meaningfulSpread = best > 0 && (worst - best) / best >= 0.08;
    for (const e of efforts) {
      if (!meaningfulSpread) {
        split.moderate += e.seconds;
        continue;
      }
      const ratio = e.secPerKm / best;
      if (ratio <= 1.06) split.hard += e.seconds;
      else if (ratio >= 1.16) split.easy += e.seconds;
      else split.moderate += e.seconds;
    }
  }
  return {
    easy: Math.round(split.easy / 60),
    moderate: Math.round(split.moderate / 60),
    hard: Math.round(split.hard / 60),
  };
}
