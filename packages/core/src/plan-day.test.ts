import { describe, it, expect } from "vitest";
import { planToday, planDayToBlocks, findGoalPlan } from "./plan-day";

describe("planToday", () => {
  it("returns null for no plan / an unknown plan id", () => {
    expect(planToday(null, 0)).toBeNull();
    expect(planToday(undefined, 3)).toBeNull();
    expect(planToday("does-not-exist", 0)).toBeNull();
  });

  it("returns the real Bodybuilding plan's day, cycling by sessions logged", () => {
    const day0 = planToday("bb-fb4", 0);
    expect(day0).not.toBeNull();
    expect(day0!.planName).toBe("4-Day Full Body");
    expect(day0!.dayIndex).toBe(0);
    expect(day0!.totalDays).toBe(4);
    expect(day0!.items.length).toBeGreaterThan(0);

    // each logged session advances one day; it cycles at the end
    expect(planToday("bb-fb4", 1)!.dayIndex).toBe(1);
    expect(planToday("bb-fb4", 3)!.dayIndex).toBe(3);
    expect(planToday("bb-fb4", 4)!.dayIndex).toBe(0);
    expect(planToday("bb-fb4", 9)!.dayIndex).toBe(1);
  });

  it("finds a plan across the goal library", () => {
    expect(findGoalPlan("bb-fb4")?.name).toBe("4-Day Full Body");
    expect(findGoalPlan("nope")).toBeNull();
  });
});

describe("planDayToBlocks", () => {
  it("converts plan items into strength blocks with blank load + parsed sets", () => {
    const today = planToday("bb-fb4", 0)!;
    const blocks = planDayToBlocks(today.items);
    expect(blocks.length).toBe(today.items.length);
    const first = blocks[0]!;
    expect(first.kind).toBe("strength");
    if (first.kind === "strength") {
      // "Back Squat 5 × 3–5" → 5 sets, blank load, reps range carried
      expect(first.name).toBe("Back Squat");
      expect(first.sets.length).toBe(5);
      expect(first.sets[0]!.load).toBe("");
      expect(first.sets[0]!.reps).toBe("3–5");
      expect(first.sets[0]!.rpe).toBe("8");
    }
  });

  it("drops a placeholder '—' RPE", () => {
    const blocks = planDayToBlocks([{ name: "Plank", sr: "3 × 45–60 sec", rest: "1:00", rpe: "—" }]);
    const b = blocks[0]!;
    if (b.kind === "strength") {
      expect(b.sets.length).toBe(3);
      expect(b.sets[0]!.reps).toBe("45–60 sec");
      expect(b.sets[0]!.rpe).toBe("");
    }
  });
});
