import { describe, it, expect } from "vitest";
import {
  computeFatigue,
  computeReadiness,
  biometricAdjustment,
  progressionSignal,
  prescribeSession,
  easyRunTarget,
  buildMacrocycle,
  currentPhase,
  ALL_MUSCLES,
  SAMPLE_TRAINING_LOG,
  SAMPLE_BIOMETRICS,
} from "./index";
import type { TrainingLog } from "./types";

describe("computeFatigue", () => {
  it("returns a 0..100 score for every muscle group", () => {
    const f = computeFatigue(SAMPLE_TRAINING_LOG);
    for (const m of ALL_MUSCLES) {
      expect(f.muscles[m]).toBeGreaterThanOrEqual(0);
      expect(f.muscles[m]).toBeLessThanOrEqual(100);
    }
  });

  it("accumulates load per energy system", () => {
    const f = computeFatigue(SAMPLE_TRAINING_LOG);
    expect(f.systems.threshold).toBeGreaterThan(0);
    expect(f.systems.anaerobic).toBeGreaterThan(0);
    expect(f.systems.aerobic).toBeGreaterThan(0);
  });

  it("decays older sessions more than recent ones", () => {
    const recent: TrainingLog = [
      { daysAgo: 0, items: [{ move: "Back Squat", topRpe: 8, hardSets: 5 }] },
    ];
    const old: TrainingLog = [
      { daysAgo: 10, items: [{ move: "Back Squat", topRpe: 8, hardSets: 5 }] },
    ];
    expect(computeFatigue(recent).muscles.quads).toBeGreaterThan(
      computeFatigue(old).muscles.quads,
    );
  });

  it("is empty (all zero) for an empty log", () => {
    const f = computeFatigue([]);
    expect(f.muscles.quads).toBe(0);
    expect(f.systems.aerobic).toBe(0);
  });
});

describe("computeReadiness", () => {
  it("clamps to the 35..98 band", () => {
    const f = computeFatigue(SAMPLE_TRAINING_LOG);
    const r = computeReadiness(f);
    expect(r.score).toBeGreaterThanOrEqual(35);
    expect(r.score).toBeLessThanOrEqual(98);
  });

  it("a fresh athlete reads more ready than a fatigued one", () => {
    const fresh = computeReadiness(computeFatigue([]));
    const cooked = computeReadiness(
      computeFatigue([
        { daysAgo: 0, items: [{ move: "Back Squat", topRpe: 10, hardSets: 8 }] },
      ]),
    );
    expect(fresh.score).toBeGreaterThan(cooked.score);
  });
});

describe("biometricAdjustment", () => {
  it("is positive when HRV is up and resting HR is down", () => {
    expect(biometricAdjustment(SAMPLE_BIOMETRICS)).toBeGreaterThan(0);
  });

  it("stays within -15..+15", () => {
    const extreme = biometricAdjustment({
      hrv: { today: 200, baseline: 50, unit: "ms", better: "high" },
      restingHr: { today: 30, baseline: 60, unit: "bpm", better: "low" },
      sleep: { today: 12, baseline: 7, unit: "h", better: "high" },
    });
    expect(extreme).toBeLessThanOrEqual(15);
    expect(extreme).toBeGreaterThanOrEqual(-15);
  });

  it("never returns NaN when a baseline is zero (no divide-by-zero)", () => {
    const adj = biometricAdjustment({
      hrv: { today: 0, baseline: 0, unit: "ms", better: "high" },
      restingHr: { today: 0, baseline: 0, unit: "bpm", better: "low" },
      sleep: { today: 0, baseline: 0, unit: "h", better: "high" },
    });
    expect(Number.isNaN(adj)).toBe(false);
    expect(adj).toBe(0);
    // and the readiness score it feeds must stay a real number
    const r = computeReadiness(computeFatigue([]), {
      hrv: { today: 0, baseline: 0, unit: "ms", better: "high" },
      restingHr: { today: 0, baseline: 0, unit: "bpm", better: "low" },
      sleep: { today: 0, baseline: 0, unit: "h", better: "high" },
    });
    expect(Number.isNaN(r.score)).toBe(false);
  });
});

describe("progressionSignal", () => {
  it("holds when there isn't enough history", () => {
    const sig = progressionSignal(
      [{ daysAgo: 1, items: [{ move: "Back Squat", e1rm: 100, topRpe: 7 }] }],
      "Back Squat",
    );
    expect(sig.action).toBe("hold");
  });

  it("progresses on a rising e1RM at submaximal RPE", () => {
    const log: TrainingLog = [
      { daysAgo: 1, items: [{ move: "Back Squat", e1rm: 150, topRpe: 7.5 }] },
      { daysAgo: 4, items: [{ move: "Back Squat", e1rm: 145, topRpe: 7.5 }] },
    ];
    expect(progressionSignal(log, "Back Squat").action).toBe("progress");
  });

  it("deloads when the last top set was RPE 9+", () => {
    const log: TrainingLog = [
      { daysAgo: 1, items: [{ move: "Back Squat", e1rm: 150, topRpe: 9.5 }] },
      { daysAgo: 4, items: [{ move: "Back Squat", e1rm: 150, topRpe: 8 }] },
    ];
    expect(progressionSignal(log, "Back Squat").action).toBe("deload");
  });
});

describe("prescribeSession", () => {
  it("returns a strength block + a cardio/conditioning block with an explanation", () => {
    const rx = prescribeSession(SAMPLE_TRAINING_LOG, SAMPLE_BIOMETRICS);
    expect(rx.blocks).toHaveLength(2);
    expect(rx.blocks[0]!.kind).toBe("strength");
    expect(["cardio", "conditioning"]).toContain(rx.blocks[1]!.kind);
    expect(rx.why.length).toBeGreaterThan(20);
    expect(rx.readiness).toBeGreaterThanOrEqual(35);
  });

  it("confidence increases with log depth", () => {
    const shallow = prescribeSession(SAMPLE_TRAINING_LOG.slice(0, 1));
    const deep = prescribeSession(SAMPLE_TRAINING_LOG);
    expect(deep.confidence).toBeGreaterThan(shallow.confidence);
  });

  it("flags the working load as an estimate for a brand-new user and labels it honestly", () => {
    const rx = prescribeSession([]);
    expect(rx.loadEstimated).toBe(true);
    expect(rx.why).toMatch(/starting estimate/);
  });

  it("does not flag the load estimated once every candidate lift has logged e1RM", () => {
    const full: TrainingLog = [
      {
        daysAgo: 3,
        items: [
          { move: "Back Squat", e1rm: 150, topRpe: 8, hardSets: 3 },
          { move: "Deadlift", e1rm: 180, topRpe: 8, hardSets: 3 },
          { move: "Bench Press", e1rm: 120, topRpe: 8, hardSets: 3 },
          { move: "Overhead Press", e1rm: 80, topRpe: 8, hardSets: 3 },
        ],
      },
    ];
    // whichever lift the engine picks as freshest, it has real history
    expect(prescribeSession(full).loadEstimated).toBe(false);
  });

  it("picks the freshest conditioning system", () => {
    // hammer the threshold system; engine should avoid it
    const log: TrainingLog = [
      { daysAgo: 0, items: [{ move: "Row Intervals", system: "threshold", minutes: 60, rpe: 9 }] },
    ];
    expect(prescribeSession(log).pickSys).not.toBe("threshold");
  });

  it("prescribes a steady run with distance + goal pace off the athlete's own runs", () => {
    // Hammer threshold + anaerobic today so AEROBIC is the freshest system, with
    // older runs on record (5:00/km over 10 km) for the engine to read pace from.
    const log: TrainingLog = [
      { daysAgo: 0, items: [
        { move: "Row Intervals", system: "threshold", minutes: 40, rpe: 9 },
        { move: "Assault Bike", system: "anaerobic", minutes: 25, rpe: 9 },
      ] },
      { daysAgo: 20, items: [{ move: "Easy Run", system: "aerobic", minutes: 50, rpe: 5, distance: 10 }] },
      { daysAgo: 27, items: [{ move: "Easy Run", system: "aerobic", minutes: 50, rpe: 5, distance: 10 }] },
    ];
    const rx = prescribeSession(log);
    expect(rx.pickSys).toBe("aerobic");
    const cardio = rx.blocks.find((b) => b.kind === "cardio")!;
    expect(cardio.kind).toBe("cardio");
    if (cardio.kind === "cardio") {
      expect(cardio.distance).toBeGreaterThan(0);
      expect(cardio.paceTarget).toBe("5:00 /km");
    }
    expect(rx.why).toContain("km run");
  });

  it("picks bodyweight movements + a 'BW' load for minimal equipment", () => {
    const rx = prescribeSession([], undefined, { equipment: "minimal" });
    const strength = rx.blocks[0]!;
    expect(strength.kind).toBe("strength");
    expect(["Bodyweight Squat", "Single-Leg RDL", "Push-Up", "Pike Push-Up"]).toContain(strength.name);
    if (strength.kind === "strength") expect(strength.sets[0]!.load).toBe("BW");
    expect(rx.loadEstimated).toBe(false); // bodyweight isn't a load "estimate"
    expect(rx.oneRm).toBe(0);
    expect(rx.why).toContain("bodyweight");
  });

  it("picks dumbbell movements for home equipment", () => {
    const rx = prescribeSession([], undefined, { equipment: "home" });
    expect(["Goblet Squat", "DB Romanian Deadlift", "DB Bench Press", "DB Overhead Press"]).toContain(rx.blocks[0]!.name);
  });

  it("doses more conservatively for a beginner than an advanced athlete", () => {
    const begin = prescribeSession([], undefined, { experience: "beginner" });
    const adv = prescribeSession([], undefined, { experience: "advanced" });
    const beginStr = begin.blocks[0]!;
    const advStr = adv.blocks[0]!;
    if (beginStr.kind === "strength" && advStr.kind === "strength") {
      // fewer work sets and a lighter load for the beginner
      expect(beginStr.sets.length).toBeLessThan(advStr.sets.length);
      expect(Number(beginStr.sets[0]!.load)).toBeLessThan(Number(advStr.sets[0]!.load));
    }
  });
});

describe("easyRunTarget", () => {
  it("derives pace from logged runs and scales distance down on a low-readiness day", () => {
    const log: TrainingLog = [
      { daysAgo: 3, items: [{ move: "Easy Run", system: "aerobic", minutes: 48, rpe: 5, distance: 8 }] },
    ];
    const fresh = easyRunTarget(log, 80);
    const tired = easyRunTarget(log, 40);
    expect(fresh.paceSecPerKm).toBe(360); // 48 min / 8 km = 6:00/km
    expect(tired.distance).toBeLessThan(fresh.distance);
  });
  it("falls back to a gentle default with no run history, flagged as an estimate", () => {
    const t = easyRunTarget([], 75);
    expect(t.distance).toBe(5);
    expect(t.paceSecPerKm).toBe(390);
    expect(t.estimated).toBe(true);
  });
  it("is not flagged estimated once real runs exist", () => {
    const log: TrainingLog = [
      { daysAgo: 3, items: [{ move: "Easy Run", system: "aerobic", minutes: 48, rpe: 5, distance: 8 }] },
    ];
    expect(easyRunTarget(log, 80).estimated).toBe(false);
  });
});

describe("periodization", () => {
  it("stacks all phases forward when there is no event", () => {
    const macro = buildMacrocycle("Hybrid");
    expect(macro.totalWeeks).toBeGreaterThan(0);
    expect(macro.blocks.length).toBeGreaterThan(0);
    const sum = macro.blocks.reduce((s, b) => s + b.micros.length, 0);
    expect(sum).toBe(macro.totalWeeks);
  });

  it("fits phases into the weeks available before an event", () => {
    const macro = buildMacrocycle("Hyrox", 10);
    expect(macro.eventInWeeks).toBe(10);
    // each block has at least one week
    for (const b of macro.blocks) expect(b.weeks).toBeGreaterThanOrEqual(1);
  });

  it("lands the plan EXACTLY on the event for any horizon (no over/undershoot)", () => {
    for (const wk of [1, 2, 3, 4, 7, 10, 13, 16, 20, 26, 52]) {
      const macro = buildMacrocycle("Hyrox", wk);
      const total = macro.blocks.reduce((s, b) => s + b.weeks, 0);
      expect(total).toBe(wk);
      for (const b of macro.blocks) expect(b.weeks).toBeGreaterThanOrEqual(1);
    }
  });

  it("resolves the current phase + microcycle for a given week", () => {
    const macro = buildMacrocycle("Hybrid");
    const { block, micro } = currentPhase(macro, 5);
    expect(micro.week).toBe(5);
    expect(block.startWeek).toBeLessThanOrEqual(5);
    expect(block.endWeek).toBeGreaterThanOrEqual(5);
  });

  it("uses the endurance model for endurance goals", () => {
    expect(buildMacrocycle("Running").model).toBe("Endurance model");
    expect(buildMacrocycle("Powerlifting").model).toBe("Strength model");
  });
});
