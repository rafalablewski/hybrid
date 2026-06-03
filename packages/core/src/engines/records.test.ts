import { describe, it, expect } from "vitest";
import { e1rm } from "./session";
import { bestE1rmMap, newPrsInSession, prsForSession, volumeByMuscle } from "./records";
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
