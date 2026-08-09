import { describe, expect, it } from "vitest";
import {
  HYDRATION_MAX_ML,
  HYDRATION_MIN_ML,
  expectedMl,
  flOzToMl,
  formatVolume,
  hydrationPresets,
  hydrationTarget,
  hydrationToday,
  hydrationVessels,
  mlToFlOz,
  volumeUnit,
} from "./hydration";
import type { Signal } from "./signals";

const water = (ml: number, ts: string): Signal => ({
  athleteId: "a",
  kind: "water",
  value: ml,
  unit: "ml",
  source: "manual",
  ts,
});

// A fixed local moment to hang the time-of-day tests on. Built from parts so
// the test reads the same clock the engine does regardless of the runner's TZ.
const at = (hour: number, minute = 0) => new Date(2026, 2, 14, hour, minute, 0, 0).getTime();

describe("hydrationTarget", () => {
  it("scales with bodyweight at 35 ml/kg, rounded to 50", () => {
    expect(hydrationTarget({ bodyMassKg: 75 })).toBe(2_650); // 2625 → nearest 50
    expect(hydrationTarget({ bodyMassKg: 100 })).toBe(3_500);
  });

  it("falls back to a 75 kg athlete when nobody has weighed in", () => {
    expect(hydrationTarget({})).toBe(hydrationTarget({ bodyMassKg: 75 }));
  });

  it("adds 500 ml per training hour", () => {
    const rest = hydrationTarget({ bodyMassKg: 80 });
    const trained = hydrationTarget({ bodyMassKg: 80, trainingMinutes: 60 });
    expect(trained - rest).toBe(500);
  });

  it("derives minutes from kcal when only kcal is known", () => {
    // 600 kcal is one documented training hour → the same 500 ml bump.
    const rest = hydrationTarget({ bodyMassKg: 80 });
    expect(hydrationTarget({ bodyMassKg: 80, trainingKcal: 600 }) - rest).toBe(500);
  });

  it("prefers real minutes over the kcal fallback", () => {
    const both = hydrationTarget({ bodyMassKg: 80, trainingMinutes: 30, trainingKcal: 1_200 });
    expect(both).toBe(hydrationTarget({ bodyMassKg: 80, trainingMinutes: 30 }));
  });

  it("ignores a rest day and negative inputs", () => {
    const rest = hydrationTarget({ bodyMassKg: 70 });
    expect(hydrationTarget({ bodyMassKg: 70, trainingMinutes: 0 })).toBe(rest);
    expect(hydrationTarget({ bodyMassKg: 70, trainingMinutes: -90 })).toBe(rest);
  });

  it("clamps into a plausible range", () => {
    expect(hydrationTarget({ bodyMassKg: 30 })).toBe(HYDRATION_MIN_ML);
    expect(hydrationTarget({ bodyMassKg: 200, trainingMinutes: 600 })).toBe(HYDRATION_MAX_ML);
  });
});

describe("expectedMl", () => {
  it("expects nothing before waking", () => {
    expect(expectedMl(3_000, at(5))).toBe(0);
    expect(expectedMl(3_000, at(7))).toBe(0);
  });

  it("paces linearly across the waking window", () => {
    // 07:00 → 22:00 is 15 h; 14:30 is halfway.
    expect(expectedMl(3_000, at(14, 30))).toBe(1_500);
  });

  it("expects the whole target after bedtime", () => {
    expect(expectedMl(3_000, at(22))).toBe(3_000);
    expect(expectedMl(3_000, at(23, 30))).toBe(3_000);
  });
});

describe("hydrationToday", () => {
  const day = "2026-03-14";

  it("reads empty when nothing is logged", () => {
    const h = hydrationToday([], { bodyMassKg: 75, now: at(12) });
    expect(h.state).toBe("empty");
    expect(h.ml).toBe(0);
    expect(h.pct).toBe(0);
    expect(h.leftMl).toBe(h.target);
  });

  it("sums the day's water signals", () => {
    const h = hydrationToday([water(250, `${day}T08:00:00`), water(500, `${day}T10:00:00`)], {
      bodyMassKg: 75,
      now: at(11),
    });
    expect(h.ml).toBe(750);
  });

  it("is behind when materially short of the hour's pace", () => {
    // At 19:00, 12/15 of the way through the day, 2 650 ml expects ~2 120 ml.
    const h = hydrationToday([water(500, `${day}T09:00:00`)], { bodyMassKg: 75, now: at(19) });
    expect(h.state).toBe("behind");
    expect(h.behindMl).toBeGreaterThan(0);
  });

  it("is on track early in the day with the same volume", () => {
    // The identical 500 ml at 09:00 is fine — pace, not total, decides.
    const h = hydrationToday([water(500, `${day}T09:00:00`)], { bodyMassKg: 75, now: at(9) });
    expect(h.state).toBe("on-track");
    expect(h.behindMl).toBe(0);
  });

  it("reads met at the target and never over", () => {
    const big = hydrationToday([water(6_000, `${day}T09:00:00`)], { bodyMassKg: 75, now: at(20) });
    expect(big.state).toBe("met");
    expect(big.pct).toBe(100);
    expect(big.leftMl).toBe(0);
  });

  it("reports the sweat allowance separately from the baseline", () => {
    const h = hydrationToday([], { bodyMassKg: 75, trainingMinutes: 60, now: at(12) });
    expect(h.sweatMl).toBe(500);
    expect(h.trained).toBe(true);

    const rest = hydrationToday([], { bodyMassKg: 75, now: at(12) });
    expect(rest.sweatMl).toBe(0);
    expect(rest.trained).toBe(false);
  });

  it("ignores signals from other days", () => {
    const h = hydrationToday([water(2_000, "2026-03-13T12:00:00")], { bodyMassKg: 75, now: at(12) });
    expect(h.ml).toBe(0);
  });
});

describe("units", () => {
  it("maps the weight unit to a volume unit", () => {
    expect(volumeUnit("kg")).toBe("ml");
    expect(volumeUnit("lb")).toBe("floz");
  });

  it("round-trips millilitres and fluid ounces", () => {
    expect(mlToFlOz(flOzToMl(16))).toBeCloseTo(16, 6);
  });

  it("formats metric in ml then litres", () => {
    expect(formatVolume(0, "kg")).toBe("0 ml");
    expect(formatVolume(750, "kg")).toBe("750 ml");
    expect(formatVolume(1_000, "kg")).toBe("1 L");
    expect(formatVolume(2_650, "kg")).toBe("2.7 L");
  });

  it("formats imperial in fluid ounces throughout", () => {
    expect(formatVolume(473, "lb")).toBe("16 fl oz");
    expect(formatVolume(2_650, "lb")).toBe("90 fl oz");
  });

  it("authors presets per unit rather than converting them", () => {
    expect(hydrationPresets("kg").map((p) => p.amount)).toEqual([250, 500, 750]);
    expect(hydrationPresets("lb").map((p) => p.amount)).toEqual([8, 16, 32]);
    // The stored value is always millilitres.
    expect(hydrationPresets("lb")[1]!.ml).toBe(Math.round(flOzToMl(16)));
  });
});

describe("hydrationVessels", () => {
  it("draws the row from the target, not from what has been drunk", () => {
    const early = hydrationToday([water(500, "2026-03-14T08:00:00")], { bodyMassKg: 75, now: at(9) });
    const late = hydrationToday([water(2_000, "2026-03-14T08:00:00")], { bodyMassKg: 75, now: at(18) });
    expect(hydrationVessels(early, "kg").total).toBe(hydrationVessels(late, "kg").total);
  });

  it("fills whole vessels only", () => {
    const h = hydrationToday([water(1_100, "2026-03-14T08:00:00")], { bodyMassKg: 75, now: at(12) });
    const v = hydrationVessels(h, "kg");
    expect(v.total).toBe(5); // 2 650 / 500 ≈ 5
    expect(v.filled).toBe(2); // 1 100 / 530 → 2 whole
  });

  it("caps the row and shares the target across the drawn vessels", () => {
    const h = hydrationToday([water(6_000, "2026-03-14T08:00:00")], {
      bodyMassKg: 200,
      trainingMinutes: 600,
      now: at(20),
    });
    const v = hydrationVessels(h, "kg");
    expect(v.total).toBeLessThanOrEqual(12);
    expect(v.filled).toBeLessThanOrEqual(v.total);
  });
});
