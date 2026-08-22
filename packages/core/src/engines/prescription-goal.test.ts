import { describe, it, expect } from "vitest";
import { prescribeSession } from "./prescription";
import { SAMPLE_TRAINING_LOG } from "./sample-data";
import type { PrescribedBlock } from "./types";

/**
 * THE GOAL REACHING THE PRESCRIPTION ENGINE.
 *
 * `PrescribeOptions` had no goal field at all until Aug 2026, which meant the
 * engine that designs an athlete's session could not tell a powerlifter from a
 * triathlete. These tests hold the two ends of that: a goal must CHANGE the
 * session, and it must change it by a bounded amount — the readiness and
 * progression signals still decide the session, the goal only shapes it.
 */

const strengthBlock = (blocks: PrescribedBlock[]) => blocks.find((b) => b.kind === "strength")!;
const condBlock = (blocks: PrescribedBlock[]) =>
  blocks.find((b) => b.kind === "conditioning" || b.kind === "cardio")!;

describe("no goal", () => {
  it("prescribes exactly what it prescribed before the goal existed", () => {
    const before = prescribeSession(SAMPLE_TRAINING_LOG, undefined, { experience: "intermediate" });
    const after = prescribeSession(SAMPLE_TRAINING_LOG, undefined, {
      experience: "intermediate",
      goal: null,
    });
    expect(after.blocks).toEqual(before.blocks);
  });

  it("is also unchanged for a concurrent goal, deliberately", () => {
    // The engine's existing balance IS the concurrent one. A hybrid athlete is
    // the athlete this app was designed around, so wiring the goal in must be a
    // no-op for them rather than a silent re-tune of the default.
    const none = prescribeSession(SAMPLE_TRAINING_LOG, undefined, { experience: "intermediate" });
    const hybrid = prescribeSession(SAMPLE_TRAINING_LOG, undefined, {
      experience: "intermediate",
      goal: "hybrid",
    });
    expect(hybrid.blocks).toEqual(none.blocks);
  });
});

describe("a goal changes the session", () => {
  const rx = (goal: string) =>
    prescribeSession(SAMPLE_TRAINING_LOG, undefined, { experience: "intermediate", goal });

  it("gives a powerlifter more sets on the bar than a marathoner", () => {
    expect(strengthBlock(rx("power").blocks).sets!.length).toBeGreaterThan(
      strengthBlock(rx("run").blocks).sets!.length,
    );
  });

  it("gives a powerlifter a heavier bar than a marathoner", () => {
    const load = (goal: string) => Number(strengthBlock(rx(goal).blocks).sets![0]!.load);
    expect(load("power")).toBeGreaterThan(load("run"));
  });

  it("puts an endurance athlete on the aerobic system even when it is not the freshest", () => {
    // A log where aerobic is neither the freshest nor the most fatigued:
    // anaerobic is cooked, threshold is untouched, aerobic sits between them.
    // Without a goal the engine rotates onto threshold. A runner should still
    // be running — rotating them onto the rower because the rower is fresher
    // trains the wrong thing.
    const log = [
      { daysAgo: 1, items: [
        { move: "Back Squat", e1rm: 150, topRpe: 8, hardSets: 4 },
        { move: "Assault Bike", system: "anaerobic" as const, minutes: 20, rpe: 9 },
      ] },
      { daysAgo: 2, items: [{ move: "Easy Run", system: "aerobic" as const, minutes: 30, rpe: 5 }] },
    ];
    expect(condBlock(prescribeSession(log, undefined, {}).blocks).kind).toBe("conditioning");
    expect(condBlock(prescribeSession(log, undefined, { goal: "run" }).blocks).kind).toBe("cardio");
  });

  it("still rotates an endurance athlete off aerobic on the day it is the most fatigued", () => {
    // The one exception, and it is the point of the rule rather than a hole in
    // it: a runner who has run themselves into the ground gets the rotation.
    const log = [
      { daysAgo: 1, items: [
        { move: "Back Squat", e1rm: 150, topRpe: 8, hardSets: 4 },
        { move: "Easy Run", system: "aerobic" as const, minutes: 90, rpe: 8 },
      ] },
      { daysAgo: 1, items: [{ move: "Easy Run", system: "aerobic" as const, minutes: 80, rpe: 8 }] },
    ];
    expect(condBlock(prescribeSession(log, undefined, { goal: "run" }).blocks).kind).toBe("conditioning");
  });

  it("names the goal in the explanation", () => {
    // A session shaped by something the athlete chose has to say so, or the
    // shaping is indistinguishable from the engine being inconsistent.
    expect(rx("hybrid").why).toContain("Hybrid Athlete");
    expect(prescribeSession(SAMPLE_TRAINING_LOG, undefined, {}).why).not.toContain("aimed at");
  });
});

describe("the goal shapes, it does not overrule", () => {
  const goals = ["power", "run", "hybrid", "fitness", "prenatal", "oly"];

  it("never moves the strength block outside the engine's own clamp", () => {
    for (const goal of goals) {
      const sets = strengthBlock(
        prescribeSession(SAMPLE_TRAINING_LOG, undefined, { experience: "intermediate", goal }).blocks,
      ).sets!.length;
      expect(sets).toBeGreaterThanOrEqual(2);
      expect(sets).toBeLessThanOrEqual(6);
    }
  });

  it("moves the load by less than the readiness signal can", () => {
    // A wrecked check-in must remain the larger correction: an athlete's state
    // today outranks what they are training for in general.
    const base = Number(
      strengthBlock(prescribeSession(SAMPLE_TRAINING_LOG, undefined, {}).blocks).sets![0]!.load,
    );
    const wrecked = Number(
      strengthBlock(
        prescribeSession(SAMPLE_TRAINING_LOG, undefined, { subjectiveReadiness: "wrecked" }).blocks,
      ).sets![0]!.load,
    );
    const byGoal = goals.map((goal) =>
      Math.abs(
        Number(strengthBlock(prescribeSession(SAMPLE_TRAINING_LOG, undefined, { goal }).blocks).sets![0]!.load) -
          base,
      ),
    );
    expect(Math.max(...byGoal)).toBeLessThan(Math.abs(base - wrecked));
  });

  it("keeps conditioning rounds inside a sane band for every goal", () => {
    for (const goal of goals) {
      const b = condBlock(prescribeSession(SAMPLE_TRAINING_LOG, undefined, { goal }).blocks);
      if (b.kind === "conditioning") {
        expect(b.rounds!).toBeGreaterThanOrEqual(4);
        expect(b.rounds!).toBeLessThanOrEqual(12);
      }
    }
  });

  it("accepts a legacy display name as well as an id", () => {
    const byId = prescribeSession(SAMPLE_TRAINING_LOG, undefined, { goal: "power" });
    const byName = prescribeSession(SAMPLE_TRAINING_LOG, undefined, { goal: "Powerlifting" });
    expect(byName.blocks).toEqual(byId.blocks);
  });
});
