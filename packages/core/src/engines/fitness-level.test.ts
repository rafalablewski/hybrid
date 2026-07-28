import { describe, it, expect } from "vitest";
import {
  estimateFitnessLevel,
  resolveExperience,
  STRENGTH_STANDARDS,
  LEVEL_TO_EXPERIENCE,
} from "./fitness-level";
import type { LoggedSession } from "./session";

const NOW = new Date("2026-06-16T12:00:00.000Z").getTime();
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

const lift = (name: string, load: number, reps: number, day = 3): LoggedSession => ({
  id: `${name}-${load}-${day}`,
  title: "Session",
  startedAt: daysAgo(day),
  blocks: [{ kind: "strength", name, sets: [{ load: String(load), reps: String(reps) }] }],
});

describe("estimating training level from the log", () => {
  it("declines to guess when there is nothing to read", () => {
    expect(estimateFitnessLevel([], { bodyweightKg: 80, now: NOW }).basis).toBe("none");
    // No bodyweight → a ratio is not computable, so no estimate.
    expect(estimateFitnessLevel([lift("Back Squat", 140, 1)], { now: NOW }).basis).toBe("none");
    // Only lifts outside the standards table.
    expect(estimateFitnessLevel([lift("Bicep Curl", 30, 8)], { bodyweightKg: 80, now: NOW }).basis).toBe("none");
  });

  it("reads relative strength, not absolute load", () => {
    // The same 140 kg squat is a different athlete at 60 kg and at 120 kg.
    const light = estimateFitnessLevel([lift("Back Squat", 140, 1)], { bodyweightKg: 60, now: NOW });
    const heavy = estimateFitnessLevel([lift("Back Squat", 140, 1)], { bodyweightKg: 120, now: NOW });
    expect(light.evidence[0]!.ratio).toBeGreaterThan(heavy.evidence[0]!.ratio);
    expect(light.level).not.toBe(heavy.level);
  });

  it("places the athlete on the published tiers", () => {
    const bw = 100;
    // 1.3× bodyweight squat — intermediate territory for a male at peak age.
    const mid = estimateFitnessLevel([lift("Back Squat", 130, 1)], { bodyweightKg: bw, ageYears: 28, now: NOW });
    expect(mid.level).toBe("intermediate");
    // 2.4× — elite.
    const top = estimateFitnessLevel([lift("Back Squat", 240, 1)], { bodyweightKg: bw, ageYears: 28, now: NOW });
    expect(top.level).toBe("elite");
    // 0.5× — not yet novice.
    const low = estimateFitnessLevel([lift("Back Squat", 50, 1)], { bodyweightKg: bw, ageYears: 28, now: NOW });
    expect(low.level).toBe("untrained");
  });

  it("holds a woman to the standards written for women", () => {
    const male = estimateFitnessLevel([lift("Bench Press", 90, 1)], { bodyweightKg: 80, sex: "M", ageYears: 28, now: NOW });
    const female = estimateFitnessLevel([lift("Bench Press", 90, 1)], { bodyweightKg: 80, sex: "F", ageYears: 28, now: NOW });
    // Identical lift, identical mass — the female thresholds are lower, so the
    // same ratio places her at least as high, never lower.
    const order = ["untrained", "novice", "intermediate", "advanced", "elite"];
    expect(order.indexOf(female.level)).toBeGreaterThanOrEqual(order.indexOf(male.level));
  });

  it("scales the bar by age, so a teenager is not judged against a 30-year-old", () => {
    const young = estimateFitnessLevel([lift("Deadlift", 150, 1)], { bodyweightKg: 80, ageYears: 15, now: NOW });
    const adult = estimateFitnessLevel([lift("Deadlift", 150, 1)], { bodyweightKg: 80, ageYears: 28, now: NOW });
    const order = ["untrained", "novice", "intermediate", "advanced", "elite"];
    expect(order.indexOf(young.level)).toBeGreaterThanOrEqual(order.indexOf(adult.level));
  });

  it("the BEST lift sets the level, not the average", () => {
    // A strong deadlift and a neglected press: the athlete is not a novice.
    const e = estimateFitnessLevel(
      [lift("Deadlift", 200, 1, 3), lift("Overhead Press", 30, 1, 5)],
      { bodyweightKg: 90, ageYears: 28, now: NOW },
    );
    expect(e.evidence).toHaveLength(2);
    expect(e.level).toBe(e.evidence[0]!.level);
    expect(e.evidence[0]!.lift).toBe("Deadlift");
  });

  it("confidence rises with how many standard lifts are represented", () => {
    const one = estimateFitnessLevel([lift("Back Squat", 150, 1)], { bodyweightKg: 90, now: NOW });
    const three = estimateFitnessLevel(
      [lift("Back Squat", 150, 1, 3), lift("Deadlift", 180, 1, 5), lift("Bench Press", 100, 1, 7)],
      { bodyweightKg: 90, now: NOW },
    );
    expect(three.confidence).toBeGreaterThan(one.confidence);
    // Never certain — a ratio is a proxy for training age, not a measure of it.
    expect(three.confidence).toBeLessThanOrEqual(0.85);
  });

  it("ignores rep-outs and anything outside the window", () => {
    // 20 reps is not a max test.
    expect(estimateFitnessLevel([lift("Back Squat", 100, 20)], { bodyweightKg: 80, now: NOW }).basis).toBe("none");
    // Two years ago is not current form.
    expect(estimateFitnessLevel([lift("Back Squat", 200, 1, 800)], { bodyweightKg: 80, now: NOW }).basis).toBe("none");
  });

  it("maps every level onto a training-age tier the volume model speaks", () => {
    for (const l of Object.keys(LEVEL_TO_EXPERIENCE) as (keyof typeof LEVEL_TO_EXPERIENCE)[]) {
      expect(["beginner", "intermediate", "advanced"]).toContain(LEVEL_TO_EXPERIENCE[l]);
    }
    expect(STRENGTH_STANDARDS.every((s) => s.ratios.length === 4)).toBe(true);
    // Thresholds must climb.
    for (const s of STRENGTH_STANDARDS) {
      for (let i = 1; i < s.ratios.length; i++) expect(s.ratios[i]!).toBeGreaterThan(s.ratios[i - 1]!);
    }
  });
});

describe("what the athlete said versus what the log shows", () => {
  const strong = estimateFitnessLevel([lift("Back Squat", 200, 1)], { bodyweightKg: 90, ageYears: 28, now: NOW });

  it("the athlete's own answer always wins", () => {
    const r = resolveExperience("beginner", strong);
    expect(r.experience).toBe("beginner");
    expect(r.source).toBe("stated");
    // …but the disagreement is REPORTED rather than swallowed.
    expect(r.disagrees).toBe(true);
  });

  it("the estimate fills the gap when they never answered", () => {
    const r = resolveExperience(undefined, strong);
    expect(r.source).toBe("estimated");
    expect(r.experience).toBe(strong.experience);
    expect(r.disagrees).toBe(false);
  });

  it("with neither, it stays unknown rather than defaulting to beginner", () => {
    const r = resolveExperience(undefined, null);
    expect(r.experience).toBeUndefined();
    expect(r.source).toBe("unknown");
  });

  it("no disagreement is reported when they agree", () => {
    expect(resolveExperience(strong.experience, strong).disagrees).toBe(false);
  });
});
