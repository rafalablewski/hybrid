/**
 * Guided onboarding → a personalized first plan.
 *
 * Maps a handful of intake answers (goal, experience, days/week, equipment) onto
 * the shared plan library (GOAL_TREE) and picks the plan whose weekly frequency
 * best fits the athlete — so a beginner who can train 3 days gets a 3-day plan,
 * not a 6-day split they'll quit. Pure mapping logic; both clients render the
 * same recommendation and then enroll its macrocycle. No I/O.
 */

import { GOAL_TREE, type GoalPlan } from "./plans";

export type OnboardingGoal = "lose-fat" | "build-muscle" | "get-stronger" | "endurance" | "hybrid";
export type Experience = "beginner" | "intermediate" | "advanced";
export type Equipment = "full" | "home" | "minimal";

export interface OnboardingAnswers {
  goal: OnboardingGoal;
  experience: Experience;
  daysPerWeek: number;
  equipment?: Equipment;
  sessionMin?: number;
}

export interface OnboardingPlan {
  /** GOAL_TREE node id (e.g. "power") */
  goalId: string;
  /** goal display name — what gets enrolled as the macrocycle goal */
  goalLabel: string;
  planId: string;
  planName: string;
  weeks: number;
  /** the plan's weekly session count */
  weeklyTarget: number;
  focus: string[];
  why: string;
}

const GOAL_TO_NODE: Record<OnboardingGoal, string> = {
  "lose-fat": "hyrox",
  "build-muscle": "bb",
  "get-stronger": "power",
  endurance: "tri",
  hybrid: "hybrid",
};

export const ONBOARDING_GOALS: { id: OnboardingGoal; label: string; blurb: string }[] = [
  { id: "lose-fat", label: "Lose fat", blurb: "Conditioning-led, strength to keep muscle" },
  { id: "build-muscle", label: "Build muscle", blurb: "Hypertrophy splits, progressive overload" },
  { id: "get-stronger", label: "Get stronger", blurb: "Squat / bench / deadlift focus" },
  { id: "endurance", label: "Endurance", blurb: "Engine first, strength that supports it" },
  { id: "hybrid", label: "Hybrid", blurb: "Lift heavy AND build your engine" },
];

const expRank: Record<Experience, number> = { beginner: 0, intermediate: 1, advanced: 2 };

/** Recommend a first plan from intake answers (pure). */
export function recommendPlan(a: OnboardingAnswers): OnboardingPlan {
  const nodeId = GOAL_TO_NODE[a.goal] ?? "hybrid";
  const node = GOAL_TREE.find((g) => g.id === nodeId) ?? GOAL_TREE.find((g) => g.id === "hybrid")!;
  const days = Math.max(1, Math.min(7, Math.round(a.daysPerWeek)));

  // Pick the plan whose weekly frequency is closest to what they can commit to;
  // break ties toward more sessions for advanced athletes, fewer for beginners.
  const pick = [...node.plans].sort((x, y) => {
    const dx = Math.abs(x.sessions - days);
    const dy = Math.abs(y.sessions - days);
    if (dx !== dy) return dx - dy;
    return expRank[a.experience] >= 2 ? y.sessions - x.sessions : x.sessions - y.sessions;
  })[0] as GoalPlan;

  const why =
    `For ${labelFor(a.goal).toLowerCase()}, training ${days}×/week as ${a.experience === "advanced" ? "an" : "a"} ${a.experience} — ` +
    `${pick.name} (${pick.sessions}×/wk) fits best: ${pick.desc}`;

  return {
    goalId: node.id,
    goalLabel: node.name,
    planId: pick.id,
    planName: pick.name,
    weeks: pick.weeks,
    weeklyTarget: pick.sessions,
    focus: pick.focus,
    why,
  };
}

function labelFor(g: OnboardingGoal): string {
  return ONBOARDING_GOALS.find((x) => x.id === g)?.label ?? g;
}
