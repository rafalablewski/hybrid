import { describe, it, expect } from "vitest";
import { recommendPlan, ONBOARDING_GOALS } from "./onboarding";
import { GOAL_TREE } from "./plans";

describe("onboarding → first plan", () => {
  it("offers exactly the plan-library goals as main-goal options", () => {
    expect(ONBOARDING_GOALS.map((g) => g.id)).toEqual(GOAL_TREE.map((g) => g.id));
  });

  // Plans are being rebuilt goal-shaped: Olympic Weightlifting now recommends
  // the Soviet plan; every other goal is still empty and returns null.
  it("recommends the Soviet plan for Olympic Weightlifting", () => {
    const p = recommendPlan({ goal: "oly", experience: "intermediate", daysPerWeek: 6 });
    expect(p).not.toBeNull();
    expect(p!.goalId).toBe("oly");
    expect(p!.planId).toBe("oly-soviet-8wk");
  });

  it("returns null for goals that have no plans yet", () => {
    for (const g of ONBOARDING_GOALS) {
      if (GOAL_TREE.find((n) => n.id === g.id)!.plans.length > 0) continue;
      const p = recommendPlan({ goal: g.id, experience: "intermediate", daysPerWeek: 4 });
      expect(p).toBeNull();
    }
  });
});
