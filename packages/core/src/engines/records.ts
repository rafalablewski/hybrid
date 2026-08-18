import type { LoggedSession, SessionBlock, StrengthBlock } from "./session";
import { blockBestE1rm, blockBestE1rmSet, blockTopLoad, blockTopLoadSet, cardioSeconds, setsForVolume, effectiveSetLoadKg } from "./session";
import { bwAt, type BodyweightInput } from "../bodyweight";
import { gymExercise, loadUnitCount } from "../exercise-db";
import { musclesFor } from "./movements";
import type { MuscleGroup } from "./types";
import { deviceTrueSession, deviceTrueSessions } from "../device-truth";

// Personal-record detection. Pure helpers shared by the post-workout summary
// (celebrate a PR the moment it's set) and the session-detail screen (badge the
// lifts that were records when that session happened).

export interface PrHit {
  lift: string;
  /**
   * This session's best estimated 1RM for the lift (kg, rounded) — one of the
   * two bases a record is detected on: a rep PR (100 kg × 5 → 100 kg × 8) is a
   * real record even though the bar never got heavier.
   *
   * NOT necessarily greater than `previous`: a hit that qualified on LOAD alone
   * (a heaviest-ever lift after a high-rep block) can carry a lower e1RM than
   * the athlete's prior best. Never headline this — see `topLoad`.
   */
  e1rm: number;
  /** the prior best e1RM for this lift, or null if it's the first time trained */
  previous: number | null;
  /**
   * Heaviest ACTUAL working load moved on this lift in this session (kg,
   * bodyweight-aware). This is the number to SHOW — an athlete reads "your
   * best" as the weight they actually lifted, not a derived estimate (#231).
   */
  topLoad: number;
  /** the prior heaviest actual load, or null if it's the first time trained */
  previousTopLoad: number | null;
  /**
   * The session that set it. Optional because a PrHit is also built by hand in
   * tests and by callers that only have the numbers — but every hit that comes
   * out of newPrsInSession/prsBetween carries it, which is what lets a record
   * on the Activity card open the session behind it (the same promise the
   * figures above it make).
   */
  sessionId?: string;
  /** when it was set (ms), taken from that session's startedAt */
  at?: number;
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

/** Heaviest ACTUAL load per lift across a set of sessions (kg) — the real top
 *  weight, not an estimated 1RM. Bodyweight-aware when `bw` is passed. */
export function topLoadMap(sessions: LoggedSession[], bw?: BodyweightInput): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of sessions)
    for (const b of s.blocks)
      if (isStrength(b)) {
        const best = Math.round(blockTopLoad(b, bwAt(bw, s.startedAt)) * 10) / 10;
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
 * New personal records set in `session`, compared with everything done BEFORE
 * it (`prior`). A lift records on EITHER basis — a heavier top load than ever,
 * or a better estimated 1RM (which is how a same-load rep PR qualifies). A lift
 * never trained before counts as a "first" (both previous fields null). Ordered
 * heaviest-first. Pass a dated bodyweight lookup so bodyweight lifts PR on their
 * effective load — with the SAME basis on both sides of the comparison.
 */
export function newPrsInSession(session: LoggedSession, prior: LoggedSession[], bw?: BodyweightInput): PrHit[] {
  const before = bestE1rmMap(prior, bw);
  const here = bestE1rmInSession(session, bw);
  const loadBefore = topLoadMap(prior, bw);
  const loadHere = topLoadMap([session], bw);
  const hits: PrHit[] = [];
  // Union of both measures: a lift qualifies on either basis, and the two maps
  // can disagree at the edges (a 0-rep entry has an e1RM of 0 but no top load).
  for (const lift of new Set([...here.keys(), ...loadHere.keys()])) {
    const e1rm = here.get(lift) ?? 0;
    const topLoad = loadHere.get(lift) ?? 0;
    const prevE1rm = before.get(lift) ?? null;
    const prevTopLoad = loadBefore.get(lift) ?? null;
    const firstEver = prevE1rm == null && prevTopLoad == null;

    // EITHER basis makes it a record. e1RM alone misses a heaviest-ever lift
    // that follows a high-rep block — 80 kg × 15 (e1RM 120) then 100 kg × 5
    // (e1RM 117) is the heaviest that athlete has ever pulled, and it used to
    // set no record and show no trophy at all. Load alone would miss the rep
    // PR (100 kg × 5 → 100 kg × 8), which is just as real a record.
    const beatsE1rm = prevE1rm != null && e1rm > prevE1rm;
    const beatsLoad = prevTopLoad != null && topLoad > prevTopLoad;
    if (!firstEver && !beatsE1rm && !beatsLoad) continue;

    hits.push({
      lift,
      e1rm,
      previous: firstEver ? null : prevE1rm,
      topLoad,
      previousTopLoad: firstEver ? null : prevTopLoad,
      sessionId: session.id,
      at: Date.parse(session.startedAt),
    });
  }
  // Heaviest first — the same basis the reveal hero picks by, so prs[0] is the
  // record the athlete sees celebrated (they used to disagree, which is how a
  // share caption ended up naming a different lift than the trophy above it).
  return hits.sort((a, b) => b.topLoad - a.topLoad || e1rm_gain(b) - e1rm_gain(a));
}

const e1rm_gain = (h: PrHit) => h.e1rm - (h.previous ?? 0);

/* ───────────────────────── RECORDS AS A PATH ─────────────────────────────
 *
 * A record used to be a NUMBER — the heaviest load, with the estimate behind it
 * as a tiebreak. That is enough to say "you set one" and not enough to say what
 * happened, because a lift moves on TWO axes and the load alone cannot tell
 * `70 × 9 → 70 × 10` (six weeks grinding a rep out) from `65 × 8 → 70 × 10`
 * (your first plate at 70). Both print "70 kg".
 *
 * So the Records block prints the PAIR a lift moved between, and that needs two
 * things this file did not have:
 *
 *   THE POINTS, not the figures. `topLoadMap` answers 90; the path needs the
 *     reps that came with the 90, on both sides of the comparison.
 *
 *   THE AXIS, split rather than fused. `newPrsInSession` files ONE hit per lift
 *     with `topLoad` from the heaviest set and `e1rm` from the best-estimated
 *     one — and on the day you bench 80 × 1 and 70 × 10 those are two DIFFERENT
 *     SETS, so the hit is a record assembled from two. Nothing showed it while
 *     only the load was printed; a path pair beside a delta computed from the
 *     other set puts the seam on the screen. They are two achievements — the
 *     heaviest thing you lifted, and the strongest set you did — so they are
 *     two records here, each whole and each drawn from ONE set.
 *
 * `newPrsInSession` keeps its one-hit-per-lift contract: the celebration, the
 * feed line, the history badge and the live counter all count records with it,
 * and a lift that suddenly counted twice would inflate every one of them. Both
 * come off the same detection pass, so they cannot drift apart.
 */

/** One set, as the Records block draws it: a load and the reps done at it. */
export interface PrSet {
  /** effective kg, bodyweight-aware, rounded to 0.1 like `topLoadMap` */
  load: number;
  reps: number;
}

/**
 * WHICH RECORD THIS IS.
 *   `load`     — the heaviest set ever done on this lift got heavier.
 *   `strength` — the best set got better without the bar getting heavier
 *                (more reps at the same load, or a better set at a lighter one).
 */
export type PrAxis = "load" | "strength";

/**
 * WHAT THE DELTA COLUMN PRINTS — and it never estimates. The load went up, so
 * name the load; only the reps went up, so name the reps; nothing came before
 * it, so `first`. An estimated 1RM decides whether a strength record HAPPENED
 * and is never the number shown, because it is a weight the athlete did not
 * lift.
 *
 * Null when a record's own coordinates cannot name it — unreachable for a
 * genuine hit (e1RM rises only if load or reps rise) and typed rather than
 * asserted, because the pair still tells the story without it.
 */
export type PrDelta =
  | { kind: "load"; kg: number }
  | { kind: "reps"; reps: number }
  | { kind: "first" };

/** ONE RECORD, on ONE axis, drawn from ONE set. */
export interface PrRecord {
  lift: string;
  axis: PrAxis;
  /** the set that set it */
  now: PrSet;
  /** the set it beat, on this axis — null the first time a lift is trained */
  prev: PrSet | null;
  delta: PrDelta | null;
  /**
   * Percent gained ON THE COORDINATE THE DELTA NAMES — load percent for a load
   * delta, rep percent for a rep delta, null for a first. The block RANKS by
   * the same number it PRINTS, which is the only ranking rule that can be
   * explained in one line, and it keeps the quote's "biggest move" honest
   * against a table the reader can check by eye.
   */
  gainPct: number | null;
  sessionId?: string;
  at?: number;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** The heaviest set per lift across sessions, as a point. */
function topLoadSetMap(sessions: LoggedSession[], bw?: BodyweightInput): Map<string, PrSet> {
  const map = new Map<string, PrSet>();
  for (const s of sessions)
    for (const b of s.blocks)
      if (isStrength(b)) {
        const set = blockTopLoadSet(b, bwAt(bw, s.startedAt));
        if (!set || set.load <= 0) continue;
        const point = { load: round1(set.load), reps: set.reps };
        const cur = map.get(b.name);
        if (!cur || point.load > cur.load || (point.load === cur.load && point.reps > cur.reps)) map.set(b.name, point);
      }
  return map;
}

/** The best-estimated set per lift across sessions, as a point plus its e1RM. */
function bestE1rmSetMap(sessions: LoggedSession[], bw?: BodyweightInput): Map<string, PrSet & { e1rm: number }> {
  const map = new Map<string, PrSet & { e1rm: number }>();
  for (const s of sessions)
    for (const b of s.blocks)
      if (isStrength(b)) {
        const set = blockBestE1rmSet(b, bwAt(bw, s.startedAt));
        if (!set || set.e1rm <= 0) continue;
        const point = { load: round1(set.load), reps: set.reps, e1rm: Math.round(set.e1rm) };
        const cur = map.get(b.name);
        if (!cur || point.e1rm > cur.e1rm) map.set(b.name, point);
      }
  return map;
}

const samePoint = (a: PrSet, b: PrSet): boolean => a.load === b.load && a.reps === b.reps;

/** The delta a pair names, and the percent that goes with it. */
function pathDelta(now: PrSet, prev: PrSet | null): { delta: PrDelta | null; gainPct: number | null } {
  if (!prev) return { delta: { kind: "first" }, gainPct: null };
  if (now.load > prev.load)
    return { delta: { kind: "load", kg: round1(now.load - prev.load) }, gainPct: ((now.load - prev.load) / prev.load) * 100 };
  if (now.reps > prev.reps)
    return { delta: { kind: "reps", reps: now.reps - prev.reps }, gainPct: ((now.reps - prev.reps) / prev.reps) * 100 };
  return { delta: null, gainPct: null };
}

/**
 * The records set in `session`, one per AXIS rather than one per lift — the
 * Records block's own view of `newPrsInSession`, off the same comparison.
 *
 * A lift files two only when the two axes landed on DIFFERENT SETS. Bench 100 ×
 * 5 as both your heaviest and your best set is one achievement and one row; the
 * 80 × 1 / 70 × 10 day is two, and it is exactly the day the fused hit was
 * lying about.
 */
export function prRecordsInSession(session: LoggedSession, prior: LoggedSession[], bw?: BodyweightInput): PrRecord[] {
  const prevLoad = topLoadSetMap(prior, bw);
  const prevBest = bestE1rmSetMap(prior, bw);
  const nowLoad = topLoadSetMap([session], bw);
  const nowBest = bestE1rmSetMap([session], bw);
  const at = Date.parse(session.startedAt);
  const stamp = { sessionId: session.id, at: Number.isFinite(at) ? at : undefined };

  const out: PrRecord[] = [];
  for (const lift of new Set([...nowLoad.keys(), ...nowBest.keys()])) {
    const load = nowLoad.get(lift) ?? null;
    const best = nowBest.get(lift) ?? null;
    const pLoad = prevLoad.get(lift) ?? null;
    const pBest = prevBest.get(lift) ?? null;
    const firstEver = pLoad == null && pBest == null;

    // FIRST EVER — one row, whatever the session held. There is no axis to
    // choose between when nothing came before, and the heaviest set is the one
    // an athlete names when asked what they did.
    if (firstEver) {
      const now = load ?? best;
      if (now) out.push({ lift, axis: "load", now: { load: now.load, reps: now.reps }, prev: null, delta: { kind: "first" }, gainPct: null, ...stamp });
      continue;
    }

    const rows: PrRecord[] = [];
    if (load && pLoad && load.load > pLoad.load)
      rows.push({ lift, axis: "load", now: load, prev: pLoad, ...pathDelta(load, pLoad), ...stamp });
    if (best && pBest && best.e1rm > pBest.e1rm) {
      const now = { load: best.load, reps: best.reps };
      const prev = { load: pBest.load, reps: pBest.reps };
      // The same set as the load row: ONE achievement, so one row. The load row
      // states it better — a heavier bar is what happened, and its `prev` is the
      // heaviest set rather than whichever set held the old estimate.
      if (!(rows[0] && samePoint(rows[0].now, now)))
        rows.push({ lift, axis: "strength", now, prev, ...pathDelta(now, prev), ...stamp });
    }
    out.push(...rows);
  }
  return out.sort(comparePrRecords);
}

/** Biggest move first, on the coordinate each row prints; a first-ever lift has
 *  no gain to rank on and goes last, ahead of nothing but a heavier debut. */
export function comparePrRecords(a: PrRecord, b: PrRecord): number {
  const ga = a.gainPct ?? -1;
  const gb = b.gainPct ?? -1;
  return gb - ga || b.now.load - a.now.load || a.lift.localeCompare(b.lift);
}

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
    // The device's second-accurate clock when it measured the effort, else the
    // logged minutes — see cardioSeconds.
    const sec = cardioSeconds(b);
    const secPerKm = sec != null ? Math.round(sec / b.distance) : null;
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
  // A record is set by what you DID, so both sides read the device's distance
  // and time wherever it measured them (see device-truth.ts).
  const priorEfforts = deviceTrueSessions(prior).flatMap(cardioEfforts);
  const hits: CardioPrHit[] = [];
  for (const e of cardioEfforts(deviceTrueSession(session))) {
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
    const muscles = musclesFor(b.name);
    if (muscles.length === 0) continue;
    // A hold or carry's "reps" are seconds/metres — never tonnage (mirrors
    // sessionVolume), so a plank can't gain bodyweight × seconds of "work".
    if ((gymExercise(b.name)?.measure ?? "reps") !== "reps") continue;
    // A bilateral dumbbell lift moves two bells per rep (loadUnitCount); e1RM/PRs
    // stay per-bell, so the factor lives here, at the tonnage site.
    const units = loadUnitCount(b.name);
    let tonnage = 0;
    for (const s of setsForVolume(b, includeWarmups)) {
      const reps = parseFloat(s.reps);
      if (Number.isFinite(reps)) tonnage += effectiveSetLoadKg(b.name, s.load, bodyweightKg) * reps * units;
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
