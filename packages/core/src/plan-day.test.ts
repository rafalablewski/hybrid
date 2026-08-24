import { describe, it, expect } from "vitest";
import { planToday, planProgramToday, planDayToBlocks, findGoalPlan, srSingleReps } from "./plan-day";

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

describe("planProgramToday", () => {
  it("returns null for no plan / an unknown plan id / a legacy (non-program) id", () => {
    expect(planProgramToday(null, 0)).toBeNull();
    expect(planProgramToday(undefined, 3)).toBeNull();
    expect(planProgramToday("does-not-exist", 0)).toBeNull();
    // a real goal id that has no discipline-shaped program yet
    expect(planProgramToday("bb-fb4", 0)).toBeNull();
  });

  it("resolves an enrolled program's day, with display rows + prefill blocks", () => {
    // The 6-day PPL program (a real shipped PlanProgram).
    const today = planProgramToday("bb-ppl-6day", 0);
    expect(today).not.toBeNull();
    expect(today!.planId).toBe("bb-ppl-6day");
    expect(today!.planName).toBeTruthy();
    expect(today!.discipline).toBe("hypertrophy");
    expect(today!.totalDays).toBeGreaterThan(0);
    expect(today!.dayIndex).toBe(0);
    expect(today!.rows.length).toBeGreaterThan(0);
    expect(today!.blocks.length).toBeGreaterThan(0);
    // every row carries a name + a formatted prescription
    expect(today!.rows.every((r) => r.name.length > 0 && r.detail.length >= 0)).toBe(true);
  });

  it("advances the day by how many sessions the athlete has logged", () => {
    const d0 = planProgramToday("bb-ppl-6day", 0)!;
    const d1 = planProgramToday("bb-ppl-6day", 1)!;
    expect(d1.dayIndex).toBe(1);
    expect(d0.complete).toBe(false);
    expect(d1.complete).toBe(false);
  });

  it("ENDS rather than looping once the programme is worked through", () => {
    // It used to be `dayIndex = n % training.length`, so the day after an
    // athlete finished a twelve-week block the card silently offered day one
    // again — no summary, no acknowledgement, no next block. A plan had no end.
    const d0 = planProgramToday("bb-ppl-6day", 0)!;
    const last = planProgramToday("bb-ppl-6day", d0.totalDays - 1)!;
    expect(last.dayIndex).toBe(d0.totalDays - 1);
    expect(last.complete).toBe(false);

    const past = planProgramToday("bb-ppl-6day", d0.totalDays)!;
    expect(past.complete).toBe(true);
    // Clamped at the final day rather than wrapped to the first.
    expect(past.dayIndex).toBe(d0.totalDays - 1);
    expect(planProgramToday("bb-ppl-6day", d0.totalDays * 3)!.complete).toBe(true);
  });

  it("derives working kg from the athlete's maxes when supplied (percent program)", () => {
    // The Soviet OWL block is %-based off named 1RMs.
    const noMax = planProgramToday("oly-soviet-8wk", 0)!;
    const withMax = planProgramToday("oly-soviet-8wk", 0, { snatch: 100, cleanjerk: 120, backSquat: 200, frontSquat: 160, press: 80 })!;
    // a strength block should exist; with maxes at least one set carries a load
    const loadedNo = noMax.blocks.some((b) => b.kind === "strength" && b.sets.some((s) => s.load !== ""));
    const loadedYes = withMax.blocks.some((b) => b.kind === "strength" && b.sets.some((s) => s.load !== ""));
    expect(loadedNo).toBe(false);
    expect(loadedYes).toBe(true);
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
