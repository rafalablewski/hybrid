import { describe, it, expect } from "vitest";
import {
  sessionMuscleMap,
  sessionMuscleGlows,
  muscleBaseline,
  muscleCoverage,
  BASELINE_MIN_SESSIONS,
} from "./session-muscle-map";
import type { LoggedSession, SessionBlock } from "./engines/session";

const session = (id: string, startedAt: string, blocks: SessionBlock[]): LoggedSession => ({
  id,
  title: "Session",
  startedAt,
  completedAt: new Date(Date.parse(startedAt) + 60 * 60000).toISOString(),
  blocks,
});

const lift = (name: string, sets: { load: string; reps: string; role?: "warmup" }[]): SessionBlock => ({
  kind: "strength",
  name,
  sets: sets.map((s) => ({ load: s.load, reps: s.reps, ...(s.role ? { role: s.role } : {}) })),
});

const bench = (n = 3, load = "70", reps = "8") =>
  lift("Bench Press", Array.from({ length: n }, () => ({ load, reps })));

describe("sessionMuscleMap", () => {
  it("splits a lift's tonnage by that lift's own activation shares", () => {
    // 3 × 70 kg × 8 = 1 680 kg. Bench Press is chest 61 / triceps 22 / front delts 17.
    const map = sessionMuscleMap(session("s", "2026-08-18T18:00:00.000Z", [bench()]));
    expect(map.totalKg).toBe(1680);
    expect(map.muscles.map((m) => m.muscle)).toEqual(["chest", "triceps", "front-delts"]);
    expect(map.muscles.map((m) => m.pct)).toEqual([61, 22, 17]);
    expect(map.muscles.map((m) => m.volumeKg)).toEqual([1025, 370, 286]);
    expect(map.lead?.muscle).toBe("chest");
  });

  it("names the primary mover a driver and the rest assists", () => {
    const map = sessionMuscleMap(session("s", "2026-08-18T18:00:00.000Z", [bench()]));
    expect(map.muscles.find((m) => m.muscle === "chest")?.tier).toBe("driver");
    expect(map.muscles.find((m) => m.muscle === "triceps")?.tier).toBe("assist");
    expect(map.muscles.find((m) => m.muscle === "front-delts")?.tier).toBe("assist");
  });

  it("sums a whole session and always reads as a clean 100%", () => {
    const map = sessionMuscleMap(
      session("s", "2026-08-18T18:00:00.000Z", [
        bench(4),
        lift("Overhead Press", [{ load: "40", reps: "8" }, { load: "40", reps: "8" }]),
        lift("Triceps Pushdown", [{ load: "35", reps: "12" }]),
        lift("Lateral Raise", [{ load: "12", reps: "15" }]),
      ]),
    );
    expect(map.muscles.reduce((s, m) => s + m.pct, 0)).toBe(100);
    expect(map.lead?.muscle).toBe("chest");
    // Every muscle the four lifts name shows up, none that they don't.
    expect(new Set(map.muscles.map((m) => m.muscle))).toEqual(
      new Set(["chest", "triceps", "front-delts", "side-delts", "traps", "abs"]),
    );
  });

  it("counts a bilateral dumbbell lift's two bells, like every other tonnage site", () => {
    const one = sessionMuscleMap(session("s", "2026-08-18T18:00:00.000Z", [
      lift("DB Bench Press", [{ load: "24", reps: "10" }]),
    ]));
    // 24 kg per bell × 10 reps × 2 bells = 480 kg, not 240.
    expect(one.totalKg).toBe(480);
  });

  it("counts a bodyweight lift at the athlete's weight on the day", () => {
    const s = session("s", "2026-08-18T18:00:00.000Z", [
      lift("Pull-Up", [{ load: "0", reps: "10" }]),
    ]);
    const bare = sessionMuscleMap(s);
    const weighed = sessionMuscleMap(s, { bw: 82 });
    expect(bare.totalKg).toBe(0);
    expect(weighed.totalKg).toBe(820);
    expect(weighed.lead?.muscle).toBe("lats");
  });

  it("never attributes a lift the catalog does not know — it reports it", () => {
    const map = sessionMuscleMap(
      session("s", "2026-08-18T18:00:00.000Z", [
        bench(),
        lift("Sandbag Over Shoulder Toss", [{ load: "60", reps: "6" }]),
      ]),
    );
    expect(map.unmapped).toEqual(["Sandbag Over Shoulder Toss"]);
    // The known lift's tonnage only — the custom work is absent, not guessed.
    expect(map.totalKg).toBe(1680);
  });

  it("returns an empty map for a session with no mapped lifting", () => {
    const map = sessionMuscleMap(
      session("s", "2026-08-18T18:00:00.000Z", [
        { kind: "cardio", name: "Running", minutes: 40, distance: 8 },
      ]),
    );
    expect(map.muscles).toEqual([]);
    expect(map.lead).toBeNull();
    expect(map.totalKg).toBe(0);
  });

  it("excludes holds and carries — seconds times a load is not work", () => {
    const map = sessionMuscleMap(
      session("s", "2026-08-18T18:00:00.000Z", [bench(), lift("Plank", [{ load: "0", reps: "60" }])]),
    );
    expect(map.totalKg).toBe(1680);
    expect(map.muscles.some((m) => m.muscle === "abs")).toBe(false);
  });

  it("follows the athlete's own warm-up setting", () => {
    const s = session("s", "2026-08-18T18:00:00.000Z", [
      lift("Bench Press", [
        { load: "40", reps: "10", role: "warmup" },
        { load: "70", reps: "8" },
      ]),
    ]);
    expect(sessionMuscleMap(s).totalKg).toBe(560);
    expect(sessionMuscleMap(s, { includeWarmups: true }).totalKg).toBe(960);
  });
});

describe("sessionMuscleGlows", () => {
  it("normalises to the top mover, so the brightest muscle is the driver", () => {
    const map = sessionMuscleMap(session("s", "2026-08-18T18:00:00.000Z", [bench()]));
    const glow = sessionMuscleGlows(map);
    expect(glow[0]?.muscle).toBe("chest");
    expect(glow[0]?.intensity).toBe(1);
    expect(glow[0]?.side).toBe("front");
    // Triceps live on the back figure — the renderer needs the side, not a guess.
    expect(glow.find((g) => g.muscle === "triceps")?.side).toBe("back");
    expect(glow.every((g) => g.intensity > 0 && g.intensity <= 1)).toBe(true);
  });

  it("has nothing to draw for a session with no mapped lifting", () => {
    expect(sessionMuscleGlows({ muscles: [], totalKg: 0, lead: null, unmapped: [] })).toEqual([]);
  });
});

describe("muscleBaseline", () => {
  const now = new Date("2026-08-18T20:00:00.000Z");
  const history = [
    session("a", "2026-08-04T18:00:00.000Z", [bench(3)]),
    session("b", "2026-08-08T18:00:00.000Z", [bench(3)]),
    session("c", "2026-08-12T18:00:00.000Z", [bench(3)]),
    // A leg day in the window: it must not drag the chest average down.
    session("d", "2026-08-14T18:00:00.000Z", [lift("Back Squat", [{ load: "100", reps: "5" }])]),
    // Outside the 28-day window.
    session("old", "2026-05-01T18:00:00.000Z", [bench(10)]),
  ];

  it("averages only the sessions that trained the muscle", () => {
    const base = muscleBaseline(history, { now });
    expect(base.sessions.chest).toBe(3);
    expect(base.meanKg.chest).toBe(1025);
    expect(base.sessions.quads).toBe(1);
  });

  it("compares a session against its own recent norm", () => {
    const base = muscleBaseline(history, { now });
    // Twice the usual benching.
    const map = sessionMuscleMap(session("today", "2026-08-18T18:00:00.000Z", [bench(6)]), { baseline: base });
    expect(map.muscles.find((m) => m.muscle === "chest")?.deltaPct).toBe(100);
  });

  it("withholds a delta until the baseline is built from enough sessions", () => {
    const thin = muscleBaseline(history.slice(0, BASELINE_MIN_SESSIONS - 1), { now });
    const map = sessionMuscleMap(session("today", "2026-08-18T18:00:00.000Z", [bench(6)]), { baseline: thin });
    expect(map.muscles.find((m) => m.muscle === "chest")?.deltaPct).toBeNull();
  });

  it("reports no delta when no baseline was supplied", () => {
    const map = sessionMuscleMap(session("today", "2026-08-18T18:00:00.000Z", [bench()]));
    expect(map.muscles.every((m) => m.deltaPct === null)).toBe(true);
  });
});

describe("muscleCoverage", () => {
  const now = new Date("2026-08-18T20:00:00.000Z");

  it("counts only the sessions that DROVE a muscle, not the ones it assisted", () => {
    const rows = muscleCoverage([session("a", "2026-08-16T18:00:00.000Z", [bench()])], { now });
    const chest = rows.find((r) => r.muscle === "chest");
    const triceps = rows.find((r) => r.muscle === "triceps");
    expect(chest?.daysSince).toBe(2);
    // Benching does not train the triceps in the sense this read means.
    expect(triceps?.daysSince).toBeNull();
  });

  it("puts the never-trained first, and says so with a null rather than a number", () => {
    const rows = muscleCoverage([session("a", "2026-08-16T18:00:00.000Z", [bench()])], { now });
    expect(rows[0]?.daysSince).toBeNull();
    expect(rows[rows.length - 1]?.muscle).toBe("chest");
    expect(rows.find((r) => r.muscle === "hamstrings")?.lastAt).toBeNull();
  });
});
