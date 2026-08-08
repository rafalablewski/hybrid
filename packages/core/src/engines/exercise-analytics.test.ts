import { describe, it, expect } from "vitest";
import {
  e1rmTrendWithPRs,
  repMaxMatrix,
  loadRepsScatter,
  weeklyTonnage,
  intensityDistribution,
  tonnageSurface,
  exerciseConsistency,
  paceCurve,
  recentRunDeltas,
  blockCompare,
  e1rmPointReading,
  pacePointReading,
} from "./exercise-analytics";
import type { LoggedSession, StrengthSet } from "./session";

const DAY = 86_400_000;
// A fixed local Wednesday noon so week bucketing is deterministic in any TZ.
const now = new Date(2026, 5, 17, 12).getTime();

let id = 0;
const lift = (daysAgo: number, sets: Partial<StrengthSet>[], name = "Deadlift"): LoggedSession => ({
  id: `s${id++}`,
  title: "S",
  startedAt: new Date(now - daysAgo * DAY).toISOString(),
  blocks: [{ kind: "strength", name, sets: sets.map((s) => ({ load: "100", reps: "5", ...s })) }],
});
const run = (daysAgo: number, km: number, minutes: number, name = "Run"): LoggedSession => ({
  id: `r${id++}`,
  title: "R",
  startedAt: new Date(now - daysAgo * DAY).toISOString(),
  blocks: [{ kind: "cardio", name, distance: km, minutes }],
});

describe("e1rmTrendWithPRs", () => {
  it("flags sessions that beat the all-time best, never the first session", () => {
    const sessions = [lift(30, [{ load: "100", reps: "5" }]), lift(20, [{ load: "90", reps: "5" }]), lift(10, [{ load: "110", reps: "5" }])];
    const pts = e1rmTrendWithPRs(sessions, "Deadlift", "all", now);
    expect(pts.map((p) => p.pr)).toEqual([false, false, true]);
    expect(pts[2]!.e1rm).toBe(Math.round(110 * (1 + 5 / 30)));
  });

  it("judges PRs against history OUTSIDE the window too", () => {
    const sessions = [lift(400, [{ load: "120", reps: "5" }]), lift(10, [{ load: "110", reps: "5" }])];
    const pts = e1rmTrendWithPRs(sessions, "Deadlift", "8w", now);
    expect(pts).toHaveLength(1);
    expect(pts[0]!.pr).toBe(false); // 110×5 never beat the old 120×5
  });
});

describe("repMaxMatrix", () => {
  it("keeps the best load per rep count and flags freshness", () => {
    const sessions = [
      lift(200, [{ load: "150", reps: "1" }, { load: "120", reps: "5" }]),
      lift(7, [{ load: "160", reps: "1" }]),
    ];
    const m = repMaxMatrix(sessions, "Deadlift", now);
    expect(m[0]).toMatchObject({ reps: 1, loadKg: 160, recent: true });
    expect(m[4]).toMatchObject({ reps: 5, loadKg: 120, recent: false });
    expect(m[9]).toBeNull(); // 10RM never attempted
  });

  it("ignores warm-ups", () => {
    const m = repMaxMatrix([lift(5, [{ load: "180", reps: "1", role: "warmup" }, { load: "140", reps: "1" }])], "Deadlift", now);
    expect(m[0]!.loadKg).toBe(140);
  });
});

describe("loadRepsScatter", () => {
  it("returns the set cloud with recency + nice isolines", () => {
    const sessions = [lift(100, [{ load: "100", reps: "10" }]), lift(5, [{ load: "150", reps: "2" }])];
    const map = loadRepsScatter(sessions, "Deadlift", now);
    expect(map.points).toHaveLength(2);
    expect(map.points[0]).toMatchObject({ reps: 10, loadKg: 100, recent: false });
    expect(map.points[1]).toMatchObject({ reps: 2, loadKg: 150, recent: true });
    // best e1RM = 160 → isolines snap to tens ending at 160
    expect(map.isolines[map.isolines.length - 1]).toBe(160);
    expect(map.isolines.every((v) => v % 10 === 0)).toBe(true);
  });
});

describe("weeklyTonnage", () => {
  it("buckets tonnage into Monday weeks and splits hard (RPE ≥ 8) from base", () => {
    const sessions = [lift(1, [{ load: "100", reps: "5", rpe: "9" }, { load: "80", reps: "5", rpe: "6" }, { load: "60", reps: "5" }])];
    const rows = weeklyTonnage(sessions, "Deadlift", 4, now);
    expect(rows).toHaveLength(4);
    const last = rows[rows.length - 1]!;
    expect(last.hardKg).toBe(500);
    expect(last.baseKg).toBe(700); // RPE 6 set + no-RPE set
    expect(rows[0]!.baseKg + rows[0]!.hardKg).toBe(0);
  });
});

describe("intensityDistribution", () => {
  it("measures sets against the ROLLING best e1RM and shares sum to 1", () => {
    const sessions = [
      lift(50, [{ load: "100", reps: "1" }]), // establishes e1RM ≈ 103
      lift(10, [{ load: "95", reps: "1" }, { load: "50", reps: "1" }]),
    ];
    const zones = intensityDistribution(sessions, "Deadlift", "all", now);
    const total = zones.reduce((a, z) => a + z.share, 0);
    expect(total).toBeCloseTo(1, 5);
    expect(zones.find((z) => z.zone === "90")!.count).toBeGreaterThanOrEqual(2); // both 100×1 and 95×1
    expect(zones.find((z) => z.zone === "<60")!.count).toBe(1); // the 50 kg single
  });
});

describe("tonnageSurface", () => {
  it("builds a bins × weeks grid of tonnage", () => {
    const sessions = [lift(1, [{ load: "100", reps: "2" }, { load: "80", reps: "8" }])];
    const s = tonnageSurface(sessions, "Deadlift", 6, now);
    expect(s.weeks).toHaveLength(6);
    expect(s.bins).toEqual(["1–3", "4–6", "7–10", "11+"]);
    expect(s.grid[0]![5]).toBe(200); // 100×2 in the current week, 1–3 bin
    expect(s.grid[2]![5]).toBe(640); // 80×8 in the 7–10 bin
    expect(s.maxKg).toBe(640);
  });
});

describe("exerciseConsistency", () => {
  it("computes streak, frequency and gaps for one movement only", () => {
    const sessions = [
      lift(0, [{}]),
      lift(7, [{}]),
      lift(14, [{}]),
      lift(2, [{}], "Bench Press"), // other lift — must not count
    ];
    const c = exerciseConsistency(sessions, "Deadlift", 8, now);
    expect(c.heat).toHaveLength(8);
    expect(c.weekStreak).toBeGreaterThanOrEqual(3);
    expect(c.activeDays).toBe(3);
    expect(c.longestGapDays).toBe(6);
    expect(c.perWeek).toBeCloseTo(0.4, 5);
  });
});

describe("paceCurve", () => {
  it("keeps the best pace per distance band, all-time vs last 8 weeks", () => {
    const sessions = [
      run(200, 5, 25), // 5:00/km all-time 5K best
      run(10, 5, 26), // 5:12/km recent
      run(5, 10, 55), // 5:30/km 10K
    ];
    const bands = paceCurve(sessions, "Run", now);
    const b5 = bands.find((b) => b.label === "5K")!;
    expect(b5.bestAllSec).toBe(300);
    expect(b5.bestRecentSec).toBe(312);
    expect(bands.find((b) => b.label === "10K")!.bestAllSec).toBe(330);
    expect(bands.find((b) => b.label === "≤1K")).toBeUndefined(); // never run
  });
});

describe("recentRunDeltas", () => {
  it("compares the last runs to their own average pace", () => {
    const sessions = [run(3, 5, 25), run(2, 5, 26), run(1, 5, 24)];
    const d = recentRunDeltas(sessions, "Run", 10, now);
    expect(d.avgSec).toBe(300);
    expect(d.runs.map((r) => r.deltaSec)).toEqual([0, 12, -12]);
  });

  it("is empty-safe", () => {
    expect(recentRunDeltas([], "Run", 10, now)).toEqual({ avgSec: null, runs: [] });
  });
});

describe("blockCompare", () => {
  it("splits strength history into this block vs the previous one", () => {
    const sessions = [
      lift(70, [{ load: "100", reps: "5", rpe: "9" }]), // previous block
      lift(7, [{ load: "110", reps: "5", rpe: "9" }, { load: "90", reps: "5" }]), // current
    ];
    const c = blockCompare(sessions, "Deadlift", 8, now);
    if (c.kind !== "strength") throw new Error("expected strength");
    expect(c.cur.volumeKg).toBe(1000);
    expect(c.prev.volumeKg).toBe(500);
    expect(c.cur.bestE1rm).toBeGreaterThan(c.prev.bestE1rm);
    expect(c.cur.hardSets).toBe(1);
    expect(c.weeklyCur).toHaveLength(8);
    expect(c.weeklyCur.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(c.weeklyPrev.reduce((a, b) => a + b, 0)).toBe(500);
  });

  it("splits cardio history with pace + distance metrics", () => {
    const sessions = [run(70, 8, 42), run(10, 10, 50), run(3, 6, 29)];
    const c = blockCompare(sessions, "Run", 8, now);
    if (c.kind !== "cardio") throw new Error("expected cardio");
    expect(c.cur.runs).toBe(2);
    expect(c.cur.distanceKm).toBe(16);
    expect(c.prev.runs).toBe(1);
    expect(c.prev.avgPaceSec).toBe(315);
    expect(c.cur.bestPaceSec).toBe(290);
  });
});

describe("holding a session's per-lift trend", () => {
  const lifts = [
    { date: "2026-05-04T10:00:00.000Z", e1rm: 182.5 },
    { date: "2026-05-18T10:00:00.000Z", e1rm: 195 },
    { date: "2026-06-01T10:00:00.000Z", e1rm: 190 },
  ];
  const paces = [
    { date: "2026-05-04T10:00:00.000Z", secPerKm: 342 },
    { date: "2026-05-18T10:00:00.000Z", secPerKm: 318 },
    { date: "2026-06-01T10:00:00.000Z", secPerKm: 327 },
  ];

  it("reads an e1RM point in the athlete's unit and calls the PEAK the best", () => {
    expect(e1rmPointReading(lifts, 1, "kg")).toMatchObject({ value: "195", unit: "kg", best: true });
    expect(e1rmPointReading(lifts, 2, "kg")!.best).toBe(false);
    expect(e1rmPointReading(lifts, 0, "lb")!.unit).toBe("lb");
    expect(e1rmPointReading(lifts, 3, "kg")).toBeNull();
  });

  it("reads a pace point at the clock — FASTEST is the best, not latest", () => {
    expect(pacePointReading(paces, 1)).toMatchObject({ value: "5:18", unit: "/km", best: true });
    expect(pacePointReading(paces, 2)!.best).toBe(false);
    expect(pacePointReading(paces, 0)!.weekStart).toBe(paces[0]!.date);
    expect(pacePointReading([], 0)).toBeNull();
  });
});
