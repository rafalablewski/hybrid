import { describe, it, expect } from "vitest";
import { GYM_EXERCISES } from "./exercise-db";
import { exerciseAnatomy, muscleActivation, MUSCLE_LABEL, MUSCLE_SHORT } from "./exercise-anatomy";

describe("exercise anatomy (muscles / stabilizers / cues)", () => {
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

  it("gives every exercise stabilizers, cues and an emphasis line", () => {
    for (const e of GYM_EXERCISES) {
      const a = exerciseAnatomy(e.name)!;
      expect(a.stabilizers.length, e.name).toBeGreaterThan(0);
      expect(a.cues.length, e.name).toBeGreaterThanOrEqual(3);
      expect(a.emphasis.length, e.name).toBeGreaterThan(0);
      expect(a.archetype, e.name).toBeTruthy();
    }
  });
});
