import { describe, it, expect } from "vitest";
import { e1rm } from "./session";
import { bestE1rmMap, newPrsInSession, prsForSession, volumeByMuscle, exerciseHistory, newCardioPrsInSession } from "./records";
import type { LoggedSession } from "./session";

const squat = (load: string, reps: string): LoggedSession["blocks"][number] => ({
  kind: "strength",
  name: "Back Squat",
  sets: [{ load, reps }],
});

const session = (id: string, startedAt: string, blocks: LoggedSession["blocks"]): LoggedSession => ({
  id,
  title: "Lower",
  startedAt,
  blocks,
});

const s1 = session("1", "2026-05-20T10:00:00.000Z", [squat("100", "5")]); // e1rm ~117
const s2 = session("2", "2026-05-27T10:00:00.000Z", [squat("120", "3")]); // e1rm ~132 → PR
const s3 = session("3", "2026-06-03T10:00:00.000Z", [squat("110", "3")]); // e1rm ~121 → no PR

describe("personal records", () => {
  it("bestE1rmMap keeps the all-time best per lift", () => {
    const map = bestE1rmMap([s1, s2, s3]);
    expect(map.get("Back Squat")).toBe(Math.round(e1rm(120, 3)));
  });

  it("first time training a lift is a record (previous = null)", () => {
    const hits = newPrsInSession(s1, []);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.lift).toBe("Back Squat");
    expect(hits[0]!.previous).toBeNull();
    expect(hits[0]!.e1rm).toBe(Math.round(e1rm(100, 5)));
  });

  it("beating the prior best is a PR carrying the previous value", () => {
    const hits = newPrsInSession(s2, [s1]);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.previous).toBe(Math.round(e1rm(100, 5)));
    expect(hits[0]!.e1rm).toBe(Math.round(e1rm(120, 3)));
  });

  it("not beating the prior best yields no PR", () => {
    expect(newPrsInSession(s3, [s1, s2])).toEqual([]);
  });

  it("prsForSession only compares against earlier-dated sessions", () => {
    const all = [s1, s2, s3];
    expect(prsForSession(all, "2")).toHaveLength(1); // beat s1
    expect(prsForSession(all, "3")).toHaveLength(0); // s2 already higher
    expect(prsForSession(all, "1")).toHaveLength(1); // first ever
  });

  it("volumeByMuscle attributes set tonnage to every muscle a lift trains", () => {
    // Back Squat → quads, glutes, back. 100×5 = 500 kg to each.
    const v = volumeByMuscle([{ kind: "strength", name: "Back Squat", sets: [{ load: "100", reps: "5" }] }]);
    const byMuscle = Object.fromEntries(v.map((x) => [x.muscle, x.volume]));
    expect(byMuscle.quads).toBe(500);
    expect(byMuscle.glutes).toBe(500);
    expect(byMuscle.back).toBe(500);
    expect(byMuscle.chest).toBeUndefined();
  });

  it("volumeByMuscle sums across blocks and sorts strongest first", () => {
    const v = volumeByMuscle([
      { kind: "strength", name: "Back Squat", sets: [{ load: "100", reps: "5" }] }, // quads+glutes+back 500 each
      { kind: "strength", name: "Bench Press", sets: [{ load: "80", reps: "5" }] }, // chest+triceps+shoulders 400 each
      { kind: "conditioning", name: "Easy Run", minutes: 20 }, // ignored
    ]);
    expect(v[0]!.volume).toBeGreaterThanOrEqual(v[v.length - 1]!.volume);
    const quads = v.find((x) => x.muscle === "quads");
    expect(quads!.volume).toBe(500);
  });

  it("volumeByMuscle is bodyweight-aware: dips count bodyweight, planks never do", () => {
    // Without a bodyweight, a plain dip reads 0 (no muscle rows).
    expect(volumeByMuscle([{ kind: "strength", name: "Dip", sets: [{ load: "", reps: "10" }] }])).toEqual([]);
    // With 70 kg on file, 10 dips = 700 kg to triceps (primary) + chest.
    const withBw = volumeByMuscle([{ kind: "strength", name: "Dip", sets: [{ load: "", reps: "10" }] }], false, 70);
    const byMuscle = Object.fromEntries(withBw.map((x) => [x.muscle, x.volume]));
    expect(byMuscle.triceps).toBe(700);
    expect(byMuscle.chest).toBe(700);
    // A plank never counts (seconds aren't tonnage) even with a bodyweight.
    expect(volumeByMuscle([{ kind: "strength", name: "Plank", sets: [{ load: "", reps: "45" }] }], false, 70)).toEqual([]);
    // A weighted dip adds the plate on top of bodyweight: (70+20)×5 = 450.
    const weighted = volumeByMuscle([{ kind: "strength", name: "Weighted Dip", sets: [{ load: "20", reps: "5" }] }], false, 70);
    expect(weighted.find((x) => x.muscle === "triceps")!.volume).toBe(450);
  });

  it("exerciseHistory lists distinct exercises, most recent first, with counts", () => {
    const hist = exerciseHistory([s1, s2, s3]); // all Back Squat across 3 dates
    expect(hist).toHaveLength(1);
    expect(hist[0]!.name).toBe("Back Squat");
    expect(hist[0]!.count).toBe(3);
    expect(hist[0]!.lastUsed).toBe(s3.startedAt); // newest
  });

  it("exerciseHistory orders a newer custom lift ahead of an older one", () => {
    const a = session("p", "2026-05-01T10:00:00.000Z", [{ kind: "strength", name: "Zercher Squat", sets: [{ load: "60", reps: "5" }] }]);
    const b = session("q", "2026-06-01T10:00:00.000Z", [{ kind: "conditioning", name: "Sled Push", minutes: 10 }]);
    const hist = exerciseHistory([a, b]);
    expect(hist[0]!.name).toBe("Sled Push");
    expect(hist[0]!.kind).toBe("conditioning");
  });

  it("ranks bigger improvements first", () => {
    const multi = session("x", "2026-06-10T10:00:00.000Z", [
      squat("125", "3"), // big jump over 120x3
      { kind: "strength", name: "Bench Press", sets: [{ load: "80", reps: "5" }] }, // first time
    ]);
    const hits = newPrsInSession(multi, [s1, s2]);
    expect(hits.map((h) => h.lift)).toContain("Back Squat");
    expect(hits.map((h) => h.lift)).toContain("Bench Press");
  });
});

describe("cardio records", () => {
  const run = (id: string, startedAt: string, distance: number, minutes: number): LoggedSession => ({
    id,
    title: "Run",
    startedAt,
    blocks: [{ kind: "cardio", name: "Easy Run", distance, minutes }],
  });
  const r1 = run("1", "2026-05-01T10:00:00.000Z", 5, 30); // 6:00/km
  const r2 = run("2", "2026-05-08T10:00:00.000Z", 8, 48); // further → distance PR
  const r3 = run("3", "2026-05-15T10:00:00.000Z", 8, 44); // same distance, faster → pace PR
  const r4 = run("4", "2026-05-22T10:00:00.000Z", 3, 12); // short & quick → NOT a pace PR over 8k

  it("a furthest-ever run is a distance PR", () => {
    const hits = newCardioPrsInSession(r2, [r1]);
    expect(hits).toHaveLength(1);
    expect(hits[0]!).toMatchObject({ move: "Easy Run", kind: "distance", value: 8, previous: 5 });
  });
  it("a faster run over the same distance is a pace PR", () => {
    const hits = newCardioPrsInSession(r3, [r1, r2]);
    expect(hits).toHaveLength(1);
    expect(hits[0]!).toMatchObject({ kind: "pace", value: 330, previous: 360 }); // 44min/8km vs 48min/8km
  });
  it("a short fast jog does not fake a long-run pace PR", () => {
    expect(newCardioPrsInSession(r4, [r1, r2, r3])).toEqual([]);
  });
  it("the first run of a move is a distance first (previous = null)", () => {
    const hits = newCardioPrsInSession(r1, []);
    expect(hits[0]!).toMatchObject({ kind: "distance", previous: null });
  });
});
