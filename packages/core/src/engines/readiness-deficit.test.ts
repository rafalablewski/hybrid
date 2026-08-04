import { describe, it, expect } from "vitest";
import { readinessDeficit, readinessRingSegments, readinessRingTicks, apportion } from "./readiness-deficit";
import { computeReadiness } from "./readiness";
import { computeFatigue } from "./fatigue";
import type { Biometrics, TrainingLog } from "./types";

/**
 * THE SUM LAW.
 *
 * "Back fatigue is the main drag" was a safe sentence. "Back fatigue cost you
 * 22 points" is a claim, and a ring whose segments don't add up to its own
 * number is a lie drawn at 118px. Every case below is really one assertion:
 * kept + every cost === 100, and the ring covers itself exactly once.
 */

const HEAVY: TrainingLog = [
  { daysAgo: 0, items: [{ move: "Back Squat", topRpe: 9, hardSets: 8 }, { move: "Deadlift", topRpe: 9, hardSets: 5 }] },
  { daysAgo: 1, items: [{ move: "Bench Press", topRpe: 8, hardSets: 6 }] },
  { daysAgo: 2, items: [{ move: "Back Squat", topRpe: 9, hardSets: 6 }] },
];

const LIGHT: TrainingLog = [{ daysAgo: 12, items: [{ move: "Back Squat", topRpe: 6, hardSets: 1 }] }];

const WRECKING: TrainingLog = Array.from({ length: 8 }, (_, i) => ({
  daysAgo: i,
  items: [
    { move: "Back Squat", topRpe: 10, hardSets: 12 },
    { move: "Deadlift", topRpe: 10, hardSets: 10 },
    { move: "Bench Press", topRpe: 10, hardSets: 10 },
    { move: "Overhead Press", topRpe: 10, hardSets: 10 },
  ],
}));

const TIRED_BIO: Biometrics = {
  hrv: { today: 38, baseline: 62, better: "high" },
  restingHr: { today: 61, baseline: 51, better: "low" },
  sleep: { today: 5.0, baseline: 7.8, better: "high" },
};

const FRESH_BIO: Biometrics = {
  hrv: { today: 74, baseline: 62, better: "high" },
  restingHr: { today: 47, baseline: 51, better: "low" },
  sleep: { today: 8.6, baseline: 7.8, better: "high" },
};

/** The ring's fixed drawing order — never re-sorted by value. */
const ORDER = ["tissue", "conditioning", "wearable", "ceiling"];

const ENDURANCE_WEEK: TrainingLog = [
  { daysAgo: 0, items: [{ move: "Run", minutes: 65, rpe: 8, system: "threshold" }] },
  { daysAgo: 1, items: [{ move: "Run", minutes: 95, rpe: 7, system: "aerobic" }] },
  { daysAgo: 3, items: [{ move: "Run", minutes: 50, rpe: 9, system: "anaerobic" }] },
];

const CASES: [string, TrainingLog, Biometrics | undefined][] = [
  ["endurance week", ENDURANCE_WEEK, undefined],
  ["endurance week, tired wearable", ENDURANCE_WEEK, TIRED_BIO],
  ["empty log", [], undefined],
  ["empty log, tired wearable", [], TIRED_BIO],
  ["empty log, fresh wearable", [], FRESH_BIO],
  ["light log", LIGHT, undefined],
  ["light log, fresh wearable", LIGHT, FRESH_BIO],
  ["heavy log", HEAVY, undefined],
  ["heavy log, tired wearable", HEAVY, TIRED_BIO],
  ["heavy log, fresh wearable", HEAVY, FRESH_BIO],
  ["wrecking block", WRECKING, undefined],
  ["wrecking block, tired wearable", WRECKING, TIRED_BIO],
];

describe("readinessDeficit — the parts must add up to the whole", () => {
  it.each(CASES)("kept + every cost === 100 (%s)", (_name, log, bio) => {
    const d = readinessDeficit(log, bio);
    expect(d.kept + d.costs.reduce((a, c) => a + c.points, 0)).toBe(100);
  });

  it.each(CASES)("the costs sum to the deficit, and none is invisible (%s)", (_name, log, bio) => {
    const d = readinessDeficit(log, bio);
    expect(d.costs.reduce((a, c) => a + c.points, 0)).toBe(d.deficit);
    for (const c of d.costs) expect(c.points).toBeGreaterThan(0);
  });

  it.each(CASES)("kept is the score the ring prints, never a second opinion (%s)", (_name, log, bio) => {
    const d = readinessDeficit(log, bio);
    expect(d.kept).toBe(computeReadiness(computeFatigue(log), bio).score);
  });

  it("never draws more arcs than a ring can carry", () => {
    for (const [, log, bio] of CASES) expect(readinessDeficit(log, bio).costs.length).toBeLessThanOrEqual(3);
  });

  it("carries the tissue term as ONE cost, named by the tissue holding most of it", () => {
    const d = readinessDeficit(HEAVY);
    expect(d.costs.filter((c) => c.kind === "tissue")).toHaveLength(1);
    // The named tissue is genuinely the heaviest one in the log — the same one
    // the card's face calls the limiter, so the two can't tell different stories.
    const f = computeFatigue(HEAVY).muscles;
    const heaviest = (Object.keys(f) as (keyof typeof f)[]).reduce((a, b) => (f[b] > f[a] ? b : a));
    expect(d.costs[0].kind).toBe("tissue");
    expect(d.costs[0].muscle).toBe(heaviest);
  });

  it("never lets an anonymous cost outweigh a named one", () => {
    // The failure this structure exists to prevent: a per-muscle split made the
    // biggest arc an unnamed "other tissue", because readiness averages all
    // seven and a normal week spreads the load.
    for (const [, log, bio] of CASES) {
      for (const c of readinessDeficit(log, bio).costs) {
        if (c.kind === "tissue") expect(c.muscle).not.toBeNull();
      }
    }
  });

  it("gives the wearable its own cost only when it TOOK points", () => {
    const tired = readinessDeficit(HEAVY, TIRED_BIO);
    expect(tired.bioAdj).toBeLessThan(0);
    expect(tired.costs.some((c) => c.kind === "wearable")).toBe(true);

    const fresh = readinessDeficit(HEAVY, FRESH_BIO);
    expect(fresh.bioAdj).toBeGreaterThan(0);
    // A nudge that gave points back is not a cost, and it takes no arc.
    expect(fresh.costs.some((c) => c.kind === "wearable")).toBe(false);
    expect(fresh.kept).toBeGreaterThan(readinessDeficit(HEAVY).kept);
  });

  it("attributes the scale's own ceiling rather than leaving a gap", () => {
    // Nothing logged and a wearable saying 'recovered' pins the score at the
    // engine's 98 ceiling — the missing 2 points are the scale, not the athlete.
    const d = readinessDeficit([], FRESH_BIO);
    expect(d.kept).toBe(98);
    expect(d.costs).toHaveLength(1);
    expect(d.costs[0].kind).toBe("ceiling");
    expect(d.costs[0].points).toBe(2);
  });

  it("records the floor when the engine refuses to go lower", () => {
    const d = readinessDeficit(WRECKING, TIRED_BIO);
    expect(d.kept).toBe(35);
    expect(d.clamped).toBe("floor");
    // Still exact: the clamp scales the causes, it doesn't orphan them.
    expect(d.kept + d.costs.reduce((a, c) => a + c.points, 0)).toBe(100);
  });

  it("charges conditioning load — an endurance week must not read as fully fresh", () => {
    // THE BUG THIS PINS. Readiness counted muscle fatigue and the wearable and
    // nothing else, so a runner's log — which doses fatigue.systems, never
    // fatigue.muscles — left the average near zero and the score near the
    // ceiling. An athlete could run themselves into the ground and the number
    // that prescribes their training would not notice.
    const cardio: TrainingLog = [
      { daysAgo: 0, items: [{ move: "Run", minutes: 70, rpe: 8, system: "threshold" }] },
      { daysAgo: 1, items: [{ move: "Run", minutes: 60, rpe: 7, system: "aerobic" }] },
      { daysAgo: 2, items: [{ move: "Run", minutes: 90, rpe: 7, system: "aerobic" }] },
    ];
    const d = readinessDeficit(cardio);
    expect(d.kept + d.costs.reduce((a, c) => a + c.points, 0)).toBe(100);
    const conditioning = d.costs.find((c) => c.kind === "conditioning");
    expect(conditioning).toBeTruthy();
    expect(conditioning!.points).toBeGreaterThan(0);
    expect(d.kept).toBeLessThan(90);
    // Whatever the arcs say, they never claim a cause the score doesn't have.
    for (const c of d.costs) expect(["tissue", "conditioning", "wearable", "ceiling"]).toContain(c.kind);
  });

  it("keeps the arcs in the engine's fixed order: tissue, conditioning, wearable", () => {
    const mixed: TrainingLog = [
      { daysAgo: 0, items: [{ move: "Back Squat", topRpe: 9, hardSets: 6 }, { move: "Run", minutes: 50, rpe: 8, system: "threshold" }] },
      { daysAgo: 1, items: [{ move: "Run", minutes: 70, rpe: 7, system: "aerobic" }] },
    ];
    const kinds = readinessDeficit(mixed, TIRED_BIO).costs.map((c) => c.kind);
    expect(kinds).toEqual([...kinds].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)));
    expect(kinds).toContain("tissue");
    expect(kinds).toContain("conditioning");
    expect(kinds).toContain("wearable");
  });
});

describe("readinessRingSegments — the ring covers itself exactly once", () => {
  const TICKS = [12, 24, 32, 60];

  it.each(CASES)("segments tile the ring with no gap and no overlap (%s)", (_name, log, bio) => {
    const d = readinessDeficit(log, bio);
    for (const ticks of TICKS) {
      const segs = readinessRingSegments(d, ticks);
      expect(segs.reduce((a, s) => a + s.count, 0)).toBe(ticks);
      let expected = 0;
      for (const s of segs) {
        expect(s.from).toBe(expected);
        expect(s.count).toBeGreaterThan(0);
        expected += s.count;
      }
      expect(readinessRingTicks(d, ticks)).toHaveLength(ticks);
    }
  });

  it("leads with what was KEPT, then the costs in the order the engine fixed", () => {
    const segs = readinessRingSegments(readinessDeficit(HEAVY, TIRED_BIO));
    expect(segs[0].kind).toBe("kept");
    const kinds = segs.slice(1).map((s) => s.kind);
    // Tissue before the wearable, always — never re-sorted by size, or the card
    // would rearrange itself on the day the wearable happens to cost more.
    const wearableAt = kinds.indexOf("wearable");
    if (wearableAt >= 0) expect(kinds.slice(0, wearableAt).every((k) => k === "tissue")).toBe(true);
  });

  it("gives a tiny cost at least one tick — a −1 nudge must be visible", () => {
    const d = readinessDeficit(LIGHT, { ...FRESH_BIO, hrv: { today: 60, baseline: 62, better: "high" } });
    for (const ticks of TICKS) {
      for (const s of readinessRingSegments(d, ticks)) expect(s.count).toBeGreaterThanOrEqual(1);
    }
  });

  it("carries the points beside each run, so an arc and a legend can't disagree", () => {
    const d = readinessDeficit(HEAVY, TIRED_BIO);
    const segs = readinessRingSegments(d);
    expect(segs[0].points).toBe(d.kept);
    expect(segs.slice(1).reduce((a, s) => a + s.points, 0)).toBe(d.deficit);
  });
});

describe("apportion — whole units that still sum to the total", () => {
  it("hands out every unit, largest remainder first", () => {
    expect(apportion([1, 1, 1], 10)).toEqual([4, 3, 3]);
    expect(apportion([67, 22, 8, 3], 32).reduce((a, b) => a + b, 0)).toBe(32);
  });

  it("is safe on the degenerate inputs a quiet day produces", () => {
    expect(apportion([], 10)).toEqual([]);
    expect(apportion([0, 0], 10)).toEqual([0, 0]);
    expect(apportion([1, 2], 0)).toEqual([0, 0]);
  });
});
