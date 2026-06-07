import { describe, it, expect } from "vitest";
import { recommendPlan, ONBOARDING_GOALS } from "./onboarding";
import { GOAL_TREE } from "./plans";

describe("onboarding → first plan", () => {
  it("offers exactly the plan-library goals as main-goal options", () => {
    expect(ONBOARDING_GOALS.map((g) => g.id)).toEqual(GOAL_TREE.map((g) => g.id));
  });

  // The demo plans were removed; the library is empty until real plans are
  // uploaded. recommendPlan returns null while a goal has no plans.
  it("returns null for every goal while the plan library is empty", () => {
    for (const g of ONBOARDING_GOALS) {
      const p = recommendPlan({ goal: g.id, experience: "intermediate", daysPerWeek: 4 });
      expect(p).toBeNull();
    }
  });
});
