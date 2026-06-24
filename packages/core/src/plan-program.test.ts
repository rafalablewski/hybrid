import { describe, it, expect } from "vitest";
import {
  parsePercentSteps,
  liftNL,
  dayNL,
  sessionNL,
  stepKg,
  formatStep,
  formatLift,
  planProgramView,
  type PlanLift,
} from "./plan-program";
import { SOVIET_OWL_8WK, programFor, PLAN_PROGRAMS } from "./plan-programs";

describe("parsePercentSteps", () => {
  it("parses ramped (pct/reps)sets terms", () => {
    expect(parsePercentSteps("(60%/4)3, (70%/4)2")).toEqual([
      { pct: 60, reps: 4, sets: 3 },
      { pct: 70, reps: 4, sets: 2 },
    ]);
  });

  it("defaults a bare term (no parens) to a single set", () => {
    expect(parsePercentSteps("60%/5")).toEqual([{ pct: 60, reps: 5, sets: 1 }]);
  });

  it("captures a complex (the +1 jerk)", () => {
    expect(parsePercentSteps("(60%/4+1)4")).toEqual([{ pct: 60, reps: 4, sets: 4, plus: 1 }]);
    expect(parsePercentSteps("80%/3+1")).toEqual([{ pct: 80, reps: 3, sets: 1, plus: 1 }]);
  });

  it("treats X as bodyweight (no percentage)", () => {
    expect(parsePercentSteps("(X/8)4")).toEqual([{ pct: null, reps: 8, sets: 4 }]);
  });

  it("allows supramaximal percentages (>100)", () => {
    expect(parsePercentSteps("(110%/2)2")).toEqual([{ pct: 110, reps: 2, sets: 2 }]);
  });

  it("skips unparseable junk without throwing", () => {
    expect(parsePercentSteps("")).toEqual([]);
    expect(parsePercentSteps("nonsense, (70%/3)2")).toEqual([{ pct: 70, reps: 3, sets: 2 }]);
  });
});

describe("NL (number of lifts) — derived volume", () => {
  it("counts reps × sets, and the complex add-on", () => {
    const lift: PlanLift = { name: "C&J", steps: parsePercentSteps("(60%/4+1)4, (70%/3+1)4") };
    // (4+1)·4 + (3+1)·4 = 20 + 16
    expect(liftNL(lift)).toBe(36);
  });

  // The source prints running NL totals. Week 1 Day 1 ends at 160 lifts
  // (AM 71: press 20 + snatch 21 + front squat 30; PM 89: C&J 36 + clean ext 21
  // + good morning 32) — a faithfulness check on the encode + parser + counter.
  it("reproduces the source's Week 1 Day 1 total of 160", () => {
    const day1 = SOVIET_OWL_8WK.weeks[0]!.days[0]!;
    expect(sessionNL(day1.sessions[0]!)).toBe(71); // AM
    expect(sessionNL(day1.sessions[1]!)).toBe(89); // PM
    expect(dayNL(day1)).toBe(160);
  });
});

describe("loading — % kept, kg derived", () => {
  it("derives kg from the ref-lift 1RM, rounded", () => {
    expect(stepKg({ pct: 70, reps: 3, sets: 1 }, 100)).toBe(70);
    expect(stepKg({ pct: 75, reps: 2, sets: 1 }, 137)).toBe(103); // 102.75 → 103
  });

  it("returns null for bodyweight or an unknown max", () => {
    expect(stepKg({ pct: null, reps: 8, sets: 1 }, 100)).toBeNull();
    expect(stepKg({ pct: 70, reps: 3, sets: 1 }, undefined)).toBeNull();
  });

  it("formats %-first, appending kg only when a max is known", () => {
    expect(formatStep({ pct: 70, reps: 3, sets: 3 })).toBe("70%×3×3");
    expect(formatStep({ pct: 70, reps: 3, sets: 3 }, 100)).toBe("70%×3×3 · 70kg");
    expect(formatStep({ pct: 60, reps: 4, sets: 4, plus: 1 })).toBe("60%×4+1×4");
    expect(formatStep({ pct: null, reps: 8, sets: 4 })).toBe("BW×8×4");
  });

  it("formats a whole ramped lift, using the ref max when supplied", () => {
    const lift: PlanLift = { name: "Snatch", ref: "snatch", steps: parsePercentSteps("(60%/3)2, (70%/3)3") };
    expect(formatLift(lift)).toBe("60%×3×2 · 70%×3×3");
    expect(formatLift(lift, { snatch: 100 })).toBe("60%×3×2 · 60kg · 70%×3×3 · 70kg");
  });
});

describe("the Soviet 8-week program", () => {
  it("is registered and resolvable by its plan id", () => {
    expect(programFor("oly-soviet-8wk")).toBe(SOVIET_OWL_8WK);
    expect(programFor("not-a-plan")).toBeNull();
    expect(programFor(null)).toBeNull();
    expect(Object.keys(PLAN_PROGRAMS)).toContain("oly-soviet-8wk");
  });

  it("has 8 weeks, is %-based, and peaks into a competition", () => {
    expect(SOVIET_OWL_8WK.discipline).toBe("strength-percent");
    expect(SOVIET_OWL_8WK.anchor).toBe("competition");
    expect(SOVIET_OWL_8WK.weeks).toHaveLength(8);
    const lastDay = SOVIET_OWL_8WK.weeks[7]!.days.at(-1)!;
    expect(lastDay.kind).toBe("competition");
  });

  it("models AM/PM double days and rest days", () => {
    const w1d1 = SOVIET_OWL_8WK.weeks[0]!.days[0]!;
    expect(w1d1.sessions.map((s) => s.label)).toEqual(["AM", "PM"]);
    expect(SOVIET_OWL_8WK.weeks[0]!.days[2]!.kind).toBe("active-rest");
  });

  it("references squat % off the squat max (so >100% is valid)", () => {
    // Week 4 PM day 4: Back Squat ramps to 110%.
    const allSteps = SOVIET_OWL_8WK.weeks
      .flatMap((w) => w.days)
      .flatMap((d) => d.sessions)
      .flatMap((s) => s.lifts)
      .filter((l) => l.name === "Back Squat")
      .flatMap((l) => l.steps);
    expect(allSteps.some((s) => (s.pct ?? 0) > 100)).toBe(true);
  });
});

describe("planProgramView", () => {
  it("builds a render-ready week with NL totals and %-first prescriptions", () => {
    const v = planProgramView(SOVIET_OWL_8WK, { week: 1 });
    expect(v.weeks).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(v.week).toBe(1);
    expect(v.weekNL).toBeGreaterThan(0);
    expect(v.anchored).toBe(true);

    const day1 = v.days[0]!;
    expect(day1.nl).toBe(160);
    expect(day1.sessions[0]!.label).toBe("AM");
    expect(day1.sessions[0]!.lifts[0]!.prescription).toBe("60%×4×3 · 70%×4×2");

    const c0 = v.days.find((d) => d.kindLabel === "Active rest");
    expect(c0).toBeTruthy();
  });

  it("injects kg when maxes are provided", () => {
    const v = planProgramView(SOVIET_OWL_8WK, { week: 1, maxes: { snatch: 100 } });
    // Day 1 AM lift 2 is the Snatch — % now carry kg.
    const snatch = v.days[0]!.sessions[0]!.lifts[1]!;
    expect(snatch.name).toBe("Snatch");
    expect(snatch.prescription).toContain("kg");
  });

  it("clamps an out-of-range week to a real one", () => {
    expect(planProgramView(SOVIET_OWL_8WK, { week: 99 }).week).toBe(1);
  });
});
