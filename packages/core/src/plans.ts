/**
 * @hybrid/core — plans data + pure logic.
 *
 * Ported verbatim from the React prototype (reference/HybridApp.jsx).
 * No React/JSX here — data and helpers only.
 */

// Brand color constants used by the goal tree (hex literals).
const VIOLET = "#c9a9f0";
const LIME = "#c4f035";
const BLUE = "#7fd4e8";
const AMBER = "#f0b45e";

// ============================================================
//  Types
// ============================================================

export interface GoalPlan {
  id: string;
  name: string;
  weeks: number;
  sessions: number;
  tag: string;
  desc: string;
  focus: string[];
  hot?: boolean;
}

export interface GoalNode {
  id: string;
  name: string;
  icon: string;
  color: string;
  blurb: string;
  plans: GoalPlan[];
}

export interface PlanSampleItem {
  name: string;
  sr: string;
  rest: string;
  rpe: string;
}

export interface PlanSample {
  day: string;
  items: PlanSampleItem[];
}

export interface PlanDetail {
  level: string;
  forWho: string;
  outcome: string;
  sessionLength: string;
  equipment: string;
  split: string[];
  sample: PlanSample;
  progression: string;
}

// ============================================================
//  GOAL TREE — choose a goal, then see the plans built for it.
// ============================================================

// NOTE: the demo placeholder plans have been removed. The goals below are kept;
// real plans will be uploaded per goal. Each goal's `plans` array is intentionally
// empty until then.
export const GOAL_TREE: GoalNode[] = [
  { id: "bb", name: "Bodybuilding", icon: "■", color: VIOLET, blurb: "Maximize muscle. Train splits, chase volume and progressive overload.",
    plans: [] },
  { id: "hyrox", name: "Hyrox", icon: "●", color: LIME, blurb: "Race the 8-station functional fitness event. Compromised running is everything.",
    plans: [] },
  { id: "tri", name: "Triathlon", icon: "◆", color: BLUE, blurb: "Swim-bike-run endurance. Strength work that supports, not sabotages.",
    plans: [] },
  { id: "hybrid", name: "Hybrid Athlete", icon: "▲", color: LIME, blurb: "Lift heavy and train your sport. Strength that carries over to running, combat, court, or crag.",
    plans: [] },
  { id: "power", name: "Powerlifting", icon: "▬", color: VIOLET, blurb: "One goal: a bigger squat, bench, and deadlift total.",
    plans: [] },
];

// flat list still used by the landing carousel (top plan per goal).
// Skips goals that have no plans yet.
export const PLANS: (GoalPlan & { color: string })[] = GOAL_TREE.flatMap((g) =>
  g.plans[0] ? [{ ...g.plans[0], color: g.color }] : [],
);

// ============================================================
//  PLAN DETAIL — every plan gets a full workout summary:
//  level, who it's for, outcome, duration/frequency, split,
//  a fully-spec'd sample session, progression, equipment.
// ============================================================

// Emptied with the demo plans. Real plan detail will be added alongside the
// uploaded plans. `planDetail()` below fills sane defaults for any missing id.
export const PLAN_DETAIL: Record<string, PlanDetail> = {};

// resolve a plan id to its full detail, filling any gaps with sane defaults
export function planDetail(id: string, _plan?: unknown): PlanDetail {
  const d = PLAN_DETAIL[id] || ({} as Partial<PlanDetail>);
  return {
    level: d.level || "All levels",
    forWho: d.forWho || "Suitable for most trainees at the stated level.",
    outcome: d.outcome || "Consistent progress toward your goal.",
    sessionLength: d.sessionLength || "60 min",
    equipment: d.equipment || "Basic gym",
    split: d.split || ["Train", "Rest", "Train", "Rest", "Train", "Rest", "Rest"],
    sample: d.sample || { day: "Sample day", items: [{ name: "—", sr: "—", rest: "—", rpe: "—" }] },
    progression: d.progression || "Progressive overload week to week, with a deload every 4th week.",
  };
}
