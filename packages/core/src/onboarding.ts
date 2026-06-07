/**
 * Guided onboarding → a personalized first plan.
 *
 * Maps a handful of intake answers (goal, experience, days/week, equipment) onto
 * the shared plan library (GOAL_TREE) and picks the plan whose weekly frequency
 * best fits the athlete — so a beginner who can train 3 days gets a 3-day plan,
 * not a 6-day split they'll quit. Pure mapping logic; both clients render the
 * same recommendation and then enroll its macrocycle. No I/O.
 */

import { GOAL_TREE, GOAL_GROUPS, type GoalPlan, type GoalCategory } from "./plans";

/** A main goal id — always one of the plan library's goal (GOAL_TREE) ids. */
export type OnboardingGoal = string;
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

export interface OnboardingGoalOption {
  id: OnboardingGoal;
  label: string;
  blurb: string;
  category: GoalCategory;
}

// The onboarding main goal is chosen straight from the plan library's goals,
// so the two can never drift apart — add a goal to GOAL_TREE and it shows up here.
export const ONBOARDING_GOALS: OnboardingGoalOption[] =
  GOAL_TREE.map((g) => ({ id: g.id, label: g.name, blurb: g.blurb, category: g.category }));

export interface OnboardingGoalGroup {
  category: GoalCategory;
  goals: OnboardingGoalOption[];
}

/** The same goals, grouped by category in display order (empty groups dropped). */
export const ONBOARDING_GOAL_GROUPS: OnboardingGoalGroup[] = GOAL_GROUPS.map((group) => ({
  category: group.category,
  goals: group.goals.map((g) => ({ id: g.id, label: g.name, blurb: g.blurb, category: g.category })),
}));

const expRank: Record<Experience, number> = { beginner: 0, intermediate: 1, advanced: 2 };

/**
 * Recommend a first plan from intake answers (pure).
 * Returns null when the matched goal has no plans yet (the library is empty
 * until real plans are uploaded).
 */
export function recommendPlan(a: OnboardingAnswers): OnboardingPlan | null {
  const node = GOAL_TREE.find((g) => g.id === a.goal) ?? GOAL_TREE.find((g) => g.id === "hybrid")!;
  const days = Math.max(1, Math.min(7, Math.round(a.daysPerWeek)));

  // Pick the plan whose weekly frequency is closest to what they can commit to;
  // break ties toward more sessions for advanced athletes, fewer for beginners.
  const pick = [...node.plans].sort((x, y) => {
    const dx = Math.abs(x.sessions - days);
    const dy = Math.abs(y.sessions - days);
    if (dx !== dy) return dx - dy;
    return expRank[a.experience] >= 2 ? y.sessions - x.sessions : x.sessions - y.sessions;
  })[0] as GoalPlan | undefined;

  if (!pick) return null;

  const why =
    `For ${node.name.toLowerCase()}, training ${days}×/week as ${a.experience === "advanced" ? "an" : "a"} ${a.experience} — ` +
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
