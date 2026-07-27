import { describe, it, expect } from "vitest";
import { GYM_EXERCISES } from "./exercise-db";
import {
  exerciseAnimation,
  exerciseArchetype,
  skeletonAt,
  SKETCH_ANIMATIONS,
  type Skeleton,
} from "./exercise-animation";

const finite = (n: number) => Number.isFinite(n);
const ptOk = (pt: { x: number; y: number }) => finite(pt.x) && finite(pt.y);
const skeletonOk = (s: Skeleton) =>
  [s.head, s.shoulder, s.elbow, s.hand, s.hip, s.knee, s.ankle, s.bar].every(ptOk);

describe("exercise animation", () => {
  it("resolves a skeleton animation for every gym exercise", () => {
    for (const e of GYM_EXERCISES) {
      const anim = exerciseAnimation(e.name);
      expect(anim, e.name).not.toBeNull();
      expect(anim?.kind, e.name).toBe("skeleton");
      if (anim?.kind === "skeleton") {
        expect(anim.frames.length, e.name).toBeGreaterThanOrEqual(1);
        expect(anim.cycleMs, e.name).toBeGreaterThan(0);
        for (const f of anim.frames) expect(skeletonOk(f), e.name).toBe(true);
      }
    }
  });

  it("returns null for a name the DB doesn't know", () => {
    expect(exerciseAnimation("Interpretive Dance")).toBeNull();
  });

  it("interpolates the skeleton to finite points across the whole loop and returns to the start", () => {
    for (const e of GYM_EXERCISES) {
      const anim = exerciseAnimation(e.name)!;
      if (anim.kind !== "skeleton") continue;
      for (let phase = 0; phase < 1; phase += 0.05) {
        expect(skeletonOk(skeletonAt(anim.frames, phase)), `${e.name}@${phase}`).toBe(true);
      }
      // phase 0 and phase 1 both sit at the first keyframe (a seamless loop)
      const start = skeletonAt(anim.frames, 0);
      const end = skeletonAt(anim.frames, 1);
      expect(start.hand.x).toBeCloseTo(end.hand.x, 5);
      expect(start.hip.y).toBeCloseTo(end.hip.y, 5);
    }
  });

  it("maps lifts to the right archetype", () => {
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
    expect(arch("Triceps Dip")).toBe("dip");
    expect(arch("Pull-Up")).toBe("pullV");
    expect(arch("Barbell Row")).toBe("pullH");
    expect(arch("Plank")).toBe("plank");
    expect(arch("Clean")).toBe("olympic");
  });

  it("prefers a registered sketch animation over the procedural skeleton (the swap seam)", () => {
    // The registry is empty by default; register one, confirm the resolver
    // returns it, then restore so the suite stays isolated.
    const sketch = { kind: "sketch" as const, archetype: "pressH" as const, frames: ["a", "b"], cycleMs: 2000 };
    SKETCH_ANIMATIONS["Bench Press"] = sketch;
    try {
      const anim = exerciseAnimation("Bench Press");
      expect(anim!.kind).toBe("sketch");
      expect(anim).toBe(sketch);
      // an unregistered lift still falls back to the skeleton
      expect(exerciseAnimation("Back Squat")!.kind).toBe("skeleton");
    } finally {
      delete SKETCH_ANIMATIONS["Bench Press"];
    }
  });
});
