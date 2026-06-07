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

/** Broad family a goal belongs to — used to group goals in the UI. */
export type GoalCategory = "Strength" | "Physique" | "Endurance" | "Functional & Sport" | "Health";

/** Display order for goal categories. */
export const GOAL_CATEGORIES: GoalCategory[] = [
  "Strength",
  "Physique",
  "Endurance",
  "Functional & Sport",
  "Health",
];

export interface GoalNode {
  id: string;
  name: string;
  icon: string;
  color: string;
  blurb: string;
  category: GoalCategory;
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
  // ---- Strength ----
  { id: "power", name: "Powerlifting", icon: "▬", color: VIOLET, category: "Strength", blurb: "One goal: a bigger squat, bench, and deadlift total.",
    plans: [] },
  { id: "oly", name: "Olympic Weightlifting", icon: "◢", color: AMBER, category: "Strength", blurb: "Snatch and clean & jerk. Explosive power, mobility, and technical precision.",
    plans: [] },
  { id: "strongman", name: "Strongman", icon: "◤", color: VIOLET, category: "Strength", blurb: "Carry, press, and pull heavy odd objects. Raw, full-body, real-world strength.",
    plans: [] },
  // ---- Physique ----
  { id: "bb", name: "Bodybuilding", icon: "■", color: VIOLET, category: "Physique", blurb: "Maximize muscle. Train splits, chase volume and progressive overload.",
    plans: [] },
  { id: "fatloss", name: "Fat Loss", icon: "◐", color: AMBER, category: "Physique", blurb: "Drop fat and keep the muscle. Train hard, recover smart, recomp the right way.",
    plans: [] },
  // ---- Endurance ----
  { id: "tri", name: "Triathlon", icon: "◆", color: BLUE, category: "Endurance", blurb: "Swim-bike-run endurance. Strength work that supports, not sabotages.",
    plans: [] },
  { id: "run", name: "Running", icon: "▶", color: BLUE, category: "Endurance", blurb: "Get faster over 5k, 10k, half or full. Build the aerobic engine and durable legs.",
    plans: [] },
  { id: "cycling", name: "Cycling", icon: "◉", color: LIME, category: "Endurance", blurb: "More power on the bike — road, gravel, or indoor. Strength that drives the pedal stroke.",
    plans: [] },
  { id: "swim", name: "Swimming", icon: "◑", color: BLUE, category: "Endurance", blurb: "Faster in the water — dryland strength, mobility, and shoulder durability.",
    plans: [] },
  // ---- Functional & Sport ----
  { id: "hyrox", name: "Hyrox", icon: "●", color: LIME, category: "Functional & Sport", blurb: "Race the 8-station functional fitness event. Compromised running is everything.",
    plans: [] },
  { id: "crossfit", name: "CrossFit", icon: "✚", color: AMBER, category: "Functional & Sport", blurb: "Constantly varied, high-intensity functional fitness. Be ready for anything.",
    plans: [] },
  { id: "hybrid", name: "Hybrid Athlete", icon: "▲", color: LIME, category: "Functional & Sport", blurb: "Lift heavy and train your sport. Strength that carries over to running, combat, court, or crag.",
    plans: [] },
  { id: "calisthenics", name: "Calisthenics", icon: "◯", color: LIME, category: "Functional & Sport", blurb: "Master your bodyweight — pull-ups, dips, levers, and the big skills.",
    plans: [] },
  { id: "kettlebell", name: "Kettlebell", icon: "◔", color: AMBER, category: "Functional & Sport", blurb: "Swing, snatch, and get-up. One tool, full-body strength and conditioning.",
    plans: [] },
  { id: "tactical", name: "Tactical & Military", icon: "◣", color: VIOLET, category: "Functional & Sport", blurb: "Ruck, carry, and work capacity under load. Built to pass the test and do the job.",
    plans: [] },
  { id: "sport", name: "Sport Performance", icon: "★", color: VIOLET, category: "Functional & Sport", blurb: "Speed, power, and agility for field- and court-sport athletes.",
    plans: [] },
  // ---- Health ----
  { id: "fitness", name: "General Fitness", icon: "✦", color: BLUE, category: "Health", blurb: "Look, feel, and move better. Balanced strength, conditioning, and lasting health.",
    plans: [] },
  { id: "mobility", name: "Mobility & Longevity", icon: "◇", color: BLUE, category: "Health", blurb: "Move freely and stay durable for decades. Mobility, stability, and prehab.",
    plans: [] },
  { id: "prenatal", name: "Pre & Postnatal", icon: "◍", color: LIME, category: "Health", blurb: "Train safely and strong through pregnancy and the return after.",
    plans: [] },
];

// flat list still used by the landing carousel (top plan per goal).
// Skips goals that have no plans yet.
export const PLANS: (GoalPlan & { color: string })[] = GOAL_TREE.flatMap((g) =>
  g.plans[0] ? [{ ...g.plans[0], color: g.color }] : [],
);

export interface GoalGroup {
  category: GoalCategory;
  goals: GoalNode[];
}

/** GOAL_TREE grouped by category, in display order (empty groups dropped). */
export const GOAL_GROUPS: GoalGroup[] = GOAL_CATEGORIES.map((category) => ({
  category,
  goals: GOAL_TREE.filter((g) => g.category === category),
})).filter((group) => group.goals.length > 0);

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
