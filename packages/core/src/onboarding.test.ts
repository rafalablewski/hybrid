import { describe, it, expect } from "vitest";
import { recommendPlan, ONBOARDING_GOALS } from "./onboarding";
import { GOAL_TREE } from "./plans";

describe("onboarding → first plan", () => {
  it("offers exactly the plan-library goals as main-goal options", () => {
    expect(ONBOARDING_GOALS.map((g) => g.id)).toEqual(GOAL_TREE.map((g) => g.id));
  });

  // Bodybuilding now carries real plans; every other goal is still empty and
  // recommendPlan returns null until plans are uploaded for it.
  it("returns null for goals that have no plans yet", () => {
    for (const g of ONBOARDING_GOALS) {
      if (GOAL_TREE.find((n) => n.id === g.id)!.plans.length > 0) continue;
      const p = recommendPlan({ goal: g.id, experience: "intermediate", daysPerWeek: 4 });
      expect(p).toBeNull();
    }
  });

  it("recommends the bodybuilding plan for a bodybuilding goal", () => {
    const p = recommendPlan({ goal: "bb", experience: "intermediate", daysPerWeek: 4 });
    expect(p).not.toBeNull();
    expect(p!.goalId).toBe("bb");
    expect(p!.planId).toBe("bb-fb4");
    expect(p!.weeklyTarget).toBe(4);
  });
});
