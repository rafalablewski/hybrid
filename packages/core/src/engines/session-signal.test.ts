import { describe, it, expect } from "vitest";
import {
  estimateBlockMinutes,
  sessionSignal,
  strengthBlockStats,
  blockSignalSummary,
  DEFAULT_REST_SEC,
} from "./session-signal";
import type { SessionBlock, StrengthBlock } from "./session";

const squat = (over: Partial<StrengthBlock> = {}): StrengthBlock => ({
  kind: "strength",
  name: "Back Squat",
  sets: [
    { load: "60", reps: "5", role: "warmup" },
    { load: "120", reps: "5" },
    { load: "120", reps: "5" },
    { load: "122.5", reps: "5" },
  ],
  ...over,
});

describe("estimateBlockMinutes", () => {
  it("strength: working sets pay rest + work, warm-ups pay a flat minute", () => {
    // 3 working × (150 + 45) + 1 warm-up × 60 = 645 s = 10.75 min
    expect(estimateBlockMinutes(squat())).toBeCloseTo(10.75, 2);
  });
  it("strength honours the block's planned restSec", () => {
    // 3 × (60 + 45) + 60 = 375 s
    expect(estimateBlockMinutes(squat({ restSec: 60 }))).toBeCloseTo(6.25, 2);
  });
  it("cardio reflects only what's entered", () => {
    expect(estimateBlockMinutes({ kind: "cardio", name: "Run", minutes: 40 })).toBe(40);
    expect(estimateBlockMinutes({ kind: "cardio", name: "Run", distance: 8 })).toBe(0);
  });
  it("conditioning derives from rounds × (work + rest) when minutes absent", () => {
    expect(
      estimateBlockMinutes({ kind: "conditioning", name: "Bike", rounds: 8, work: 40, rest: 20 }),
    ).toBe(8);
    expect(estimateBlockMinutes({ kind: "conditioning", name: "Bike", minutes: 12 })).toBe(12);
    expect(estimateBlockMinutes({ kind: "conditioning", name: "Bike" })).toBe(0);
  });
});

describe("sessionSignal", () => {
  const blocks: SessionBlock[] = [
    squat({ restSec: 135 }), // 3 × (135+45) + 60 = 600 s = 10 min strength
    { kind: "cardio", name: "Treadmill Run", distance: 8, minutes: 36 }, // 36 endurance
    { kind: "conditioning", name: "Assault Bike", rounds: 8, work: 40, rest: 20 }, // 8 cond
  ];
  const sig = sessionSignal(blocks);

  it("sums estimated minutes", () => {
    expect(sig.minutes).toBe(54);
  });
  it("computes working tonnage (warm-ups excluded, rounded like sessionVolume)", () => {
    expect(sig.tonnageKg).toBe(Math.round(120 * 5 + 120 * 5 + 122.5 * 5));
  });
  it("splits time into integer percents summing to 100", () => {
    expect(sig.split.strength + sig.split.conditioning + sig.split.endurance).toBe(100);
    expect(sig.split.endurance).toBeGreaterThan(sig.split.strength);
  });
  it("is all-zero for an empty or unentered session", () => {
    const empty = sessionSignal([]);
    expect(empty.minutes).toBe(0);
    expect(empty.split).toEqual({ strength: 0, conditioning: 0, endurance: 0 });
  });
});

describe("strengthBlockStats", () => {
  it("derives scheme, top load and volume from working sets", () => {
    const s = strengthBlockStats(squat());
    expect(s.scheme).toBe("3×5");
    expect(s.topKg).toBe(122.5);
    expect(s.volumeKg).toBe(Math.round(120 * 5 + 120 * 5 + 122.5 * 5));
  });
  it("counts a drop set's volume but not its row in the scheme", () => {
    const b = squat({
      sets: [
        { load: "120", reps: "5" },
        { load: "95", reps: "8", drop: true },
      ],
    });
    const s = strengthBlockStats(b);
    expect(s.scheme).toBe("1×5");
    expect(s.volumeKg).toBe(120 * 5 + 95 * 8);
  });
});

describe("blockSignalSummary", () => {
  it("uses spaced en dashes, never middots", () => {
    const sums = [
      blockSignalSummary(squat()),
      blockSignalSummary({ kind: "cardio", name: "Run", distance: 8, minutes: 36 }),
      blockSignalSummary({ kind: "conditioning", name: "Bike", format: "EMOM", rounds: 8, work: 40, rest: 20 }),
    ];
    expect(sums[0]).toBe("3×5 – 122.5 kg");
    expect(sums[1]).toBe("8 km – 36 min");
    expect(sums[2]).toBe("EMOM – 8×40/20s");
    for (const s of sums) expect(s.includes("·")).toBe(false);
  });
  it("renders metre-sport distances in metres, not km", () => {
    expect(blockSignalSummary({ kind: "cardio", name: "Swimming", distance: 1.5, minutes: 28 })).toBe(
      "1500 m – 28 min",
    );
    expect(blockSignalSummary({ kind: "cardio", name: "Rowing", distance: 2 })).toContain("2000 m");
  });
});
