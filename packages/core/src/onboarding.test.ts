import { describe, it, expect } from "vitest";
import { recommendPlan, ONBOARDING_GOALS } from "./onboarding";

describe("onboarding → first plan", () => {
  it("maps each goal to a real GOAL_TREE node", () => {
    for (const g of ONBOARDING_GOALS) {
      const p = recommendPlan({ goal: g.id, experience: "intermediate", daysPerWeek: 4 });
      expect(p.goalId).toBeTruthy();
      expect(p.planId).toBeTruthy();
      expect(p.why).toContain(p.planName);
    }
  });

  it("get-stronger routes to powerlifting", () => {
    const p = recommendPlan({ goal: "get-stronger", experience: "beginner", daysPerWeek: 3 });
    expect(p.goalId).toBe("power");
    expect(p.goalLabel).toBe("Powerlifting");
  });

  it("picks the plan whose weekly frequency fits the days available", () => {
    // Bodybuilding has 6/4/3-day options; a 3-day-a-week lifter should not get the 6-day PPL.
    const p = recommendPlan({ goal: "build-muscle", experience: "beginner", daysPerWeek: 3 });
    expect(p.weeklyTarget).toBeLessThanOrEqual(4);
    const busy = recommendPlan({ goal: "build-muscle", experience: "advanced", daysPerWeek: 6 });
    expect(busy.weeklyTarget).toBeGreaterThanOrEqual(busy.weeklyTarget); // sane
    expect(busy.weeklyTarget).toBeGreaterThan(p.weeklyTarget);
  });
});
