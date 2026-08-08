import { describe, it, expect } from "vitest";
import { GYM_EXERCISES } from "./exercise-db";
import { EXERCISE_MARK_PATHS, exerciseMark, exerciseMarkPaths, type ExerciseMarkName } from "./exercise-marks";

const MARKS = Object.keys(EXERCISE_MARK_PATHS) as ExerciseMarkName[];

describe("exercise marks", () => {
  it("draws every mark with well-formed paths", () => {
    for (const mark of MARKS) {
      const paths = EXERCISE_MARK_PATHS[mark];
      expect(paths.length, mark).toBeGreaterThan(0);
      for (const d of paths) {
        expect(d.startsWith("M"), `${mark}: ${d}`).toBe(true);
        expect(d.trim().length, mark).toBeGreaterThan(4);
      }
    }
  });

  // The bug sport-marks.ts documents: ONE arc that returns to its own start
  // point is degenerate and silently renders NOTHING, so a closed circle has to
  // be drawn as two half-arcs. Open arcs (the kettlebell's handle) are fine —
  // what's banned is the single arc that closes on itself.
  it("never draws a circle as a single arc", () => {
    for (const mark of MARKS) {
      for (const d of EXERCISE_MARK_PATHS[mark]) {
        const start = d.match(/^M\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/);
        if (!start) continue;
        const arcs = (d.match(/A/g) ?? []).length;
        const closesOnStart = new RegExp(`${start[1]}[\\s,]+${start[2]}\\s*Z$`).test(d.trim());
        expect(arcs === 1 && closesOnStart, `${mark} draws a degenerate single-arc circle: ${d}`).toBe(false);
      }
    }
  });

  it("gives every gym exercise a mark", () => {
    for (const e of GYM_EXERCISES) {
      expect(exerciseMark(e.name), e.name).not.toBeNull();
      expect(exerciseMarkPaths(e.name).length, e.name).toBeGreaterThan(0);
    }
  });

  it("marks the implement, not the instance", () => {
    expect(exerciseMark("Bench Press")).toBe("barbell");
    expect(exerciseMark("DB Fly")).toBe("dumbbell");
    expect(exerciseMark("Cable Fly")).toBe("cable");
    expect(exerciseMark("Push-Up")).toBe("bodyweight");
    expect(exerciseMark("KB Swing")).toBe("kettlebell");
    expect(exerciseMark("Pec Deck")).toBe("machine");
    // the barbell family collapses to one drawing
    expect(exerciseMark("Smith Bench Press")).toBe("barbell");
  });

  it("resolves the tile the old initials collided on", () => {
    // "Cable Chest Press" and "Cable Crossover" both read CC. They ARE the same
    // gear, so one mark for both is the honest answer — but the pairs the
    // initials genuinely confused now separate.
    expect(exerciseMark("Cable Chest Press")).toBe(exerciseMark("Cable Crossover"));
    // "Decline Bench Press" (DB) vs "DB Fly" (DF) vs "Decline DB Press" (DD) —
    // three unrelated letter-pairs that told you nothing. Now: bar vs bells.
    expect(exerciseMark("Decline Bench Press")).toBe("barbell");
    expect(exerciseMark("DB Fly")).toBe("dumbbell");
    expect(exerciseMark("Decline DB Press")).toBe("dumbbell");
  });

  it("falls back to the sport's own mark, then to the neutral custom mark", () => {
    // A catalog sport reuses the mark its sport page already signs itself with.
    const swim = exerciseMarkPaths("Swimming");
    expect(swim.length).toBeGreaterThan(0);
    expect(swim).not.toEqual(EXERCISE_MARK_PATHS.custom);
    // A name nothing knows still draws something, so a tile can't render blank.
    expect(exerciseMark("Sandbag Shouldering")).toBeNull();
    expect(exerciseMarkPaths("Sandbag Shouldering")).toEqual(EXERCISE_MARK_PATHS.custom);
  });
});
