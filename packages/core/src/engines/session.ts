import type { TrainingLog, EnergySystem } from "./types";
import { MOVEMENTS } from "./movements";

// The persisted Session.blocks shape (matches what the web logger writes and
// what the API stores as JSON). Shared so the logger, history, dashboards, and
// engines all agree on one structure.

export interface StrengthSet {
  load: string;
  reps: string;
  rpe?: string;
  /** mean concentric velocity for the set, m/s (VBT — sensor or manual entry) */
  vel?: string;
  /** peak concentric velocity, m/s */
  peakVel?: string;
  /** range of motion, cm */
  rom?: string;
  /**
   * Drop set — performed immediately after the previous set with NO rest and a
   * reduced load (strip weight, keep going to extend the set past failure).
   */
  drop?: boolean;
  /**
   * Rest taken BEFORE this set, in seconds — captured live by the mobile logger
   * (the gap between banking the previous set and banking this one). Optional, so
   * sessions logged without the live timer (web editor, imports) are unaffected.
   */
  rest?: number;
  /**
   * Set role. Absent (or "working") = a working set: it counts as training
   * volume and can set PRs. "warmup" (ramp/prep sets) and "cooldown" (light
   * back-off work) are EXCLUDED from working-set volume, tonnage, e1RM and PR
   * detection — but kept for the load–velocity profile (useful sub-maximal
   * points). Optional + additive, so every pre-existing session reads as working.
   * Orthogonal to `drop`: a drop set is still a working set.
   */
  role?: SetRole;
}

/** A strength set's role. Absent is treated as "working". */
export type SetRole = "warmup" | "working" | "cooldown";

/**
 * The single "type" a set presents in the logger — its role plus the drop flag
 * folded into one mutually-exclusive choice, since a set is exactly one of these.
 * Stored as two backward-compatible fields (`role` + `drop`); this is the UI view.
 */
export type SetType = "working" | "warmup" | "cooldown" | "drop";

type RoleDrop = { role?: SetRole; drop?: boolean };
const SET_TYPE_ORDER: SetType[] = ["working", "warmup", "cooldown", "drop"];

/** A set counts as training work unless it's a warm-up or cool-down (drops count). */
export const isWorkingSet = (s: { role?: SetRole }): boolean =>
  s.role !== "warmup" && s.role !== "cooldown";

/** The working sets of a strength block (warm-up / cool-down removed). */
export const workingSets = (b: StrengthBlock): StrengthSet[] => b.sets.filter(isWorkingSet);

/**
 * The sets that count toward VOLUME — working sets by default, or every set when
 * `includeWarmups` is on (the user setting "count warm-up & cool-down sets in
 * volume"). One helper so every volume computation honours the same rule.
 */
export const setsForVolume = (b: StrengthBlock, includeWarmups = false): StrengthSet[] =>
  includeWarmups ? b.sets : workingSets(b);

/** The mutually-exclusive UI type of a set, derived from its role + drop flag. */
export function setType(s: RoleDrop): SetType {
  if (s.role === "warmup") return "warmup";
  if (s.role === "cooldown") return "cooldown";
  if (s.drop) return "drop";
  return "working";
}

/**
 * Advance a set to the next type in the cycle (working → warm-up → cool-down →
 * drop → working), returning a NEW set with `role`/`drop` set accordingly and
 * every other field preserved. Generic so the web editor and mobile logger,
 * whose set shapes differ, share one source of truth and can't drift.
 */
export function cycleSetType<T extends RoleDrop>(s: T): T {
  const next = SET_TYPE_ORDER[(SET_TYPE_ORDER.indexOf(setType(s)) + 1) % SET_TYPE_ORDER.length];
  return {
    ...s,
    role: next === "warmup" ? "warmup" : next === "cooldown" ? "cooldown" : undefined,
    drop: next === "drop" ? true : undefined,
  };
}

/** The leftmost badge a set shows: its index for working, else W / C / ↓. */
export function setTypeBadge(s: RoleDrop, index: number): string {
  const t = setType(s);
  return t === "warmup" ? "W" : t === "cooldown" ? "C" : t === "drop" ? "↓" : String(index + 1);
}

/**
 * Move the item at `index` one slot in `dir` (-1 up / +1 down), clamped to the
 * ends (a no-op past either edge). Pure — returns a NEW array. Shared by the web
 * + mobile editors so reordering sets AND exercises has one source of truth (the
 * arrow controls), and can't drift between the two clients.
 */
export function moveItem<T>(arr: T[], index: number, dir: -1 | 1): T[] {
  const j = index + dir;
  if (index < 0 || index >= arr.length || j < 0 || j >= arr.length) return arr;
  const next = arr.slice();
  [next[index], next[j]] = [next[j]!, next[index]!];
  return next;
}

/**
 * Move the item from `from` to `to`, sliding the rest along (the drag-and-drop
 * reorder — drop an item anywhere, not just one slot). Pure — returns a NEW
 * array; a no-op when the indices are equal or out of range.
 */
export function moveItemTo<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= arr.length || to < 0 || to >= arr.length) return arr;
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}

export interface WarmupStep {
  /** load in kg */
  load: number;
  reps: number;
}

/**
 * A warm-up ramp up to a working load (kg) — three sets at ~40/60/80% for 8/5/3
 * reps, rounded to plate-friendly 2.5 kg. Returns [] for bodyweight / near-empty
 * loads (nothing to ramp). Pure; the logger turns these into warm-up sets.
 */
export function warmupRamp(workingKg: number): WarmupStep[] {
  if (!Number.isFinite(workingKg) || workingKg <= 25) return [];
  const steps: [number, number][] = [
    [0.4, 8],
    [0.6, 5],
    [0.8, 3],
  ];
  return steps.map(([pct, reps]) => ({ load: Math.round((workingKg * pct) / 2.5) * 2.5, reps }));
}

export interface StrengthBlock {
  kind: "strength";
  name: string;
  sets: StrengthSet[];
  note?: string;
  /**
   * Superset group key — strength blocks sharing the same `group` are performed
   * together (no rest between exercises), shown as A1/A2/A3… The key is stable
   * (a uid), so a group survives reordering and can hold 3+ exercises.
   */
  group?: string;
  /**
   * @deprecated Legacy "supersetted with the NEXT block" flag (pre-group model).
   * Still read by `supersetLabels` for back-compat; new writes use `group`.
   */
  superset?: boolean;
}

export interface CardioBlock {
  kind: "cardio";
  name: string;
  /** distance covered, km — pace is derived from minutes. */
  distance?: number;
  minutes?: number;
  rpe?: number;
}

export interface ConditioningBlock {
  kind: "conditioning";
  name: string;
  format?: string;
  work?: number;
  rest?: number;
  rounds?: number;
  minutes?: number;
  rpe?: number;
  /**
   * @deprecated Cardio distance now lives on its own `cardio` block kind. Still
   * read by `migrateBlocks` to upgrade sessions logged before the split.
   */
  distance?: number;
}

export type SessionBlock = StrengthBlock | CardioBlock | ConditioningBlock;

export type BlockKind = SessionBlock["kind"];

export interface LoggedSession {
  id: string;
  title: string;
  startedAt: string; // ISO
  completedAt?: string | null;
  blocks: SessionBlock[];
  readiness?: number | null;
}

const isStrength = (b: SessionBlock): b is StrengthBlock => b.kind === "strength";
export const isCardio = (b: SessionBlock): b is CardioBlock => b.kind === "cardio";
const num = (s: string | undefined): number => {
  const n = parseFloat(s ?? "");
  return Number.isFinite(n) ? n : NaN;
};

/** Estimated 1-rep max (Epley). */
export function e1rm(load: number, reps: number): number {
  return reps <= 0 ? 0 : load * (1 + reps / 30);
}

/** Best estimated 1RM across a strength block's WORKING sets (warm-ups excluded). */
export function blockBestE1rm(b: StrengthBlock): number {
  let best = 0;
  for (const s of workingSets(b)) {
    const load = num(s.load);
    const reps = num(s.reps);
    if (!Number.isNaN(load) && !Number.isNaN(reps)) best = Math.max(best, e1rm(load, reps));
  }
  return best;
}

/**
 * Pace per km for a cardio block (e.g. "5:42 /km"), derived from distance +
 * minutes. Null unless both are logged — pace isn't stored, it's computed so it
 * can never disagree with the distance/time it came from.
 */
export function pacePerKm(b: { distance?: number; minutes?: number }): string | null {
  if (!b.distance || b.distance <= 0 || !b.minutes || b.minutes <= 0) return null;
  return `${paceClock((b.minutes * 60) / b.distance)} /km`;
}

/** Format seconds-per-km as a m:ss clock, e.g. 342 → "5:42". */
export function paceClock(secPerKm: number): string {
  // Round to whole seconds FIRST, then split — otherwise rounding the seconds
  // component alone can yield 60 (e.g. 359.6 → "5:60" instead of "6:00").
  const total = Math.round(secPerKm);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export interface PacePoint {
  date: string; // ISO
  secPerKm: number;
}

/** Pace (sec/km) over time for one cardio move, oldest → newest. Lower is faster. */
export function paceSeries(sessions: LoggedSession[], move: string): PacePoint[] {
  const sorted = [...sessions].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );
  const pts: PacePoint[] = [];
  for (const s of sorted)
    for (const b of s.blocks)
      if (isCardio(b) && b.name === move && b.distance && b.distance > 0 && b.minutes && b.minutes > 0)
        pts.push({ date: s.startedAt, secPerKm: Math.round((b.minutes * 60) / b.distance) });
  return pts;
}

/** The headline cardio move in a session (the one with the longest paced distance). */
export function headlineRunMove(blocks: SessionBlock[]): string | undefined {
  return blocks
    .filter((b): b is CardioBlock => isCardio(b) && !!b.distance && !!b.minutes)
    .sort((a, b) => (b.distance ?? 0) - (a.distance ?? 0))[0]?.name;
}

/**
 * One-line summary of a cardio block: distance, minutes, derived pace, RPE.
 * Shared so the web + mobile history/detail views read runs the same way.
 */
export function cardioSummary(b: CardioBlock, opts: { rpe?: boolean } = {}): string {
  const parts: (string | null | undefined)[] = [];
  if (b.distance) parts.push(`${b.distance} km`);
  if (b.minutes) parts.push(`${b.minutes} min`);
  const pace = pacePerKm(b);
  if (pace) parts.push(pace);
  if (opts.rpe && b.rpe) parts.push(`RPE ${b.rpe}`);
  return parts.filter(Boolean).join(" · ") || "cardio";
}

/**
 * One-line summary of a conditioning (interval/metcon) block: format, the
 * interval (rounds × work/rest seconds), total minutes, and optionally RPE.
 */
export function conditioningSummary(b: ConditioningBlock, opts: { rpe?: boolean } = {}): string {
  const parts: (string | null | undefined)[] = [b.format];
  if (b.work && b.rest) parts.push(`${b.rounds ? `${b.rounds}×` : ""}${b.work}/${b.rest}s`);
  else if (b.rounds) parts.push(`${b.rounds} rounds`);
  if (b.minutes) parts.push(`${b.minutes} min`);
  if (opts.rpe && b.rpe) parts.push(`RPE ${b.rpe}`);
  return parts.filter(Boolean).join(" · ");
}

/** One-line summary of any block. */
export function blockSummary(b: SessionBlock): string {
  if (isStrength(b)) return b.sets.map((s) => `${s.load || "–"}×${s.reps || "–"}`).join(" · ");
  if (isCardio(b)) return cardioSummary(b);
  return conditioningSummary(b);
}

/**
 * The most recent prior strength performance of EACH lift (newest session
 * first), keyed by lift name. One pass over a single sort, so the live logger
 * can show a "last time" reference per exercise without re-sorting history on
 * every render. Powers progressive overload — a target to beat.
 */
export function lastStrengthByLift(sessions: LoggedSession[]): Map<string, StrengthBlock> {
  const sorted = [...sessions].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );
  const map = new Map<string, StrengthBlock>();
  for (const s of sorted)
    for (const b of s.blocks)
      if (isStrength(b) && b.sets.length && !map.has(b.name)) map.set(b.name, b);
  return map;
}

// ----- Block kind inference + legacy migration -----

const CARDIO_RE = /\b(run|jog|walk|hike|ruck|sprint|swim|bike|cycl|ride|row(?!ing intervals)|erg|ski|elliptical|treadmill|cardio)\b/i;
const CONDITIONING_RE = /\b(metcon|emom|amrap|wod|circuit|interval|conditioning|tabata|complex|finisher)s?\b/i;

/**
 * Best-guess block kind for an exercise name — checks the MOVEMENTS catalog
 * first (a movement with a system / a "cond" pattern is cardio or conditioning),
 * then a keyword heuristic, defaulting to strength.
 */
export function inferBlockKind(name: string): BlockKind {
  const m = MOVEMENTS[name];
  if (m) {
    if (m.system == null && m.pattern !== "cond") return "strength";
    // A known engine move: aerobic steady → cardio; intervals/metcon → conditioning.
    if (CONDITIONING_RE.test(name)) return "conditioning";
    if (m.system === "aerobic" || CARDIO_RE.test(name)) return "cardio";
    return "conditioning";
  }
  if (CONDITIONING_RE.test(name)) return "conditioning";
  if (CARDIO_RE.test(name)) return "cardio";
  return "strength";
}

/**
 * Upgrade sessions logged BEFORE the cardio/conditioning split: a conditioning
 * block that carries a distance and no interval shape (work/rest/rounds) becomes
 * a cardio block. Idempotent and defensive over raw JSON — apply at every point
 * stored Session.blocks are read back into a LoggedSession.
 */
export function migrateBlocks(blocks: unknown): SessionBlock[] {
  if (!Array.isArray(blocks)) return [];
  return blocks.map((raw) => {
    const b = raw as Record<string, unknown>;
    if (
      b?.kind === "conditioning" &&
      typeof b.distance === "number" &&
      b.distance > 0 &&
      !b.work &&
      !b.rest &&
      !b.rounds
    ) {
      return {
        kind: "cardio",
        name: String(b.name ?? "Cardio"),
        distance: b.distance,
        ...(typeof b.minutes === "number" ? { minutes: b.minutes } : {}),
        ...(typeof b.rpe === "number" ? { rpe: b.rpe } : {}),
      } satisfies CardioBlock;
    }
    return raw as SessionBlock;
  });
}

/** Migrate the blocks of a whole session list read from storage. */
export function migrateSessions<T extends { blocks: unknown }>(sessions: T[]): (Omit<T, "blocks"> & { blocks: SessionBlock[] })[] {
  return sessions.map((s) => ({ ...s, blocks: migrateBlocks(s.blocks) }));
}

// ----- Supersets (A1/A2/A3 groups) -----

type GroupedBlock = { kind: string; group?: string; superset?: boolean };

/** The superset group key for a block, normalizing the legacy `superset` flag. */
function groupKeyAt(blocks: GroupedBlock[], i: number): string | null {
  const b = blocks[i];
  if (!b || b.kind !== "strength") return null;
  if (b.group) return b.group;
  // Legacy boolean: `superset` meant "joined to the NEXT block". A contiguous
  // run of strength blocks linked that way is one group, keyed by its start.
  const linksToNext = (x?: GroupedBlock) => !!x && x.kind === "strength" && !!x.superset && !x.group;
  const inRun = (!!b.superset && !b.group) || linksToNext(blocks[i - 1]);
  if (!inRun) return null;
  let start = i;
  while (start > 0 && linksToNext(blocks[start - 1])) start--;
  return `legacy-${start}`;
}

/**
 * Per-block superset labels (e.g. ["A1","A2",null,"B1","B2"]). Groups are
 * lettered by first appearance; only groups with ≥2 members are labelled. One
 * source of truth so the web + mobile editors and detail views can't drift.
 */
export function supersetLabels(blocks: GroupedBlock[]): (string | null)[] {
  const keys = blocks.map((_, i) => groupKeyAt(blocks, i));
  const counts = new Map<string, number>();
  for (const k of keys) if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  const letters = new Map<string, string>();
  const seq = new Map<string, number>();
  let nextLetter = 0;
  return keys.map((k) => {
    if (!k || (counts.get(k) ?? 0) < 2) return null;
    if (!letters.has(k)) letters.set(k, String.fromCharCode(65 + nextLetter++ % 26));
    const n = (seq.get(k) ?? 0) + 1;
    seq.set(k, n);
    return `${letters.get(k)}${n}`;
  });
}

/** True when a block shares a superset group with the block directly above it. */
export function isSupersettedWithPrev(blocks: GroupedBlock[], index: number): boolean {
  const k = groupKeyAt(blocks, index);
  return !!k && k === groupKeyAt(blocks, index - 1);
}

/**
 * Toggle whether the block at `index` is supersetted with the one directly
 * above it: joins (or extends) that group, or leaves it. Drops any group left
 * with a single member. Pure — returns a new array; `newKey` mints group ids.
 */
export function toggleSuperset<T extends { kind: string; group?: string; superset?: boolean }>(
  blocks: T[],
  index: number,
  newKey: () => string,
): T[] {
  const cur = blocks[index];
  const prev = blocks[index - 1];
  if (!cur || !prev || cur.kind !== "strength" || prev.kind !== "strength") return blocks;
  const next = blocks.slice();
  if (isSupersettedWithPrev(blocks, index)) {
    next[index] = { ...cur, group: undefined, superset: undefined };
  } else {
    const g = groupKeyAt(blocks, index - 1) ?? newKey();
    if (!prev.group) next[index - 1] = { ...prev, group: g, superset: undefined };
    next[index] = { ...cur, group: g, superset: undefined };
  }
  // Cleanup: a group with <2 members isn't a superset anymore.
  const counts = new Map<string, number>();
  for (const b of next) if (b.kind === "strength" && b.group) counts.set(b.group, (counts.get(b.group) ?? 0) + 1);
  return next.map((b) =>
    b.kind === "strength" && b.group && (counts.get(b.group) ?? 0) < 2 ? { ...b, group: undefined } : b,
  );
}

/**
 * Tonnage (load × reps) summed across a session's strength sets. Working sets
 * only by default; pass `includeWarmups` to count warm-up/cool-down sets too
 * (the user volume setting).
 */
export function sessionVolume(blocks: SessionBlock[], includeWarmups = false): number {
  let v = 0;
  for (const b of blocks) {
    if (!isStrength(b)) continue;
    for (const s of setsForVolume(b, includeWarmups)) {
      const load = num(s.load);
      const reps = num(s.reps);
      if (!Number.isNaN(load) && !Number.isNaN(reps)) v += load * reps;
    }
  }
  return Math.round(v);
}

export function totalVolume(sessions: LoggedSession[]): number {
  return sessions.reduce((sum, s) => sum + sessionVolume(s.blocks), 0);
}

/** Distinct strength lift names seen across sessions, most-frequent first. */
export function liftNames(sessions: LoggedSession[]): string[] {
  const counts = new Map<string, number>();
  for (const s of sessions)
    for (const b of s.blocks)
      if (isStrength(b)) counts.set(b.name, (counts.get(b.name) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
}

export interface E1rmPoint {
  date: string;
  e1rm: number;
}

/** e1RM over time for one lift, oldest → newest. */
export function e1rmSeries(sessions: LoggedSession[], lift: string): E1rmPoint[] {
  const sorted = [...sessions].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );
  const pts: E1rmPoint[] = [];
  for (const s of sorted)
    for (const b of s.blocks)
      if (isStrength(b) && b.name === lift) {
        const best = blockBestE1rm(b);
        if (best > 0) pts.push({ date: s.startedAt, e1rm: Math.round(best) });
      }
  return pts;
}

export interface PrRow {
  lift: string;
  e1rm: number;
  when: string;
}

/** Best e1RM per lift (all-time PRs), strongest first. */
export function bestE1rmByLift(sessions: LoggedSession[]): PrRow[] {
  const map = new Map<string, { e1rm: number; when: string }>();
  for (const s of sessions)
    for (const b of s.blocks)
      if (isStrength(b)) {
        const best = Math.round(blockBestE1rm(b));
        const cur = map.get(b.name);
        if (best > 0 && (!cur || best > cur.e1rm)) map.set(b.name, { e1rm: best, when: s.startedAt });
      }
  return [...map.entries()]
    .map(([lift, v]) => ({ lift, ...v }))
    .sort((a, b) => b.e1rm - a.e1rm);
}

/**
 * Convert logged sessions into the engine's TrainingLog so fatigue/readiness/
 * prescription run on the athlete's REAL data — the Sprint 4 spine.
 */
export function toTrainingLog(sessions: LoggedSession[], now = Date.now()): TrainingLog {
  return sessions.map((s) => {
    const daysAgo = Math.max(0, Math.round((now - new Date(s.startedAt).getTime()) / 86_400_000));
    const items = s.blocks.map((b) => {
      if (b.kind === "strength") {
        const est = Math.round(blockBestE1rm(b));
        const working = workingSets(b);
        let topRpe = 0;
        for (const st of working) {
          const r = num(st.rpe);
          if (!Number.isNaN(r)) topRpe = Math.max(topRpe, r);
        }
        return {
          move: b.name,
          e1rm: est || undefined,
          topRpe: topRpe || undefined,
          hardSets: working.length,
        };
      }
      if (b.kind === "cardio") {
        const system = (MOVEMENTS[b.name]?.system ?? "aerobic") as EnergySystem;
        return { move: b.name, system, minutes: b.minutes ?? 30, rpe: b.rpe ?? 6, ...(b.distance ? { distance: b.distance } : {}) };
      }
      const system = (MOVEMENTS[b.name]?.system ?? "anaerobic") as EnergySystem;
      const minutes =
        b.minutes ??
        (b.work && b.rest && b.rounds ? Math.round(((b.work + b.rest) * b.rounds) / 60) : 12);
      return { move: b.name, system, minutes, rpe: b.rpe ?? 8 };
    });
    return { daysAgo, items };
  });
}
