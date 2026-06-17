import { GOAL_TREE, PLAN_DETAIL, type GoalPlan, type PlanSampleItem } from "./plans";
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

/** Parse a plan item's "sets × reps" string (e.g. "5 × 3–5", "3 × 45–60 sec")
 *  into a set count + a reps label. Falls back to 3 sets when unparseable. */
function parseSetsReps(sr: string): { sets: number; reps: string } {
  const parts = sr.split("×");
  const left = (parts[0] ?? "").trim();
  const sets = Math.max(1, Math.min(10, parseInt(left, 10) || 3));
  const reps = parts.slice(1).join("×").trim() || left;
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
