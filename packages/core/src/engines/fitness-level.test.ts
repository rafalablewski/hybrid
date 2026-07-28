import { describe, it, expect } from "vitest";
import {
  estimateFitnessLevel,
  resolveExperience,
  STRENGTH_STANDARDS,
  LEVEL_TO_EXPERIENCE,
  LEVEL_BASIS_KEY,
  FITNESS_LEVELS,
  fiveKmEquivalentSec,
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

const run = (km: number, minutes: number, day = 3, name = "Run"): LoggedSession => ({
  id: `run-${km}-${minutes}-${day}`,
  title: "Run",
  startedAt: daysAgo(day),
  blocks: [{ kind: "cardio", name, discipline: "running", distance: km, minutes }],
});

describe("the endurance half", () => {
  it("gives a runner a level without ever seeing a barbell", () => {
    // 5 km in 20:00 (4:00/km) — comfortably inside the advanced band, which
    // opens at 4:10/km.
    const r = estimateFitnessLevel([run(5, 20)], { now: NOW });
    expect(r.basis).toBe("endurance");
    expect(r.level).toBe("advanced");
    expect(r.evidence[0]!.kind).toBe("endurance");
  });

  it("does not need a body mass, because a pace isn't relative to one", () => {
    const withBw = estimateFitnessLevel([run(5, 22)], { bodyweightKg: 70, now: NOW });
    const without = estimateFitnessLevel([run(5, 22)], { now: NOW });
    expect(without.level).toBe(withBw.level);
  });

  it("THE POINT of the equivalence: a 10 km is not a slow 5 km", () => {
    // 10 km at 4:30/km is a better performance than 5 km at 4:30/km, and a
    // model that compared raw pace would call them identical.
    const ten = estimateFitnessLevel([run(10, 45)], { now: NOW });
    const five = estimateFitnessLevel([run(5, 22.5)], { now: NOW });
    // Same raw pace, but the 10 km normalises to a FASTER 5 km equivalent.
    expect(ten.evidence[0]!.ratio).toBeLessThan(five.evidence[0]!.ratio);
    expect(fiveKmEquivalentSec(10, 45)).toBeLessThan(45 * 60);
  });

  it("ignores efforts that aren't aerobic tests", () => {
    expect(fiveKmEquivalentSec(1, 4)).toBeNull();       // too short
    expect(fiveKmEquivalentSec(60, 300)).toBeNull();    // past what Riegel is for
    expect(fiveKmEquivalentSec(5, 0)).toBeNull();       // no time
    expect(estimateFitnessLevel([run(1, 4)], { now: NOW }).basis).toBe("none");
  });

  it("reads running only, and says so by declining the rest", () => {
    const ride: LoggedSession = {
      id: "ride", title: "Ride", startedAt: daysAgo(3),
      blocks: [{ kind: "cardio", name: "Cycling", discipline: "cycling", distance: 40, minutes: 80 }],
    };
    // A 40 km ride in 80 minutes is a real performance the model cannot score —
    // gearing, terrain and draft make a pace table a fiction. Declined, not guessed.
    expect(estimateFitnessLevel([ride], { now: NOW }).basis).toBe("none");
  });

  it("the stronger half sets the level, and basis names both", () => {
    // A serious lifter who jogs: the squat should carry the level.
    const r = estimateFitnessLevel([lift("Back Squat", 190, 1), run(5, 32)], { bodyweightKg: 90, now: NOW });
    expect(r.basis).toBe("both");
    expect(r.evidence[0]!.kind).toBe("strength");
    expect(r.level).toBe("advanced");

    // …and the other way round: a runner who does one light set.
    const s = estimateFitnessLevel([lift("Back Squat", 60, 5), run(5, 19)], { bodyweightKg: 70, now: NOW });
    expect(s.basis).toBe("both");
    expect(s.evidence[0]!.kind).toBe("endurance");
    expect(s.level).toBe("advanced");
  });

  it("scales the bar for sex and age the same way the lifts do", () => {
    const male = estimateFitnessLevel([run(5, 26)], { sex: "M", now: NOW });
    const female = estimateFitnessLevel([run(5, 26)], { sex: "F", now: NOW });
    // Same clock time reads as a higher level for a female athlete, because the
    // standards it is scored against are the female ones.
    expect(FITNESS_LEVELS.indexOf(female.level)).toBeGreaterThanOrEqual(FITNESS_LEVELS.indexOf(male.level));

    const veteran = estimateFitnessLevel([run(5, 24)], { ageYears: 55, now: NOW });
    const peak = estimateFitnessLevel([run(5, 24)], { ageYears: 28, now: NOW });
    expect(FITNESS_LEVELS.indexOf(veteran.level)).toBeGreaterThanOrEqual(FITNESS_LEVELS.indexOf(peak.level));
  });

  it("keeps the best run, not the most recent one", () => {
    const r = estimateFitnessLevel([run(5, 30, 3), run(5, 21, 60)], { now: NOW });
    expect(r.evidence[0]!.equivSec).toBe(21 * 60);
  });

  it("every basis has a line of copy naming it", () => {
    for (const b of ["strength", "endurance", "both", "none"] as const) {
      expect(LEVEL_BASIS_KEY[b].startsWith("w.analyze.vol.")).toBe(true);
    }
  });
});
