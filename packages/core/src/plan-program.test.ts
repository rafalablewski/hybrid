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
  loadColor,
  rpeColor,
  workoutColor,
  isGymLift,
  isProseLift,
  liftKind,
  dayContentSummary,
  type PlanLift,
  type PlanProgram,
} from "./plan-program";
import { SOVIET_OWL_8WK, RUN_5K_BEGINNER_9WK, BB_PPL_6DAY, FATLOSS_KB_SATURDAY, programFor, PLAN_PROGRAMS } from "./plan-programs";

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

  it("carries the week-1 accessory block as RPE-kind gym entries (not % lifts)", () => {
    const pm = planProgramView(SOVIET_OWL_8WK, { week: 1 }).days[0]!.sessions[1]!; // Day 1 PM
    const acc = pm.lifts.filter((l) => liftKind(l) === "rpe");
    expect(acc.map((l) => l.name)).toEqual(["Clean Pull", "Snatch Balance", "Push Press", "Front Squat", "Chinese Plank"]);
    expect(acc[0]).toMatchObject({ setsReps: "5×3", rpe: 8, prescription: "5×3 · @8", note: "pulling power · @ 90–110% of clean" });
    // they don't count toward NL, so the day total is unchanged
    expect(planProgramView(SOVIET_OWL_8WK, { week: 1 }).days[0]!.nl).toBe(160);
    // and they vanish in later weeks
    expect(planProgramView(SOVIET_OWL_8WK, { week: 2 }).days[0]!.sessions.every((s) => s.lifts.every((l) => liftKind(l) !== "rpe"))).toBe(true);
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

  it("exposes coloured per-step views for strength lifts (load split from tail)", () => {
    const v = planProgramView(SOVIET_OWL_8WK, { week: 1 });
    const press = v.days[0]!.sessions[0]!.lifts[0]!; // 60%×4×3 · 70%×4×2
    expect(press.steps).toHaveLength(2);
    expect(press.steps![0]).toMatchObject({ load: "60%", color: "blue", detail: "×4×3", kg: null });
    expect(press.steps![1]).toMatchObject({ load: "70%", color: "lime", detail: "×4×2" });
  });

  it("carries the derived kg into each step when a max is given", () => {
    const v = planProgramView(SOVIET_OWL_8WK, { week: 1, maxes: { snatch: 100 } });
    const snatch = v.days[0]!.sessions[0]!.lifts[1]!;
    expect(snatch.steps!.some((s) => s.kg?.endsWith("kg"))).toBe(true);
  });
});

describe("mixed endurance day — strength accessory on a run day", () => {
  // A runner gets Bulgarian split squats (5×12 @8) alongside the run. The view
  // must keep BOTH items (no drop) and tag the plan endurance so the renderer
  // chooses the week-card layout from the discipline, not from "all prose".
  const MIXED: PlanProgram = {
    id: "test-mixed",
    discipline: "endurance",
    inputs: [],
    inputsTitle: "Goal paces",
    progression: "—",
    weeks: [
      {
        index: 1,
        days: [
          {
            index: 1,
            kind: "train",
            title: "Tue",
            sessions: [
              {
                entries: [
                  { label: "Tempo", detail: "3 × 1-mile tempo" },
                  { label: "Bulgarian Split Squat", detail: "", sets: 5, reps: 12, rpe: 8 },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  it("exposes the discipline and keeps every item on the day", () => {
    const v = planProgramView(MIXED, { week: 1 });
    expect(v.discipline).toBe("endurance");
    const lifts = v.days[0]!.sessions[0]!.lifts;
    expect(lifts.map((l) => l.name)).toEqual(["Tempo", "Bulgarian Split Squat"]);
    // the run is prose (no sets/rpe); the accessory carries structured fields
    expect(lifts[0]!.rpe).toBeUndefined();
    expect(lifts[1]!).toMatchObject({ setsReps: "5×12", rpe: 8 });
  });

  it("classifies content and summarises a hybrid day", () => {
    const day = planProgramView(MIXED, { week: 1 }).days[0]!;
    const [run, accessory] = day.sessions[0]!.lifts;
    expect(isProseLift(run!)).toBe(true);
    expect(isGymLift(accessory!)).toBe(true);
    // endurance day has no NL volume → a run/lift breakdown instead
    expect(dayContentSummary(day)).toBe("1 run · 1 lift");
  });

  it("liftKind separates %-barbell, RPE-accessory and prose", () => {
    const owl = planProgramView(SOVIET_OWL_8WK, { week: 1 }).days[0]!.sessions[0]!.lifts[0]!; // % steps
    const ppl = planProgramView(BB_PPL_6DAY, { week: 1 }).days[0]!.sessions[0]!.lifts[0]!; // rpe
    const run = planProgramView(MIXED, { week: 1 }).days[0]!.sessions[0]!.lifts[0]!; // prose
    expect(liftKind(owl)).toBe("percent");
    expect(liftKind(ppl)).toBe("rpe");
    expect(liftKind(run)).toBe("run");
  });

  it("falls back to the discipline volume when present", () => {
    const owlDay = planProgramView(SOVIET_OWL_8WK, { week: 1 }).days[0]!;
    expect(dayContentSummary(owlDay)).toBe("160 lifts");
  });
});

describe("conditioning (kettlebell circuit) program — same model, blocks as cards", () => {
  it("is a registered single-week conditioning plan with no peak and no volume counter", () => {
    expect(programFor("fatloss-kb-saturday")).toBe(FATLOSS_KB_SATURDAY);
    expect(Object.keys(PLAN_PROGRAMS)).toContain("fatloss-kb-saturday");
    expect(FATLOSS_KB_SATURDAY.discipline).toBe("conditioning");
    expect(FATLOSS_KB_SATURDAY.anchor).toBeUndefined();
    expect(FATLOSS_KB_SATURDAY.weeks).toHaveLength(1);

    const v = planProgramView(FATLOSS_KB_SATURDAY, { week: 1 });
    expect(v.weeks).toEqual([1]); // one repeating session → renderers hide the week selector
    expect(v.peakNote).toBeNull();
    expect(v.weekVolume).toBeNull(); // conditioning has no NL/exercise counter
    expect(v.days.every((d) => d.volume === null)).toBe(true);
  });

  it("renders each block as its own card, with the round count in the title", () => {
    const v = planProgramView(FATLOSS_KB_SATURDAY, { week: 1 });
    expect(v.days.map((d) => d.title)).toEqual([
      "Warm-Up · 10 min",
      "Block 1 · Core & Stability · 2 rounds",
      "Block 2 · Leg + Glutes · 3 rounds",
      "Block 3 · Push & Pull · 3 rounds",
      "Block 4 · Balance & Core Burn · 2 rounds",
      "Block 5 · Finisher · 2–3 rounds, no rest between",
      "Cool-Down · 10 min",
    ]);
  });

  it("models circuit exercises as scheme (sets×reps / time) entries — never % or paces", () => {
    const legs = planProgramView(FATLOSS_KB_SATURDAY, { week: 1 }).days[2]!; // Block 2 · Leg + Glutes
    const swing = legs.sessions[0]!.lifts[1]!;
    expect(swing).toMatchObject({ name: "Kettlebell Swing", setsReps: "3 × 15", prescription: "3 × 15" });
    expect(liftKind(swing)).toBe("rpe"); // structured circuit item (sets×reps column), no % ramp
    expect(swing.rpe).toBeUndefined(); // conditioning is effort-by-feel, not RPE-coded
    // a timed hold is still a scheme entry
    const lunge = legs.sessions[0]!.lifts[2]!;
    expect(lunge).toMatchObject({ name: "Walking Lunges", setsReps: "3 × 10/leg", note: "Bodyweight or with KB" });
  });

  it("renders the cool-down stretches as prose rows (no sets×reps scheme)", () => {
    const cooldown = planProgramView(FATLOSS_KB_SATURDAY, { week: 1 }).days.at(-1)!;
    const fold = cooldown.sessions[0]!.lifts[0]!;
    expect(fold).toMatchObject({ name: "Forward Fold", prescription: "Hamstring stretch" });
    expect(isProseLift(fold)).toBe(true);
    expect(liftKind(fold)).toBe("run");
  });
});

describe("intensity colour helpers", () => {
  it("loadColor maps the % wave (blue→lime→amber→red, BW→ash)", () => {
    expect(loadColor(null)).toBe("ash");
    expect(loadColor(60)).toBe("blue");
    expect(loadColor(70)).toBe("lime");
    expect(loadColor(80)).toBe("amber");
    expect(loadColor(90)).toBe("red");
  });
  it("rpeColor maps the bodybuilding heat column", () => {
    expect(rpeColor(8)).toBe("blue");
    expect(rpeColor(9)).toBe("amber");
    expect(rpeColor(10)).toBe("red");
  });
  it("workoutColor maps endurance workout types", () => {
    expect(workoutColor("Rest / cross-train")).toBe("ash");
    expect(workoutColor("Long run")).toBe("red");
    expect(workoutColor("Tempo")).toBe("amber");
    expect(workoutColor("Hills")).toBe("amber");
    expect(workoutColor("Easy")).toBe("blue");
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

  it("week 1 Friday is a hybrid day — the easy run plus a strength block", () => {
    const fri = planProgramView(RUN_5K_BEGINNER_9WK, { week: 1 }).days[4]!;
    expect(fri.title).toBe("Fri");
    const lifts = fri.sessions[0]!.lifts;
    expect(lifts[0]).toMatchObject({ name: "Easy" }); // the run (prose)
    expect(lifts.filter(isGymLift).map((l) => l.name)).toEqual([
      "Goblet Squat",
      "Romanian Deadlift",
      "Walking Lunge",
      "Standing Calf Raise",
    ]);
    expect(dayContentSummary(fri)).toBe("1 run · 4 lifts");
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
    expect(bench).toMatchObject({ name: "Bench Press", prescription: "4×6 · @9", note: "Main lift — progressive overload" });

    // Sunday is a rest day with no volume chip.
    const sun = v.days[6]!;
    expect(sun.kindLabel).toBe("Rest");
    expect(sun.volume).toBeNull();
  });

  it("injects working weight into prescription when the athlete supplies it", () => {
    const v = planProgramView(BB_PPL_6DAY, { week: 1, maxes: { bench: 80 } });
    const bench = v.days[0]!.sessions[0]!.lifts[0]!;
    expect(bench.prescription).toBe("4×6 · 80 kg · @9");
    // Exercises without a weightRef are unaffected.
    const incline = v.days[0]!.sessions[0]!.lifts[1]!;
    expect(incline.prescription).toBe("3×8 · @8");
  });
});
