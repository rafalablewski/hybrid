import { describe, it, expect } from "vitest";
import {
  VOLUME_LANDMARKS,
  weeklySetsByMuscle,
  classifyVolume,
  muscleVolumeStatus,
  volumeStatus,
  volumeAdvice,
  resolveLandmarks,
  sanitizeLandmarkOverrides,
} from "./landmarks";
import type { LoggedSession } from "./session";

const NOW = new Date("2026-06-16T12:00:00.000Z").getTime();
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

// 3 working sets of Bench Press (chest/triceps/shoulders), this week. Plus a
// warm-up that must NOT count, and an empty set that must NOT count.
const bench = (when: string): LoggedSession => ({
  id: when,
  title: "Push",
  startedAt: when,
  blocks: [
    {
      kind: "strength",
      name: "Bench Press",
      sets: [
        { load: "60", reps: "10", role: "warmup" }, // excluded
        { load: "100", reps: "5" },
        { load: "100", reps: "5" },
        { load: "100", reps: "5" },
        { load: "", reps: "" }, // empty, excluded
      ],
    },
  ],
});

describe("volume landmarks", () => {
  it("counts working sets per muscle in the last 7 days, excluding warm-ups + empties", () => {
    const counts = weeklySetsByMuscle([bench(daysAgo(1)), bench(daysAgo(3))], { now: NOW });
    // 3 working sets × 2 sessions = 6 sets toward each of chest/triceps/shoulders.
    expect(counts.get("chest")).toBe(6);
    expect(counts.get("triceps")).toBe(6);
    expect(counts.get("shoulders")).toBe(6);
    expect(counts.get("quads")).toBeUndefined();
  });

  it("includeWarmups counts warm-up/cool-down sets toward volume when opted in", () => {
    const excluded = weeklySetsByMuscle([bench(daysAgo(1))], { now: NOW });
    const included = weeklySetsByMuscle([bench(daysAgo(1))], { now: NOW, includeWarmups: true });
    expect(excluded.get("chest")).toBe(3); // 3 working sets
    expect(included.get("chest")).toBe(4); // + the warm-up
  });

  it("ignores sessions outside the window", () => {
    const counts = weeklySetsByMuscle([bench(daysAgo(1)), bench(daysAgo(20))], { now: NOW });
    expect(counts.get("chest")).toBe(3); // only the recent one
  });

  it("classifyVolume maps counts to zones around the landmarks", () => {
    const l = VOLUME_LANDMARKS.chest; // mev 8, mavHigh 18, mrv 20
    expect(classifyVolume(4, l)).toBe("under");
    expect(classifyVolume(12, l)).toBe("productive");
    expect(classifyVolume(19, l)).toBe("peak");
    expect(classifyVolume(20, l)).toBe("overreaching");
  });

  it("prescribes ADD below MEV, toward the productive range", () => {
    const s = muscleVolumeStatus("chest", 4); // under MEV (8)
    expect(s.zone).toBe("under");
    expect(s.action).toBe("add");
    expect(s.recommendedSets).toBe(VOLUME_LANDMARKS.chest.mavLow);
    expect(s.deltaSets).toBeGreaterThan(0);
  });

  it("flags maintaining when between MV and MEV", () => {
    const s = muscleVolumeStatus("chest", 7); // mv 6, mev 8 → maintaining
    expect(s.maintaining).toBe(true);
    expect(s.action).toBe("add");
  });

  it("prescribes REDUCE at/over MRV (deload to the top of MAV)", () => {
    const s = muscleVolumeStatus("chest", 22); // over mrv 20
    expect(s.zone).toBe("overreaching");
    expect(s.action).toBe("reduce");
    expect(s.recommendedSets).toBe(VOLUME_LANDMARKS.chest.mavHigh);
    expect(s.deltaSets).toBeLessThan(0);
  });

  it("resolveLandmarks merges overrides onto defaults and clamps the ordering", () => {
    const lm = resolveLandmarks({ chest: { mev: 12, mrv: 28 } });
    expect(lm.chest.mev).toBe(12);
    expect(lm.chest.mrv).toBe(28);
    expect(lm.back).toEqual(VOLUME_LANDMARKS.back); // untouched
    // an inverted edit is clamped monotonic (mev can't exceed mavLow→…)
    const bad = resolveLandmarks({ quads: { mev: 99 } });
    expect(bad.quads.mavLow).toBeGreaterThanOrEqual(bad.quads.mev);
    expect(bad.quads.mrv).toBeGreaterThanOrEqual(bad.quads.mavHigh);
  });

  it("sanitizeLandmarkOverrides drops unknown muscles + non-numbers", () => {
    const o = sanitizeLandmarkOverrides({ chest: { mev: 10, bogus: 1 }, notamuscle: { mev: 5 }, back: { mev: "x" } });
    expect(o.chest).toEqual({ mev: 10 });
    expect((o as Record<string, unknown>).notamuscle).toBeUndefined();
    expect(o.back).toBeUndefined();
  });

  it("volumeStatus honours a custom landmark map", () => {
    // raise chest MRV so 21 sets is no longer overreaching
    const lm = resolveLandmarks({ chest: { mrv: 30, mavHigh: 26 } });
    const block = { kind: "strength", name: "Bench Press", sets: Array.from({ length: 21 }, () => ({ load: "100", reps: "5" })) } as const;
    const s = volumeStatus([{ id: "x", title: "P", startedAt: daysAgo(1), blocks: [block] }], { now: NOW, landmarks: lm }).find((r) => r.muscle === "chest")!;
    expect(s.zone).not.toBe("overreaching");
  });

  it("volumeStatus returns one row per muscle group", () => {
    const rows = volumeStatus([bench(daysAgo(1))], { now: NOW });
    expect(rows).toHaveLength(7);
    expect(rows.every((r) => r.landmark && typeof r.sets === "number")).toBe(true);
  });

  it("volumeAdvice surfaces only actionable muscles, over-MRV before under-MEV", () => {
    // Chest pushed over MRV; everything else under-trained this week.
    const over: LoggedSession = {
      id: "over",
      title: "Chest blast",
      startedAt: daysAgo(1),
      blocks: [
        {
          kind: "strength",
          name: "Bench Press",
          sets: Array.from({ length: 24 }, () => ({ load: "100", reps: "5" })),
        },
      ],
    };
    const advice = volumeAdvice([over], { now: NOW });
    // Bench hits chest/triceps/shoulders → all pushed over MRV (reduce); the
    // untrained muscles are under MEV (add). Over-MRV must rank before under-MEV.
    expect(advice[0]!.action).toBe("reduce");
    expect(advice.find((a) => a.muscle === "chest")!.action).toBe("reduce");
    const lastReduce = advice.map((a) => a.action).lastIndexOf("reduce");
    const firstAdd = advice.findIndex((a) => a.action === "add");
    expect(lastReduce).toBeLessThan(firstAdd);
    expect(advice.every((a) => a.action === "add" || a.action === "reduce")).toBe(true);
  });
});
