/**
 * SESSION MUSCLE MAP — where a whole session's work actually landed, per muscle.
 *
 * The app has known which muscles a LIFT drives since the exercise DB landed
 * (exercise-anatomy.ts ranks them to the percentage point) and it has been able
 * to DRAW that on a body since body-map.ts landed. Neither has ever seen a
 * session: the anatomy is wired to the single-exercise page, and the summary's
 * muscle read runs on the engine's seven coarse buckets (volumeByMuscle), which
 * cannot tell a press day from a raise day because both are "shoulders".
 *
 * This module joins the two. Each strength block contributes its TONNAGE —
 * computed exactly as volumeByMuscle computes it, so the two can never disagree
 * about how much work happened — split across its muscles by that lift's own
 * activation shares. Bench Press is chest 61 / triceps 22 / front delts 17, so
 * 2 900 kg of benching puts 1 769 kg through the chest, and a session's map is
 * the sum over its blocks.
 *
 * WHAT IS AND IS NOT INVENTED. The activation percentages are a transparent
 * model over the DB's primary/secondary lists (exercise-anatomy.ts owns it and
 * says so); the tonnage is measured. Nothing here estimates a muscle the
 * catalog does not name: a custom lift the DB has never heard of is REPORTED as
 * unmapped rather than guessed at, so a session made entirely of custom work
 * returns an empty map and the client can say so instead of drawing a body lit
 * at zero.
 *
 * Holds and carries are excluded for the same reason they are excluded from
 * tonnage everywhere else — their "reps" are seconds or metres, and seconds
 * times a load is not work. Warm-ups follow the athlete's own volume setting.
 */
import type { LoggedSession } from "./engines/session";
import { setsForVolume, effectiveSetLoadKg } from "./engines/session";
import { gymExercise, loadUnitCount, type Muscle } from "./exercise-db";
import {
  muscleActivation,
  MUSCLE_LABEL,
  MUSCLE_SHORT,
  levelFor,
  type MuscleActivation,
} from "./exercise-anatomy";
import { muscleGlows, type MuscleGlow } from "./body-map";
import { bwAt, type BodyweightInput } from "./bodyweight";
import { deviceTrueSession } from "./device-truth";
import { localDayKey, dayKeyDiff } from "./day-key";

/**
 * What a muscle DID in the session:
 *  • driver — most of its work came from lifts that name it a primary mover.
 *  • assist — it was along for the ride on somebody else's lift.
 * There is deliberately no third "brace" tier: stabilisers live in the anatomy
 * model as prose strings ("Core (abs & obliques)"), not as typed muscles, so a
 * brace tier here would have to guess at a mapping. When stabilisers become
 * typed, this union is where they land.
 */
export type SessionMuscleTier = "driver" | "assist";

export interface SessionMuscle {
  muscle: Muscle;
  /** anatomical label, e.g. "Pectoralis major (chest)" */
  label: string;
  /** short label for tight rows, e.g. "Chest" */
  short: string;
  /** share of the session's attributed tonnage — whole numbers summing to 100 */
  pct: number;
  /** kilograms of this session's tonnage attributed to this muscle */
  volumeKg: number;
  /** how many counted sets touched it at all */
  sets: number;
  tier: SessionMuscleTier;
  /**
   * Percent change against this muscle's own recent baseline, or null when a
   * baseline was not supplied or the athlete has no history for it yet. Never a
   * cohort — always the athlete against themselves.
   */
  deltaPct: number | null;
}

export interface SessionMuscleMap {
  /** ranked, hardest-worked first */
  muscles: SessionMuscle[];
  /** the session's attributed tonnage (kg) — the denominator behind `pct` */
  totalKg: number;
  /** the driver: the top muscle, or null for a session with no mapped lifting */
  lead: SessionMuscle | null;
  /**
   * Names the catalog does not know, so the client can be honest about what the
   * body is NOT showing rather than silently under-reporting.
   */
  unmapped: string[];
}

/** Per-muscle recent norm — the "your usual" a session row is measured against. */
export interface MuscleBaseline {
  /** mean kg per session THAT TRAINED IT (a muscle you skip does not drag its own average down) */
  meanKg: Partial<Record<Muscle, number>>;
  /** how many sessions each mean is built from — one session is not a baseline */
  sessions: Partial<Record<Muscle, number>>;
}

/** A muscle's most recent appearance — the neglect read. */
export interface MuscleCoverage {
  muscle: Muscle;
  short: string;
  /** whole days since it was last driven, or null if never in the window */
  daysSince: number | null;
  /** ISO start of the session that last drove it, or null */
  lastAt: string | null;
}

/** The fewest sessions a mean has to average before it may be called a baseline. */
export const BASELINE_MIN_SESSIONS = 3;

/** Blocks contribute tonnage exactly as volumeByMuscle counts it. */
function blockTonnageKg(
  b: Extract<LoggedSession["blocks"][number], { kind: "strength" }>,
  bodyweightKg: number | null,
  includeWarmups: boolean,
): { kg: number; sets: number } {
  // A hold or carry's "reps" are seconds/metres — never tonnage.
  if ((gymExercise(b.name)?.measure ?? "reps") !== "reps") return { kg: 0, sets: 0 };
  // A bilateral dumbbell lift moves two bells per rep (loadUnitCount).
  const units = loadUnitCount(b.name);
  let kg = 0;
  let sets = 0;
  for (const s of setsForVolume(b, includeWarmups)) {
    const reps = parseFloat(s.reps);
    if (!Number.isFinite(reps)) continue;
    kg += effectiveSetLoadKg(b.name, s.load, bodyweightKg) * reps * units;
    sets++;
  }
  return { kg, sets };
}

interface Acc {
  kg: number;
  sets: number;
  /** kg that arrived from lifts naming this muscle a PRIMARY mover */
  primaryKg: number;
}

/** Walk a session's strength blocks into per-muscle accumulators. */
function accumulate(
  session: LoggedSession,
  bodyweightKg: number | null,
  includeWarmups: boolean,
): { acc: Map<Muscle, Acc>; totalKg: number; unmapped: string[] } {
  const acc = new Map<Muscle, Acc>();
  const unmapped: string[] = [];
  let totalKg = 0;
  for (const b of session.blocks) {
    if (b.kind !== "strength") continue;
    const e = gymExercise(b.name);
    if (!e) {
      // A custom lift: counted nowhere rather than attributed by guesswork.
      if (!unmapped.includes(b.name)) unmapped.push(b.name);
      continue;
    }
    const { kg, sets } = blockTonnageKg(b, bodyweightKg, includeWarmups);
    if (kg <= 0) continue;
    totalKg += kg;
    for (const a of muscleActivation(e)) {
      const share = (kg * a.pct) / 100;
      const cur = acc.get(a.muscle) ?? { kg: 0, sets: 0, primaryKg: 0 };
      cur.kg += share;
      cur.sets += sets;
      if (a.tier === "primary") cur.primaryKg += share;
      acc.set(a.muscle, cur);
    }
  }
  return { acc, totalKg, unmapped };
}

/**
 * Where a session's work landed, per muscle, ranked.
 *
 * `bw` is the dated bodyweight lookup so a dip or a pull-up counts its true
 * work at the athlete's weight ON THE DAY. Pass `baseline` (from
 * `muscleBaseline` over the sessions BEFORE this one) to get each row's
 * comparison against its own recent norm.
 */
export function sessionMuscleMap(
  session: LoggedSession,
  opts: {
    bw?: BodyweightInput;
    includeWarmups?: boolean;
    baseline?: MuscleBaseline | null;
  } = {},
): SessionMuscleMap {
  const { bw, includeWarmups = false, baseline = null } = opts;
  // House rule: every figure reads through the device projection. A watch does
  // not measure tonnage, but the projection is the one door into a session and
  // going around it is how a surface drifts.
  const view = deviceTrueSession(session);
  const bodyweightKg = bwAt(bw, session.startedAt);
  const { acc, totalKg, unmapped } = accumulate(view, bodyweightKg, includeWarmups);

  if (acc.size === 0 || totalKg <= 0) {
    return { muscles: [], totalKg: 0, lead: null, unmapped };
  }

  const rows: SessionMuscle[] = [...acc.entries()]
    .map(([muscle, a]) => {
      const base = baseline?.meanKg[muscle];
      const n = baseline?.sessions[muscle] ?? 0;
      const enough = base != null && base > 0 && n >= BASELINE_MIN_SESSIONS;
      return {
        muscle,
        label: MUSCLE_LABEL[muscle],
        short: MUSCLE_SHORT[muscle],
        pct: Math.round((a.kg / totalKg) * 100),
        volumeKg: Math.round(a.kg),
        sets: a.sets,
        tier: (a.primaryKg * 2 >= a.kg ? "driver" : "assist") as SessionMuscleTier,
        deltaPct: enough ? Math.round(((a.kg - base) / base) * 100) : null,
      };
    })
    .sort((x, y) => y.volumeKg - x.volumeKg || x.muscle.localeCompare(y.muscle));

  // Fix rounding drift on the top row so the column reads as a clean 100%,
  // exactly as muscleActivation does for a single lift.
  const drift = 100 - rows.reduce((s, r) => s + r.pct, 0);
  if (rows.length > 0 && drift !== 0) rows[0]!.pct += drift;

  return { muscles: rows, totalKg: Math.round(totalKg), lead: rows[0] ?? null, unmapped };
}

/**
 * The session map as glow intensities for the body figure — the same
 * `MuscleGlow` shape and the same normalisation the per-exercise map uses, so
 * one renderer draws both and the two can never disagree about what "lit" means.
 */
export function sessionMuscleGlows(map: SessionMuscleMap): MuscleGlow[] {
  const activation: MuscleActivation[] = map.muscles.map((m) => {
    const tier = m.tier === "driver" ? ("primary" as const) : ("secondary" as const);
    return {
      muscle: m.muscle,
      label: m.label,
      short: m.short,
      tier,
      pct: m.pct,
      level: levelFor(tier, m.pct),
    };
  });
  return muscleGlows(activation);
}

/**
 * Each muscle's recent norm, from the sessions BEFORE the one being summarised.
 *
 * Averaged over the sessions that TRAINED the muscle, not over every session in
 * the window: a chest day compared against "your mean chest volume including the
 * six days you did not bench" would read +400% every time and mean nothing.
 */
export function muscleBaseline(
  sessions: LoggedSession[],
  opts: { days?: number; bw?: BodyweightInput; now?: Date; includeWarmups?: boolean } = {},
): MuscleBaseline {
  const { days = 28, bw, now = new Date(), includeWarmups = false } = opts;
  const cutoff = now.getTime() - days * 86400000;
  const sum: Partial<Record<Muscle, number>> = {};
  const count: Partial<Record<Muscle, number>> = {};
  for (const s of sessions) {
    const t = Date.parse(s.startedAt);
    if (!Number.isFinite(t) || t < cutoff || t > now.getTime()) continue;
    const map = sessionMuscleMap(s, { bw, includeWarmups });
    for (const m of map.muscles) {
      if (m.volumeKg <= 0) continue;
      sum[m.muscle] = (sum[m.muscle] ?? 0) + m.volumeKg;
      count[m.muscle] = (count[m.muscle] ?? 0) + 1;
    }
  }
  const meanKg: Partial<Record<Muscle, number>> = {};
  for (const key of Object.keys(sum) as Muscle[]) {
    const n = count[key] ?? 0;
    if (n > 0) meanKg[key] = Math.round((sum[key] ?? 0) / n);
  }
  return { meanKg, sessions: count };
}

/**
 * How long since each muscle was last DRIVEN — the neglect read behind
 * "untouched 9 days: hamstrings, lats". Only driver-tier appearances count: a
 * muscle that assisted somebody else's press has not been trained.
 *
 * Most-neglected first; muscles never seen in the window sort last with a null
 * `daysSince`, because "never in 60 days" is a different statement from "9 days
 * ago" and the client should be able to word it differently.
 */
export function muscleCoverage(
  sessions: LoggedSession[],
  opts: { days?: number; bw?: BodyweightInput; now?: Date } = {},
): MuscleCoverage[] {
  const { days = 60, bw, now = new Date() } = opts;
  const cutoff = now.getTime() - days * 86400000;
  const last = new Map<Muscle, string>();
  for (const s of sessions) {
    const t = Date.parse(s.startedAt);
    if (!Number.isFinite(t) || t < cutoff || t > now.getTime()) continue;
    for (const m of sessionMuscleMap(s, { bw }).muscles) {
      if (m.tier !== "driver") continue;
      const seen = last.get(m.muscle);
      if (!seen || Date.parse(seen) < t) last.set(m.muscle, s.startedAt);
    }
  }
  const today = localDayKey(now);
  return (Object.keys(MUSCLE_SHORT) as Muscle[])
    .map((muscle) => {
      const lastAt = last.get(muscle) ?? null;
      return {
        muscle,
        short: MUSCLE_SHORT[muscle],
        lastAt,
        daysSince: lastAt ? Math.max(0, dayKeyDiff(localDayKey(lastAt), today)) : null,
      };
    })
    .sort((a, b) => {
      if (a.daysSince == null && b.daysSince == null) return a.muscle.localeCompare(b.muscle);
      if (a.daysSince == null) return -1;
      if (b.daysSince == null) return 1;
      return b.daysSince - a.daysSince;
    });
}
