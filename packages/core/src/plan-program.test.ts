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
import { SOVIET_OWL_8WK, RUN_5K_BEGINNER_9WK, BB_PPL_6DAY, programFor, PLAN_PROGRAMS } from "./plan-programs";

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
      .flatMap((s) => s.lifts ?? [])
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
    expect(v.weekVolume).toBe(`${v.weekNL} lifts`);
    expect(v.peakNote).toBe("Peaks to competition");

    const day1 = v.days[0]!;
    expect(day1.nl).toBe(160);
    expect(day1.volume).toBe("160 lifts");
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

describe("endurance (running) program — same model, prose workouts", () => {
  it("is a registered 9-week endurance plan peaking to a race", () => {
    expect(programFor("run-5k-beginner-9wk")).toBe(RUN_5K_BEGINNER_9WK);
    expect(RUN_5K_BEGINNER_9WK.discipline).toBe("endurance");
    expect(RUN_5K_BEGINNER_9WK.weeks).toHaveLength(9);
    expect(RUN_5K_BEGINNER_9WK.peakLabel).toBe("Race day");
    const lastDay = RUN_5K_BEGINNER_9WK.weeks[8]!.days.at(-1)!;
    expect(lastDay.kind).toBe("competition");
  });

  it("renders weekday cards with prose prescriptions and NO lift counter", () => {
    const v = planProgramView(RUN_5K_BEGINNER_9WK, { week: 1 });
    expect(v.weeks).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(v.peakNote).toBe("Peaks to race day");
    // endurance has no NL-style volume label — the counter chip is simply absent.
    expect(v.weekVolume).toBeNull();
    expect(v.days.map((d) => d.title)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(v.days.every((d) => d.volume === null)).toBe(true);

    // Tuesday week 1 = hills, written as prose, with its recovery note.
    const tue = v.days[1]!;
    expect(tue.sessions[0]!.lifts[0]).toMatchObject({
      name: "Hills",
      prescription: "5 × 1' hills",
      note: "Jog down for recovery",
    });
    // Sunday is a rest day.
    expect(v.days[6]!.kindLabel).toBe("Rest");
  });

  it("surfaces goal-pace text inputs instead of numeric maxes", () => {
    const v = planProgramView(RUN_5K_BEGINNER_9WK);
    expect(v.inputs.every((i) => i.kind === "text")).toBe(true);
    expect(v.inputs.map((i) => i.key)).toContain("gp");
    expect(v.inputsTitle.toLowerCase()).toContain("pace");
  });
});

describe("hypertrophy (bodybuilding) program — same model, sets × reps", () => {
  it("is a registered single-week 6-day split (no peak)", () => {
    expect(programFor("bb-ppl-6day")).toBe(BB_PPL_6DAY);
    expect(BB_PPL_6DAY.discipline).toBe("hypertrophy");
    expect(BB_PPL_6DAY.weeks).toHaveLength(1);
    expect(BB_PPL_6DAY.anchor).toBeUndefined();
  });

  it("renders exercise rows and counts exercises (not lifts) as volume", () => {
    const v = planProgramView(BB_PPL_6DAY, { week: 1 });
    expect(v.weeks).toEqual([1]); // one repeating week → renderers hide the selector
    expect(v.peakNote).toBeNull();

    // Monday = Push (Bench), first row is the main lift with its sets×reps.
    const mon = v.days[0]!;
    expect(mon.title).toBe("Mon · Push (Bench)");
    expect(mon.volume).toBe("5 exercises");
    const bench = mon.sessions[0]!.lifts[0]!;
    expect(bench).toMatchObject({ name: "Bench Press", prescription: "4–5 × 6–12 reps", note: "Main lift — progressive overload" });

    // Sunday is a rest day with no volume chip.
    const sun = v.days[6]!;
    expect(sun.kindLabel).toBe("Rest");
    expect(sun.volume).toBeNull();
  });
});
