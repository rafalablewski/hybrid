import { describe, it, expect } from "vitest";
import { GYM_EXERCISES } from "./exercise-db";
import {
  exerciseAnatomy,
  muscleActivation,
  exerciseArchetype,
  skeletonAt,
  MUSCLE_LABEL,
  MUSCLE_SHORT,
  type Skeleton,
} from "./exercise-anatomy";

const finite = (n: number) => Number.isFinite(n);
const ptOk = (pt: { x: number; y: number }) => finite(pt.x) && finite(pt.y);
const skeletonOk = (s: Skeleton) =>
  [s.head, s.shoulder, s.elbow, s.hand, s.hip, s.knee, s.ankle, s.bar].every(ptOk);

describe("exercise anatomy", () => {
  it("resolves every gym exercise to an anatomy model", () => {
    for (const e of GYM_EXERCISES) {
      const a = exerciseAnatomy(e.name);
      expect(a, e.name).not.toBeNull();
      expect(a!.name).toBe(e.name);
    }
  });

  it("returns null for a name the DB doesn't know", () => {
    expect(exerciseAnatomy("Interpretive Dance")).toBeNull();
  });

  it("activation percentages sum to 100 for every exercise", () => {
    for (const e of GYM_EXERCISES) {
      const rows = muscleActivation(e);
      expect(rows.length, e.name).toBeGreaterThan(0);
      const sum = rows.reduce((s, r) => s + r.pct, 0);
      expect(sum, e.name).toBe(100);
    }
  });

  it("keeps the DB's primary muscles ahead of the secondary ones", () => {
    for (const e of GYM_EXERCISES) {
      const rows = muscleActivation(e);
      const firstSecondary = rows.findIndex((r) => r.tier === "secondary");
      const lastPrimary = rows.map((r) => r.tier).lastIndexOf("primary");
      if (firstSecondary >= 0 && lastPrimary >= 0) expect(lastPrimary, e.name).toBeLessThan(firstSecondary);
      // the top-listed muscle is a prime mover and carries the highest share
      expect(rows[0]!.tier, e.name).toBe("primary");
      const maxPct = Math.max(...rows.map((r) => r.pct));
      expect(rows[0]!.pct, e.name).toBe(maxPct);
    }
  });

  it("labels every muscle it can surface", () => {
    for (const e of GYM_EXERCISES) {
      for (const r of muscleActivation(e)) {
        expect(MUSCLE_LABEL[r.muscle]).toBeTruthy();
        expect(MUSCLE_SHORT[r.muscle]).toBeTruthy();
        expect(r.label).toBe(MUSCLE_LABEL[r.muscle]);
      }
    }
  });

  it("gives every exercise stabilizers, cues, an emphasis line and an animation", () => {
    for (const e of GYM_EXERCISES) {
      const a = exerciseAnatomy(e.name)!;
      expect(a.stabilizers.length, e.name).toBeGreaterThan(0);
      expect(a.cues.length, e.name).toBeGreaterThanOrEqual(3);
      expect(a.emphasis.length, e.name).toBeGreaterThan(0);
      expect(a.animation.frames.length, e.name).toBeGreaterThanOrEqual(1);
      expect(a.animation.cycleMs, e.name).toBeGreaterThan(0);
      for (const f of a.animation.frames) expect(skeletonOk(f), e.name).toBe(true);
    }
  });

  it("interpolates the skeleton to finite points across the whole loop and returns to the start", () => {
    for (const e of GYM_EXERCISES) {
      const { frames } = exerciseAnatomy(e.name)!.animation;
      for (let phase = 0; phase < 1; phase += 0.05) {
        expect(skeletonOk(skeletonAt(frames, phase)), `${e.name}@${phase}`).toBe(true);
      }
      // phase 0 and phase 1 both sit at the first keyframe (a seamless loop)
      const start = skeletonAt(frames, 0);
      const end = skeletonAt(frames, 1);
      expect(start.hand.x).toBeCloseTo(end.hand.x, 5);
      expect(start.hip.y).toBeCloseTo(end.hip.y, 5);
    }
  });

  it("maps isolation lifts to the right archetype", () => {
    const arch = (name: string) => exerciseArchetype(GYM_EXERCISES.find((e) => e.name === name)!);
    expect(arch("Barbell Curl")).toBe("curl");
    expect(arch("Triceps Pushdown")).toBe("extension");
    expect(arch("Lateral Raise")).toBe("raise");
    expect(arch("Standing Calf Raise")).toBe("calf");
    expect(arch("Back Squat")).toBe("squat");
    expect(arch("Deadlift")).toBe("hinge");
    expect(arch("Hip Thrust")).toBe("hipThrust");
    expect(arch("Bench Press")).toBe("pressH");
    expect(arch("Overhead Press")).toBe("pressV");
    expect(arch("Dip")).toBe("dip");
    expect(arch("Pull-Up")).toBe("pullV");
    expect(arch("Barbell Row")).toBe("pullH");
    expect(arch("Plank")).toBe("plank");
    expect(arch("Clean")).toBe("olympic");
  });
});
