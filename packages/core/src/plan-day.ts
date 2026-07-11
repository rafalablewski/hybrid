import { GOAL_TREE, PLAN_DETAIL, type GoalPlan, type PlanSampleItem } from "./plans";
import { programFor } from "./plan-programs";
import {
  planProgramView,
  stepKg,
  type PlanDay,
  type PlanEntry,
  type PlanLift,
  type PlanDiscipline,
  type ProgramDayView,
} from "./plan-program";
import type { SessionBlock } from "./engines/session";

// ============================================================
//  Named-plan "today" — when the athlete is enrolled in a REAL uploaded plan
//  (e.g. the Bodybuilding 4-Day Full Body), the plan's exact day drives "Your
//  plan today" instead of the engine's algorithmic pick. Pure; both clients
//  render the same day and prefill the same session.
// ============================================================

export interface PlanToday {
  planId: string;
  planName: string;
  /** the plan day's label, e.g. "Day 1 — Strength" */
  day: string;
  items: PlanSampleItem[];
  /** 0-based index into the plan's training days */
  dayIndex: number;
  totalDays: number;
}

/** Find a plan by id across every goal in the library (null if none). */
export function findGoalPlan(planId: string): GoalPlan | null {
  for (const g of GOAL_TREE) {
    const p = g.plans.find((x) => x.id === planId);
    if (p) return p;
  }
  return null;
}

/**
 * The enrolled NAMED plan's session to do today. Walks the plan's training days
 * in order by how many sessions the athlete has logged (each logged session
 * advances one day, cycling back to Day 1 at the end). Returns null unless
 * planId resolves to a REAL uploaded plan (PLAN_DETAIL) — so the engine's own
 * prescription stays the default for goals without a named plan.
 */
export function planToday(planId: string | null | undefined, sessionsLogged: number): PlanToday | null {
  if (!planId) return null;
  const detail = PLAN_DETAIL[planId];
  if (!detail || !detail.days.length) return null;
  const total = detail.days.length;
  const n = Number.isFinite(sessionsLogged) ? Math.max(0, Math.floor(sessionsLogged)) : 0;
  const dayIndex = n % total;
  const session = detail.days[dayIndex]!;
  return {
    planId,
    planName: findGoalPlan(planId)?.name ?? planId,
    day: session.day,
    items: session.items,
    dayIndex,
    totalDays: total,
  };
}

/**
 * Collapse every numeric range in a "sets × reps" string to a single number —
 * the TOP of the range (the double-progression target: hit the top across all
 * sets, then add load). Reps and time both collapse: "5 × 3–5" → "5 × 5",
 * "3 × 45–60 sec" → "3 × 60 sec". Strings without a range pass through. Use
 * this everywhere an sr is shown so a prescription never reads as a range.
 */
export function srSingleReps(sr: string | null | undefined): string {
  if (!sr) return "";
  // Match N–M (en/em dash or hyphen) and keep the top number + any spacing.
  return sr.replace(/(\d+)\s*[–—-]\s*(\d+)/g, "$2");
}

/** Parse a plan item's "sets × reps" string (e.g. "5 × 3–5", "3 × 45–60 sec")
 *  into a set count + a reps label. Falls back to 3 sets when unparseable.
 *  Reps collapse to the single top-of-range target (see srSingleReps). */
function parseSetsReps(sr: string): { sets: number; reps: string } {
  const parts = sr.split("×");
  const left = (parts[0] ?? "").trim();
  const sets = Math.max(1, Math.min(10, parseInt(left, 10) || 3));
  const reps = srSingleReps(parts.slice(1).join("×").trim() || left);
  return { sets, reps };
}

/**
 * Convert a named-plan day's items into logger SessionBlocks so "Start" prefills
 * the exact plan session. Load is left blank for the athlete to fill (the plan
 * gives ranges, not their kg); reps keep the plan's range text and RPE carries
 * unless it's "—". Every item is a strength block (these are gym plans).
 */
export function planDayToBlocks(items: PlanSampleItem[]): SessionBlock[] {
  return items.map((it) => {
    const { sets, reps } = parseSetsReps(it.sr);
    const rpe = it.rpe && it.rpe !== "—" ? it.rpe : "";
    return {
      kind: "strength",
      name: it.name,
      sets: Array.from({ length: sets }, () => ({ load: "", reps, rpe })),
    } as SessionBlock;
  });
}

// ============================================================
//  Discipline-shaped "today" — the modern PlanProgram equivalent of planToday.
//  When the athlete is enrolled in a discipline-shaped program (Soviet OWL, 6-day
//  PPL, 5K running, kettlebell, …), THIS drives "Your plan today": it resolves the
//  program by id (programFor), walks its weeks→days by how many sessions the
//  athlete has logged (skipping rest days), and returns both a display view (rows)
//  and a prefill (blocks) for the day's session. Pure; both clients render it.
// ============================================================

export interface PlanProgramTodayRow {
  name: string;
  /** "AM" / "PM" session band, rendered as a small tag before the name (not a
   *  "AM · " string prefix), or null for a single daily session. */
  session: string | null;
  /** already-formatted prescription — "70%×3×3 (95kg)", "4×8 80 kg @9", or the
   *  prose workout ("3 miles easy"); reads exactly as the Plans-library card. */
  detail: string;
  /** complex / tempo / alternative annotation, or null. */
  note: string | null;
}

export interface PlanProgramToday {
  planId: string;
  planName: string;
  discipline: PlanDiscipline;
  /** the day's label, e.g. "Week 2 · Legs" (week prefix only for multi-week plans). */
  day: string;
  /** 0-based position among the plan's TRAINING days (rest days excluded). */
  dayIndex: number;
  totalDays: number;
  /** "Active rest" / "Competition" for a non-ordinary day, else null. */
  kindLabel: string | null;
  rows: PlanProgramTodayRow[];
  /** the day's session prefilled as logger blocks — loads filled from `maxes`
   *  (the athlete's 1RMs) when known, else left blank to fill in live. */
  blocks: SessionBlock[];
}

/** One PlanLift's %-ramp → a strength block, deriving kg from the athlete's 1RM
 *  for the ref lift when known (else a blank load). Each ramp step expands into
 *  its own working sets so the prefilled session mirrors the written ramp. */
function liftToBlock(lift: PlanLift, maxes?: Record<string, number>): SessionBlock {
  const oneRm = lift.ref ? maxes?.[lift.ref] : undefined;
  const sets = lift.steps.flatMap((s) => {
    const kg = stepKg(s, oneRm);
    return Array.from({ length: s.sets }, () => ({ load: kg != null ? String(kg) : "", reps: String(s.reps), rpe: "" }));
  });
  return { kind: "strength", name: lift.name, sets: sets.length ? sets : [{ load: "", reps: "", rpe: "" }] } as SessionBlock;
}

/** One PlanEntry → a block: a structured hypertrophy/accessory entry becomes a
 *  strength block (loads from `maxes` when known); a prose endurance/conditioning
 *  entry becomes a named conditioning block to log the workout against. */
function entryToBlock(entry: PlanEntry, maxes?: Record<string, number>): SessionBlock {
  if (entry.sets != null) {
    const kg = entry.weightRef ? maxes?.[entry.weightRef] : undefined;
    const reps = entry.reps === "AMRAP" ? "" : String(entry.reps ?? "");
    const rpe = entry.rpe != null ? String(entry.rpe) : "";
    return {
      kind: "strength",
      name: entry.label,
      sets: Array.from({ length: entry.sets }, () => ({ load: kg != null ? String(kg) : "", reps, rpe })),
    } as SessionBlock;
  }
  if (entry.scheme != null) {
    const { sets, reps } = parseSetsReps(entry.scheme);
    return {
      kind: "strength",
      name: entry.label,
      sets: Array.from({ length: sets }, () => ({ load: "", reps, rpe: entry.rpe != null ? String(entry.rpe) : "" })),
    } as SessionBlock;
  }
  // Prose workout (endurance / conditioning) — a named conditioning block.
  return { kind: "conditioning", name: entry.label } as SessionBlock;
}

/**
 * The enrolled discipline-shaped PROGRAM's session to do today. Resolves the
 * program by id, flattens its training days across every week (skipping pure rest
 * days), and picks the current one by how many sessions the athlete has logged
 * (cycling back at the end — the same "one logged session advances one day" model
 * as planToday). Returns null unless planId resolves to a real PlanProgram, so the
 * engine's own prescription stays the default for goals without one.
 *
 * `maxes` (the athlete's 1RMs keyed by ProgramInput.key) is optional: when present
 * the day's loads are derived (kg shown + prefilled); without it the prescription
 * shows % / scheme and the prefilled loads are blank to fill in live.
 */
export function planProgramToday(
  planId: string | null | undefined,
  sessionsLogged: number,
  maxes?: Record<string, number>,
): PlanProgramToday | null {
  const program = programFor(planId);
  if (!program || !planId) return null;
  const multiWeek = program.weeks.length > 1;

  // Flatten the program's TRAINING days, pairing each raw day (for prefill) with
  // its formatted view (for display) so the two can't drift.
  const flat: { week: number; raw: PlanDay; view: ProgramDayView }[] = [];
  for (const w of program.weeks) {
    const wv = planProgramView(program, { week: w.index, maxes });
    w.days.forEach((raw, i) => {
      const view = wv.days[i];
      if (!view || raw.kind === "rest") return;
      const hasContent = raw.sessions.some((s) => (s.lifts?.length ?? 0) + (s.entries?.length ?? 0) > 0);
      if (hasContent) flat.push({ week: w.index, raw, view });
    });
  }
  if (!flat.length) return null;

  const n = Number.isFinite(sessionsLogged) ? Math.max(0, Math.floor(sessionsLogged)) : 0;
  const dayIndex = n % flat.length;
  const { week, raw, view } = flat[dayIndex]!;

  const rows: PlanProgramTodayRow[] = [];
  const blocks: SessionBlock[] = [];
  view.sessions.forEach((sv, si) => {
    for (const l of sv.lifts) rows.push({ name: l.name, session: sv.label ?? null, detail: l.prescription, note: l.note });
    const rawSession = raw.sessions[si];
    if (rawSession) {
      for (const l of rawSession.lifts ?? []) blocks.push(liftToBlock(l, maxes));
      for (const e of rawSession.entries ?? []) blocks.push(entryToBlock(e, maxes));
    }
  });

  return {
    planId,
    planName: findGoalPlan(planId)?.name ?? program.id,
    discipline: program.discipline,
    day: `${multiWeek ? `Week ${week} · ` : ""}${raw.title}`,
    dayIndex,
    totalDays: flat.length,
    kindLabel: view.kindLabel,
    rows,
    blocks,
  };
}
