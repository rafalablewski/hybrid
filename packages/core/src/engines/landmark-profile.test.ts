import { describe, it, expect } from "vitest";
import { VOLUME_LANDMARKS } from "./landmarks";
import { ALL_MUSCLES } from "./movements";
import {
  personalizeLandmarks,
  scaleLandmarks,
  sanitizeVolumeProfile,
  isEmptyVolumeProfile,
  type AthleteVolumeProfile,
} from "./landmark-profile";

/** The two athletes the model has to tell apart. */
const NOVICE: AthleteVolumeProfile = { experience: "beginner", ageYears: 18, bodyweightKg: 40, trainingYears: 0.5 };
const VETERAN: AthleteVolumeProfile = { experience: "advanced", ageYears: 40, bodyweightKg: 120, trainingYears: 20 };

const monotonic = (l: { mv: number; mev: number; mavLow: number; mavHigh: number; mrv: number }) =>
  l.mv <= l.mev && l.mev <= l.mavLow && l.mavLow <= l.mavHigh && l.mavHigh <= l.mrv;

describe("personalized volume landmarks", () => {
  it("an empty profile returns the population table untouched", () => {
    const p = personalizeLandmarks({});
    expect(p.personalized).toBe(false);
    expect(p.confidence).toBe(0);
    expect(p.stimulus).toBe(1);
    expect(p.recovery).toBe(1);
    expect(p.landmarks).toEqual(VOLUME_LANDMARKS);
  });

  it("the 18yo 40kg novice and the 40yo 120kg veteran get DIFFERENT landmarks", () => {
    const a = personalizeLandmarks(NOVICE).landmarks.quads;
    const b = personalizeLandmarks(VETERAN).landmarks.quads;
    expect(a).not.toEqual(b);
    // The novice grows off far less work than the veteran.
    expect(a.mev).toBeLessThan(b.mev);
    // Both ceilings sit under the population default, for opposite reasons:
    // the novice has no work capacity yet, the veteran carries age + mass.
    expect(a.mrv).toBeLessThan(VOLUME_LANDMARKS.quads.mrv);
    expect(b.mrv).toBeLessThan(VOLUME_LANDMARKS.quads.mrv);
  });

  it("training age raises both the floor and the ceiling", () => {
    const beg = personalizeLandmarks({ experience: "beginner" });
    const adv = personalizeLandmarks({ experience: "advanced" });
    expect(beg.stimulus).toBeLessThan(adv.stimulus);
    expect(beg.recovery).toBeLessThan(adv.recovery);
    expect(beg.landmarks.back.mev).toBeLessThan(adv.landmarks.back.mev);
    expect(beg.landmarks.back.mrv).toBeLessThan(adv.landmarks.back.mrv);
  });

  it("age only bites past 30, and never past the floor", () => {
    expect(personalizeLandmarks({ ageYears: 25 }).recovery).toBe(1);
    expect(personalizeLandmarks({ ageYears: 45 }).recovery).toBeLessThan(1);
    expect(personalizeLandmarks({ ageYears: 90 }).recovery).toBeGreaterThanOrEqual(0.55);
  });

  it("body mass moves the ceiling in the expected direction", () => {
    const light = personalizeLandmarks({ bodyweightKg: 55 }).recovery;
    const ref = personalizeLandmarks({ bodyweightKg: 80 }).recovery;
    const heavy = personalizeLandmarks({ bodyweightKg: 120 }).recovery;
    expect(light).toBeGreaterThan(ref);
    expect(ref).toBe(1);
    expect(heavy).toBeLessThan(ref);
  });

  it("recovery inputs (sleep, stress, energy, frequency) only touch the ceiling", () => {
    const bad = personalizeLandmarks({ sleep: 1, stress: 5, nutrition: "deficit", daysPerWeek: 2 });
    const good = personalizeLandmarks({ sleep: 5, stress: 1, nutrition: "surplus", daysPerWeek: 6 });
    expect(bad.stimulus).toBe(1);
    expect(good.stimulus).toBe(1);
    expect(bad.recovery).toBeLessThan(good.recovery);
    expect(bad.landmarks.chest.mev).toBe(VOLUME_LANDMARKS.chest.mev);
    expect(bad.landmarks.chest.mrv).toBeLessThan(good.landmarks.chest.mrv);
  });

  it("compounded factors stay inside sane bounds", () => {
    const worst = personalizeLandmarks({ experience: "beginner", ageYears: 75, bodyweightKg: 200, sleep: 1, stress: 5, nutrition: "deficit", daysPerWeek: 1 });
    expect(worst.recovery).toBeGreaterThanOrEqual(0.55);
    const best = personalizeLandmarks({ experience: "advanced", ageYears: 20, bodyweightKg: 45, sleep: 5, stress: 1, nutrition: "surplus", daysPerWeek: 7 });
    expect(best.recovery).toBeLessThanOrEqual(1.6);
  });

  it("every personalized map stays monotonic (mv ≤ mev ≤ mavLow ≤ mavHigh ≤ mrv)", () => {
    for (const p of [NOVICE, VETERAN, { experience: "advanced" as const, nutrition: "deficit" as const, sleep: 1, stress: 5, ageYears: 60, bodyweightKg: 150 }]) {
      const { landmarks } = personalizeLandmarks(p);
      for (const m of ALL_MUSCLES) expect(monotonic(landmarks[m])).toBe(true);
    }
  });

  it("scaling keeps the MAV band at its proportional position between MEV and MRV", () => {
    const scaled = scaleLandmarks(VOLUME_LANDMARKS, 1, 0.8);
    const d = VOLUME_LANDMARKS.back;
    const s = scaled.back;
    const pBefore = (d.mavHigh - d.mev) / (d.mrv - d.mev);
    const pAfter = (s.mavHigh - s.mev) / (s.mrv - s.mev);
    expect(Math.abs(pBefore - pAfter)).toBeLessThan(0.06);
  });

  it("training years override a self-described tier", () => {
    // Someone who calls themselves advanced after six months is a beginner.
    const claimed = personalizeLandmarks({ experience: "advanced", trainingYears: 0.5 });
    expect(claimed.stimulus).toBe(personalizeLandmarks({ experience: "beginner" }).stimulus);
  });

  it("reports the factors that moved the numbers, biggest first", () => {
    const { factors } = personalizeLandmarks(VETERAN);
    expect(factors.length).toBeGreaterThan(1);
    const sizes = factors.map((f) => Math.abs(1 - f.multiplier));
    expect([...sizes].sort((a, b) => b - a)).toEqual(sizes);
    expect(factors.map((f) => f.key)).toContain("bodyweight");
  });

  it("confidence rises as the profile fills in", () => {
    const thin = personalizeLandmarks({ experience: "intermediate" }).confidence;
    const full = personalizeLandmarks(VETERAN).confidence;
    expect(thin).toBeGreaterThan(0);
    expect(full).toBeGreaterThan(thin);
    expect(full).toBeLessThanOrEqual(1);
  });

  it("sanitizes untrusted profiles", () => {
    expect(sanitizeVolumeProfile(null)).toEqual({});
    expect(sanitizeVolumeProfile({ experience: "pro", ageYears: 4, bodyweightKg: 1000, sleep: 9, nutrition: "air" })).toEqual({});
    expect(sanitizeVolumeProfile({ experience: "advanced", ageYears: 40.6, bodyweightKg: 120.44, sleep: 3, stress: 4, nutrition: "deficit", daysPerWeek: 5 })).toEqual({
      experience: "advanced", ageYears: 41, bodyweightKg: 120.4, sleep: 3, stress: 4, nutrition: "deficit", daysPerWeek: 5,
    });
  });

  it("knows an empty profile from a filled one", () => {
    expect(isEmptyVolumeProfile(undefined)).toBe(true);
    expect(isEmptyVolumeProfile({})).toBe(true);
    expect(isEmptyVolumeProfile({ experience: "beginner" })).toBe(false);
  });
});
