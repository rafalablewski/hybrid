import type {
  Macrocycle,
  Prescription,
  PrescribedStrengthBlock,
  PrescribedConditioningBlock,
  PrescribedCardioBlock,
  TrainingLog,
  LogItem,
  Biometrics,
} from "./types";
import { currentPhase } from "./periodization";
import { prescribeSession, type PrescribeExperience, type PrescribeEquipment } from "./prescription";
import type { LoadVelocityProfile } from "./velocity";
import type { SessionBlock } from "./session";
import type { SportPrescription, SportBlock, SportMeasure } from "../sports";
import { kmValue } from "../distance";

/**
 * The reconciler — one session out of three engines.
 *
 * Three engines independently answer "what should I train?" on different
 * horizons: the macrocycle (engines/periodization.ts) sets the SEASON arc, the
 * daily route (engines/prescription.ts) doses today's lift from readiness, and
 * the sport engine (sports.ts) picks the S&C that transfers. They never
 * coordinate, so on the same day they overlap (the same lift twice) or pull in
 * different directions (a heavy daily lift in a deload week).
 *
 * `reconcilePlan` makes the enrolled macrocycle PHASE the arbiter: the current
 * microcycle's intensity/volume is the WEEK'S ENVELOPE, and the daily + sport
 * movements are dosed WITHIN it (loads scaled toward the phase intensity, set
 * counts toward the phase volume). Overlap is resolved by priority — the daily
 * primary lift owns its movement; a sport block naming the same lift is dropped
 * as a duplicate. A recovery/deload week trims accessory work so the planned
 * deload isn't undone by bolt-on sport volume. Pure — no I/O, no UI.
 */

/** A normal load week's intensity/volume — the envelope factors are relative to this. */
const REFERENCE_INTENSITY = 75;
const REFERENCE_VOLUME = 80;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const roundPlate = (kg: number) => Math.round(kg / 2.5) * 2.5;

export interface ReconcileInput {
  /** the enrolled macrocycle (the season). */
  macro: Macrocycle;
  /** which week of the macrocycle we're in (1-indexed). Defaults to 1. */
  currentWeek?: number;
  /** the readiness-driven daily prescription (prescribeSession). */
  daily: Prescription;
  /** the sport transfer prescription (prescribeForSport), if the athlete trains for a sport. */
  sport?: SportPrescription;
}

export interface ReconciledBlock {
  kind: "strength" | "conditioning";
  name: string;
  /** which engine the movement came from. */
  source: "daily" | "sport";
  /** the sport demand this trains (sport blocks only). */
  demand?: string;
  sets: number;
  /** what the per-set quantity is counted in (sport blocks carry the movement's
   *  own measure — a hold is seconds, a carry is metres). */
  measure?: SportMeasure;
  /** the per-set quantity, in `measure`. */
  amount?: number;
  /** Per-set reps — set only for a reps-measured movement, so nothing can read
   *  a 30-second hold as 30 repetitions. */
  reps?: number;
  /** working load in kg, when the movement is loadable. */
  load?: number;
  /** display scheme — "4×5 @ 90kg", "8 rounds 40/20s", "4×8" bodyweight,
   *  "4×30 s" a hold. */
  scheme: string;
  /** true when no external load applies (bodyweight / plyometric). */
  bodyweight?: boolean;
  /** conditioning format (conditioning blocks only). */
  format?: string;
}

export interface ReconciledPlan {
  phase: {
    label: string;
    focus: string;
    /** the macrocycle week this plan is for. */
    week: number;
    kind: "load" | "recovery";
  };
  /** the week's envelope (0..100), straight off the microcycle. */
  intensity: number;
  volume: number;
  /** the factors the envelope applied to daily/sport dosing. */
  loadFactor: number;
  volumeFactor: number;
  /** the unified session: primary strength → sport transfer → conditioning. */
  blocks: ReconciledBlock[];
  /** movements removed during reconciliation, with the reason. */
  dropped: { name: string; reason: string }[];
  why: string;
}

/**
 * Reconcile the daily prescription and sport transfer work against the current
 * macrocycle phase, returning one coherent session for the day.
 */
export function reconcilePlan(input: ReconcileInput): ReconciledPlan {
  const { macro, daily, sport } = input;
  const week = input.currentWeek ?? 1;
  const { block, micro } = currentPhase(macro, week);

  // the phase envelope → dosing factors, clamped so a single phase can't make
  // the day absurd (no <60% loads, no >115%; volume 50%..120%).
  const loadFactor = clamp(micro.intensity / REFERENCE_INTENSITY, 0.6, 1.15);
  const volumeFactor = clamp(micro.volume / REFERENCE_VOLUME, 0.5, 1.2);
  const isRecovery = micro.kind === "recovery";

  const blocks: ReconciledBlock[] = [];
  const dropped: { name: string; reason: string }[] = [];

  // ---- 1) the daily primary strength lift owns its movement ----
  const dailyStrength = daily.blocks.find(
    (b): b is PrescribedStrengthBlock => b.kind === "strength",
  );
  let primaryName: string | null = null;
  if (dailyStrength) {
    primaryName = dailyStrength.name;
    const baseSets = dailyStrength.sets.length;
    const first = dailyStrength.sets[0];
    const baseLoad = first ? Number(first.load) : NaN;
    const reps = first ? Number(first.reps) : 5;
    const sets = Math.max(1, Math.round(baseSets * volumeFactor));
    if (Number.isFinite(baseLoad) && baseLoad > 0) {
      const load = roundPlate(baseLoad * loadFactor);
      blocks.push({
        kind: "strength",
        name: dailyStrength.name,
        source: "daily",
        sets,
        reps,
        load,
        scheme: `${sets}×${reps} @ ${load}kg`,
      });
    } else {
      blocks.push({
        kind: "strength",
        name: dailyStrength.name,
        source: "daily",
        sets,
        reps,
        scheme: `${sets}×${reps}`,
        bodyweight: true,
      });
    }
  }

  // ---- 2) sport transfer work, deduped and dosed within the envelope ----
  if (sport) {
    // a recovery/deload week keeps only the single highest-priority transfer lift
    // (demands are pre-ranked, so blocks[0] is the most important) — accessory
    // sport volume must not undo a planned deload.
    let sportBlocks = sport.blocks;
    if (isRecovery && sportBlocks.length > 1) {
      for (const b of sportBlocks.slice(1)) {
        dropped.push({ name: b.name, reason: "recovery week — trimmed accessory transfer work" });
      }
      sportBlocks = sportBlocks.slice(0, 1);
    }
    for (const b of sportBlocks) {
      if (primaryName && b.name === primaryName) {
        dropped.push({ name: b.name, reason: `already your primary lift today (${primaryName})` });
        continue;
      }
      const sets = Math.max(1, Math.round(b.sets * volumeFactor));
      // The week's envelope scales the SET COUNT; the per-set quantity stays as
      // the sport engine dosed it, in that movement's own measure. A hold that
      // came in as seconds must not come out as reps.
      const unit = b.measure === "time" ? " s" : b.measure === "distance" ? " m" : "";
      const per = `${b.amount}${unit}`;
      if (b.load != null && !b.bodyweight) {
        const load = roundPlate(b.load * loadFactor);
        blocks.push({
          kind: "strength",
          name: b.name,
          source: "sport",
          demand: b.demand,
          sets,
          measure: b.measure,
          amount: b.amount,
          reps: b.reps,
          load,
          scheme: `${sets}×${per} @ ${load}kg`,
        });
      } else {
        blocks.push({
          kind: "strength",
          name: b.name,
          source: "sport",
          demand: b.demand,
          sets,
          measure: b.measure,
          amount: b.amount,
          reps: b.reps,
          scheme: `${sets}×${per}`,
          bodyweight: true,
        });
      }
    }
  }

  // ---- 3) conditioning / cardio last, dose-scaled to the envelope volume ----
  const dailyCond = daily.blocks.find(
    (b): b is PrescribedConditioningBlock | PrescribedCardioBlock => b.kind === "conditioning" || b.kind === "cardio",
  );
  if (dailyCond) {
    if (dailyCond.kind === "conditioning" && dailyCond.work != null && dailyCond.rest != null && dailyCond.rounds != null) {
      // Interval prescription: scale rounds to the week's volume envelope.
      const rounds = Math.max(1, Math.round(dailyCond.rounds * volumeFactor));
      blocks.push({
        kind: "conditioning",
        name: dailyCond.name,
        source: "daily",
        sets: rounds,
        reps: 0,
        format: dailyCond.format,
        scheme: `${rounds} rounds ${dailyCond.work}/${dailyCond.rest}s`,
      });
    } else {
      // Steady cardio (e.g. easy run): distance + minutes target, dose-scaled.
      const minutes = Math.max(1, Math.round((dailyCond.minutes ?? 20) * volumeFactor));
      const distance = dailyCond.kind === "cardio" ? dailyCond.distance : undefined;
      const paceTarget = dailyCond.kind === "cardio" ? dailyCond.paceTarget : undefined;
      blocks.push({
        kind: "conditioning",
        name: dailyCond.name,
        source: "daily",
        sets: 1,
        reps: 0,
        format: dailyCond.kind === "conditioning" ? dailyCond.format : "Steady",
        scheme: distance
          ? `${kmValue(distance)} km${paceTarget ? ` @ ${paceTarget}` : ""} – ${minutes} min`
          : `${minutes} min`,
      });
    }
  }

  const dedups = dropped.filter((d) => d.reason.startsWith("already")).length;
  const why =
    `Week ${week} — ${block.label} (${micro.kind} week, ${block.focus.toLowerCase()}). ` +
    `The phase sets a ${micro.intensity}/100 intensity, ${micro.volume}/100 volume envelope, ` +
    `so working loads are scaled ${loadFactor.toFixed(2)}× and volume ${volumeFactor.toFixed(2)}× ` +
    `around your readiness-based prescription.` +
    (dedups
      ? ` Dropped ${dedups} sport block${dedups > 1 ? "s" : ""} that duplicated today's primary lift.`
      : "") +
    (isRecovery && dropped.some((d) => d.reason.startsWith("recovery"))
      ? " Trimmed accessory sport work to protect the deload."
      : "");

  return {
    phase: { label: block.label, focus: block.focus, week, kind: micro.kind },
    intensity: micro.intensity,
    volume: micro.volume,
    loadFactor,
    volumeFactor,
    blocks,
    dropped,
    why,
  };
}

// ============================================================
//  Materialization — turn the reconciled plan into dated sessions
// ============================================================

/** A reconciled session laid onto a date, ready to persist as an Assignment. */
export interface ScheduledAssignment {
  /** "{phase} · {primary lift}". */
  name: string;
  /** the persisted Session.blocks shape (what the logger + calendar consume). */
  blocks: SessionBlock[];
  /** ISO date the session is scheduled for. */
  date: string;
}

/** Even-ish offsets (days from the week start) for N training days in a 7-day window. */
const WEEK_SPREAD: Record<number, number[]> = {
  1: [0],
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 2, 4, 6],
  5: [0, 1, 3, 4, 6],
  6: [0, 1, 2, 3, 4, 5],
};

/**
 * Map the reconciled blocks onto the persisted SessionBlock shape — so a
 * reconciled plan can be written as a real Session/Assignment, not just shown.
 */
export function reconciledToSessionBlocks(blocks: ReconciledBlock[]): SessionBlock[] {
  return blocks.map((b): SessionBlock => {
    if (b.kind === "conditioning") {
      return { kind: "conditioning", name: b.name, format: b.format, rounds: b.sets };
    }
    return {
      kind: "strength",
      name: b.name,
      // The logger's per-set field is labelled off the exercise's own profile
      // ("reps" / "s" / "m", see exerciseProfile), so the QUANTITY goes in
      // whatever measure the block carries — seconds for a hold, metres for a
      // carry — and a hold seeds "30", not six reps.
      sets: Array.from({ length: b.sets }, () => ({
        load: b.load != null ? String(b.load) : "",
        reps: String(b.amount ?? b.reps ?? 0),
        rpe: "",
      })),
    };
  });
}

/**
 * Lay the reconciled session onto the week's training days — the materialization
 * step. Because every day comes from ONE reconciled plan (the phase already
 * arbitrated route vs sport), the resulting dated rows can't collide with each
 * other; they slot onto the calendar alongside coach Assignments. v1 writes the
 * same session across the week's training days (the phase envelope is the week's
 * constant); per-day variation arrives when each day re-prescribes off the prior
 * day's log.
 */
/** Lay one reconciled plan onto a date `off` days after `start` (noon local). */
function datedAssignment(plan: ReconciledPlan, start: Date, off: number): ScheduledAssignment {
  const d = new Date(start);
  d.setDate(d.getDate() + off);
  d.setHours(12, 0, 0, 0);
  return {
    name: `${plan.phase.label} – ${plan.blocks[0]?.name ?? "Session"}`,
    blocks: reconciledToSessionBlocks(plan.blocks),
    date: d.toISOString(),
  };
}

export function scheduleWeek(
  plan: ReconciledPlan,
  opts: { startDate?: Date; daysPerWeek?: number } = {},
): ScheduledAssignment[] {
  const start = opts.startDate ? new Date(opts.startDate) : new Date();
  const days = clamp(Math.round(opts.daysPerWeek ?? 3), 1, 6);
  return WEEK_SPREAD[days]!.map((off) => datedAssignment(plan, start, off));
}

// Round-robin a list into `n` buckets (bucket i gets items i, i+n, i+2n, …).
function distribute<T>(items: T[], n: number): T[][] {
  const out: T[][] = Array.from({ length: n }, () => []);
  items.forEach((it, i) => out[i % n]!.push(it));
  return out;
}

// Turn a reconciled day into the LogItems it would add to the athlete's history,
// so the NEXT day's prescription feels its fatigue (the heavy squat today is why
// tomorrow picks a press). Conditioning minutes are derived from the daily
// block's work/rest per round (rounds are NOT minutes), so the system-fatigue
// dose lands on the right scale. Unknown sport-accessory moves contribute no
// muscle fatigue (they're not in MOVEMENTS) — harmless; the main lifts drive it.
function dayToLogItems(plan: ReconciledPlan, daily: Prescription): LogItem[] {
  const cond = daily.blocks.find(
    (b): b is PrescribedConditioningBlock | PrescribedCardioBlock => b.kind === "conditioning" || b.kind === "cardio",
  );
  const perRoundSec =
    cond?.kind === "conditioning" && cond.work != null && cond.rest != null ? cond.work + cond.rest : 60;
  return plan.blocks.map((b) =>
    b.kind === "strength"
      ? { move: b.name, hardSets: b.sets, topRpe: 8 }
      : {
          move: b.name,
          system: daily.pickSys,
          // Steady cardio carries its own minutes (sets = 1); intervals derive
          // minutes from rounds × work/rest.
          minutes:
            cond?.minutes != null && b.sets === 1
              ? cond.minutes
              : Math.max(1, Math.round((b.sets * perRoundSec) / 60)),
          rpe: 8,
        },
  );
}

export interface BuildWeekInput {
  macro: Macrocycle;
  currentWeek?: number;
  /** the athlete's training log (drives the daily prescription each day). */
  log: TrainingLog;
  bio?: Biometrics;
  profiles?: Record<string, LoadVelocityProfile>;
  /** the sport transfer prescription, spread across the week's days. */
  sport?: SportPrescription;
  daysPerWeek?: number;
  startDate?: Date;
  /** experience + equipment from intake — tunes each day's prescription. */
  experience?: PrescribeExperience;
  equipment?: PrescribeEquipment;
}

/**
 * Build a VARIED training week by SEQUENTIAL re-prescription: each training day
 * is prescribed off a log that already carries the fatigue from the earlier
 * generated days this week, so the rotation is EMERGENT, not hard-coded — the
 * engine naturally avoids the muscles it just hammered and picks the freshest
 * pattern, exactly as a coach would program a week. Each day still runs through
 * reconcilePlan (phase envelope + overlap rules) and gets a round-robin share of
 * the sport transfer work. The richer counterpart to scheduleWeek.
 */
export function buildTrainingWeek(input: BuildWeekInput): ScheduledAssignment[] {
  const start = input.startDate ? new Date(input.startDate) : new Date();
  const days = clamp(Math.round(input.daysPerWeek ?? 3), 1, 6);
  const offsets = WEEK_SPREAD[days]!;
  const sportByDay = distribute<SportBlock>(input.sport?.blocks ?? [], days);

  // sessions generated so far this week, keyed by their day offset, so each can
  // be aged correctly when viewed from a later day.
  const generated: { offset: number; items: LogItem[] }[] = [];

  return offsets.map((off, i) => {
    // the log AS SEEN on this day: real sessions are `off` days older, and each
    // earlier generated day is (off − its offset) days old.
    const view: TrainingLog = [
      ...input.log.map((s) => ({ ...s, daysAgo: s.daysAgo + off })),
      ...generated.map((g) => ({ daysAgo: off - g.offset, items: g.items })),
    ];
    // today's wearable reading only applies to today (offset 0), not future days.
    const daily = prescribeSession(view, off === 0 ? input.bio : undefined, {
      profiles: input.profiles,
      experience: input.experience,
      equipment: input.equipment,
    });
    const daySport =
      input.sport && sportByDay[i]!.length
        ? { ...input.sport, blocks: sportByDay[i]! }
        : undefined;
    const plan = reconcilePlan({
      macro: input.macro,
      daily,
      sport: daySport,
      currentWeek: input.currentWeek,
    });

    // record what was done so the next day's prescription feels it.
    generated.push({ offset: off, items: dayToLogItems(plan, daily) });

    return datedAssignment(plan, start, off);
  });
}

/** Minimal Assignment shape needed to decide a re-sync (a subset of the DB row). */
export interface SchedulableRow {
  athleteId?: string;
  assignedById?: string;
  status: string;
  date: string;
  createdAt?: string;
}

/**
 * Does the upcoming SELF-scheduled week need regenerating? True when a still-
 * pending, self-authored (athlete === author) assignment dated today-or-later
 * was generated BEFORE the athlete's most recent logged session — i.e. real
 * results have landed since the week was simulated, so the rest of it should be
 * re-prescribed off them. Coach-authored and completed days never trigger it.
 */
export function weekNeedsResync(
  rows: SchedulableRow[],
  sessions: { startedAt: string }[],
  now = Date.now(),
): boolean {
  let latest = 0;
  for (const s of sessions) {
    const t = Date.parse(s.startedAt);
    if (Number.isFinite(t) && t > latest) latest = t;
  }
  if (!latest) return false;
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  return rows.some(
    (r) =>
      r.status === "assigned" &&
      !!r.assignedById &&
      r.assignedById === r.athleteId &&
      Date.parse(r.date) >= startOfToday.getTime() &&
      Date.parse(r.createdAt ?? "") < latest,
  );
}
