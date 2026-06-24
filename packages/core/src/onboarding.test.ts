import { describe, it, expect } from "vitest";
import { recommendPlan, ONBOARDING_GOALS } from "./onboarding";
import { GOAL_TREE } from "./plans";

describe("onboarding → first plan", () => {
  it("offers exactly the plan-library goals as main-goal options", () => {
    expect(ONBOARDING_GOALS.map((g) => g.id)).toEqual(GOAL_TREE.map((g) => g.id));
  });

  // All saved plans have been retired — every goal is empty, so recommendPlan
  // returns null for all of them until real plans are uploaded.
  it("returns null for every goal (the library is empty)", () => {
    for (const g of ONBOARDING_GOALS) {
      expect(GOAL_TREE.find((n) => n.id === g.id)!.plans.length).toBe(0);
      const p = recommendPlan({ goal: g.id, experience: "intermediate", daysPerWeek: 4 });
      expect(p).toBeNull();
    }
  });
});
