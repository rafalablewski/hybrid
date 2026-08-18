import { describe, it, expect } from "vitest";
import {
  volumeProfileCompleteness,
  VOLUME_PROFILE_FIELDS,
  expectedMassKg,
  frameAdjustedMassKg,
  REFERENCE_BMI,
  REFERENCE_BODY_FAT,
} from "./athlete-profile";
import { personalizeLandmarks } from "./landmark-profile";

describe("what the model still doesn't know about you", () => {
  it("an empty profile scores zero and names training age as the next thing", () => {
    const c = volumeProfileCompleteness({});
    expect(c.score).toBe(0);
    expect(c.complete).toBe(false);
    expect(c.next!.key).toBe("experience");
  });

  it("weights by influence, not by counting boxes", () => {
    // Training age alone is worth more than stress + height together, because
    // it is the only input that moves MEV as well as MRV.
    const exp = volumeProfileCompleteness({ experience: "advanced" }).score;
    const minor = volumeProfileCompleteness({ stress: 3, heightCm: 180 }).score;
    expect(exp).toBeGreaterThan(minor);
  });

  it("a full profile is complete", () => {
    const c = volumeProfileCompleteness({
      experience: "advanced", ageYears: 30, sex: "F", bodyweightKg: 80, heightCm: 180,
      sleep: 4, stress: 2, nutrition: "maintenance", daysPerWeek: 5,
    });
    expect(c.complete).toBe(true);
    expect(c.score).toBe(1);
    expect(c.next).toBeNull();
    expect(c.missing).toEqual([]);
  });

  it("counts sex as a real gap, because it moves every threshold", () => {
    // Without it the estimate holds the athlete to the men's bar, which for a
    // woman usually costs a whole tier of training age — so a profile that has
    // everything EXCEPT sex is not complete.
    const c = volumeProfileCompleteness({
      experience: "advanced", ageYears: 30, bodyweightKg: 80, heightCm: 180,
      sleep: 4, stress: 2, nutrition: "maintenance", daysPerWeek: 5,
    });
    expect(c.complete).toBe(false);
    expect(c.next?.key).toBe("sex");
  });

  it("orders what's missing by how much it would move the estimate", () => {
    const c = volumeProfileCompleteness({ sleep: 4, stress: 2 });
    const weights = c.missing.map((m) => m.field.weight);
    expect([...weights].sort((a, b) => b - a)).toEqual(weights);
  });

  it("marks a gap the app could answer for itself", () => {
    const c = volumeProfileCompleteness({}, ["sleep", "nutrition"]);
    const sleep = c.missing.find((m) => m.field.key === "sleep")!;
    const age = c.missing.find((m) => m.field.key === "ageYears")!;
    expect(sleep.measured).toBe(true);
    expect(age.measured).toBe(false);
  });

  it("every field declares what it unlocks", () => {
    for (const f of VOLUME_PROFILE_FIELDS) {
      expect(f.unlocksKey.startsWith("w.analyze.vol.unlocks")).toBe(true);
      expect(f.weight).toBeGreaterThan(0);
    }
    // The weights are a distribution, not arbitrary numbers.
    const total = VOLUME_PROFILE_FIELDS.reduce((s, f) => s + f.weight, 0);
    expect(total).toBeCloseTo(1, 2);
  });
});

describe("body mass read against frame", () => {
  it("predicts a mass from a height", () => {
    expect(expectedMassKg(180)).toBeCloseTo(REFERENCE_BMI * 1.8 * 1.8, 1);
    expect(expectedMassKg(50)).toBeNull();
    expect(expectedMassKg(NaN)).toBeNull();
  });

  it("without height, the raw mass passes through untouched", () => {
    expect(frameAdjustedMassKg(95)).toBe(95);
    expect(frameAdjustedMassKg(95, null)).toBe(95);
  });

  it("THE POINT: 95 kg at 195 cm is not 95 kg at 170 cm", () => {
    const tall = frameAdjustedMassKg(95, 195);
    const short = frameAdjustedMassKg(95, 170);
    expect(tall).toBeLessThan(short);
    // The tall athlete reads near the reference build; the short one reads heavy.
    expect(tall).toBeLessThan(85);
    expect(short).toBeGreaterThan(90);
  });

  it("so the tall athlete is not docked recovery for being tall", () => {
    const tall = personalizeLandmarks({ bodyweightKg: 95, heightCm: 195 });
    const short = personalizeLandmarks({ bodyweightKg: 95, heightCm: 170 });
    const noHeight = personalizeLandmarks({ bodyweightKg: 95 });
    expect(tall.recovery).toBeGreaterThan(short.recovery);
    // …and with no height the old raw-kg rule applies exactly as before.
    expect(noHeight.recovery).toBe(personalizeLandmarks({ bodyweightKg: 95 }).recovery);
  });

  it("the factor still reports the athlete's REAL mass, not the adjusted one", () => {
    const p = personalizeLandmarks({ bodyweightKg: 95, heightCm: 195 });
    const bwFactor = p.factors.find((f) => f.key === "bodyweight");
    if (bwFactor) expect(bwFactor.value).toBe("95 kg");
  });
});

describe("mass read as LEAN mass, where composition is known", () => {
  /**
   * The penalty exists because more tissue means more to repair, and fat mass
   * does not need repairing. Two athletes at the same scale weight and height
   * therefore must not read the same once one of them has logged a body-fat
   * figure and the other has not been mistaken for them.
   */
  it("charges the leaner athlete more, at the same weight and height", () => {
    const lean = frameAdjustedMassKg(100, 180, 10);
    const soft = frameAdjustedMassKg(100, 180, 30);
    expect(lean).toBeGreaterThan(soft);
  });

  /** The reference cancels: an athlete AT it reads exactly as they did before
   *  composition was known, which is what keeps this a refinement of the frame
   *  rule rather than a second rule stacked on top of it. */
  it("changes nothing at the reference body fat", () => {
    const withBf = frameAdjustedMassKg(90, 180, REFERENCE_BODY_FAT * 100);
    expect(withBf).toBeCloseTo(frameAdjustedMassKg(90, 180), 1);
  });

  it("changes nothing at all when no reading exists", () => {
    expect(frameAdjustedMassKg(95, 185)).toBe(frameAdjustedMassKg(95, 185, null));
    expect(frameAdjustedMassKg(95, 185, undefined)).toBe(frameAdjustedMassKg(95, 185));
  });

  /** A mistyped 0 or 90 would invert the term rather than sharpen it. */
  it("refuses a reading a body cannot take", () => {
    for (const bad of [0, 1, 61, 100, NaN]) {
      expect(frameAdjustedMassKg(90, 180, bad), String(bad)).toBe(frameAdjustedMassKg(90, 180));
    }
  });

  it("applies composition alone when height is unknown", () => {
    expect(frameAdjustedMassKg(100, null, 10)).toBeGreaterThan(100 * 0.9);
    expect(frameAdjustedMassKg(100, null, 30)).toBeLessThan(100);
  });
});
