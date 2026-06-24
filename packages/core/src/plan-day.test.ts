import { describe, it, expect } from "vitest";
import { planToday, planDayToBlocks, findGoalPlan, srSingleReps } from "./plan-day";

describe("planToday", () => {
  it("returns null for no plan / an unknown plan id", () => {
    expect(planToday(null, 0)).toBeNull();
    expect(planToday(undefined, 3)).toBeNull();
    expect(planToday("does-not-exist", 0)).toBeNull();
  });

  // All saved plans have been retired — no plan id resolves to plan detail, so
  // planToday always falls back to null (the engine's prescription stays default).
  it("returns null even for a once-real plan id (library empty)", () => {
    expect(planToday("bb-fb4", 0)).toBeNull();
    expect(planToday("pl-4day", 2)).toBeNull();
  });

  it("finds no plan across the empty goal library", () => {
    expect(findGoalPlan("bb-fb4")).toBeNull();
    expect(findGoalPlan("nope")).toBeNull();
  });
});

describe("planDayToBlocks", () => {
  it("converts plan items into strength blocks with blank load + parsed sets", () => {
    const items = [{ name: "Back Squat", sr: "5 × 3–5", rest: "3:00", rpe: "8" }];
    const blocks = planDayToBlocks(items);
    expect(blocks.length).toBe(items.length);
    const first = blocks[0]!;
    expect(first.kind).toBe("strength");
    if (first.kind === "strength") {
      // "Back Squat 5 × 3–5" → 5 sets, blank load, reps collapsed to the top
      expect(first.name).toBe("Back Squat");
      expect(first.sets.length).toBe(5);
      expect(first.sets[0]!.load).toBe("");
      expect(first.sets[0]!.reps).toBe("5");
      expect(first.sets[0]!.rpe).toBe("8");
    }
  });

  it("drops a placeholder '—' RPE", () => {
    const blocks = planDayToBlocks([{ name: "Plank", sr: "3 × 45–60 sec", rest: "1:00", rpe: "—" }]);
    const b = blocks[0]!;
    if (b.kind === "strength") {
      expect(b.sets.length).toBe(3);
      expect(b.sets[0]!.reps).toBe("60 sec");
      expect(b.sets[0]!.rpe).toBe("");
    }
  });
});

describe("srSingleReps", () => {
  it("collapses a rep range to the top number", () => {
    expect(srSingleReps("5 × 3–5")).toBe("5 × 5");
    expect(srSingleReps("4 × 8–12")).toBe("4 × 12");
    expect(srSingleReps("3 × 10–15")).toBe("3 × 15");
  });

  it("collapses a time range but keeps the unit", () => {
    expect(srSingleReps("3 × 45–60 sec")).toBe("3 × 60 sec");
  });

  it("handles plain hyphens and em dashes too", () => {
    expect(srSingleReps("5 x 3-5")).toBe("5 x 5");
    expect(srSingleReps("5 × 3—5")).toBe("5 × 5");
  });

  it("leaves a single number untouched", () => {
    expect(srSingleReps("5 × 5")).toBe("5 × 5");
    expect(srSingleReps("3 × 8")).toBe("3 × 8");
    expect(srSingleReps("AMRAP")).toBe("AMRAP");
  });

  it("is defensive against null/undefined/empty input", () => {
    expect(srSingleReps(null)).toBe("");
    expect(srSingleReps(undefined)).toBe("");
    expect(srSingleReps("")).toBe("");
  });
});
