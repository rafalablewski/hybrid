import { describe, it, expect } from "vitest";
import { EMPHASIS_BY_GOAL, emphasisFor, goalProfile, hpiWeightsFor } from "./goal-profile";
import { GOAL_TREE } from "./plans";
import { HYBRID_WEIGHTS, STRENGTH_WEIGHTS, ENDURANCE_WEIGHTS } from "./engines/hpi";
import { modelFor, PHASE_MODELS } from "./engines/periodization";

describe("coverage", () => {
  // THE TEST THE OLD TABLE NEVER HAD. `MODEL_FOR` covered seven of nineteen
  // goals and defaulted the rest, so twelve wrong answers were invisible. If
  // GOAL_TREE gains a goal, this fails until the classification names it.
  it("names every goal in the library", () => {
    const missing = GOAL_TREE.filter((g) => EMPHASIS_BY_GOAL[g.id] === undefined).map((g) => g.id);
    expect(missing).toEqual([]);
  });

  it("names nothing that is not a goal", () => {
    // The map it replaced still listed Climbing, BJJ, Boxing and Hybrid — four
    // sports from a taxonomy the goal tree had already replaced.
    const ids = new Set(GOAL_TREE.map((g) => g.id));
    const orphans = Object.keys(EMPHASIS_BY_GOAL).filter((k) => !ids.has(k));
    expect(orphans).toEqual([]);
  });

  it("resolves every goal to a phase model that exists", () => {
    for (const g of GOAL_TREE) {
      expect(PHASE_MODELS[goalProfile(g.id).model]).toBeDefined();
    }
  });
});

describe("the goals the old default got wrong", () => {
  it("no longer periodises the flagship goal as a powerlifter", () => {
    // The old map said "Hybrid"; the goal is called "Hybrid Athlete", so it
    // missed by one word and fell through to the strength model.
    expect(emphasisFor("hybrid")).toBe("concurrent");
    expect(emphasisFor("Hybrid Athlete")).toBe("concurrent");
    expect(modelFor("hybrid").name).toBe("Concurrent model");
  });

  it("does not ramp a pre/postnatal athlete to a maximal test week", () => {
    expect(emphasisFor("prenatal")).toBe("general");
    const phases = modelFor("prenatal").phases;
    expect(phases.some((p) => p.key === "peak")).toBe(false);
    expect(phases.some((p) => p.key === "taper")).toBe(false);
    // And nothing in it approaches maximal.
    expect(Math.max(...phases.map((p) => p.intensity))).toBeLessThan(80);
  });

  it("gives the other concurrent goals the concurrent model", () => {
    for (const id of ["crossfit", "tactical", "sport", "kettlebell"]) {
      expect(emphasisFor(id)).toBe("concurrent");
    }
  });

  it("treats fat loss as general rather than strength", () => {
    // Conditioning-heavy, in an energy deficit, with no event to peak for.
    expect(emphasisFor("fatloss")).toBe("general");
  });

  it("keeps the seven the old map got right", () => {
    expect(emphasisFor("power")).toBe("strength");
    expect(emphasisFor("bb")).toBe("strength");
    for (const id of ["run", "cycling", "swim", "hyrox", "tri"]) {
      expect(emphasisFor(id)).toBe("endurance");
    }
  });
});

describe("freshness weighting", () => {
  it("scores a powerlifter on the strength weighting", () => {
    expect(hpiWeightsFor("power")).toBe(STRENGTH_WEIGHTS);
  });

  it("scores a marathoner on the endurance weighting", () => {
    expect(hpiWeightsFor("run")).toBe(ENDURANCE_WEIGHTS);
  });

  it("scores a hybrid athlete on the hybrid weighting", () => {
    expect(hpiWeightsFor("hybrid")).toBe(HYBRID_WEIGHTS);
  });

  it("falls back to the hybrid weighting with no goal — what everyone got before", () => {
    expect(hpiWeightsFor(null)).toBe(HYBRID_WEIGHTS);
    expect(hpiWeightsFor(undefined)).toBe(HYBRID_WEIGHTS);
  });

  it("gives a strength and an endurance goal genuinely different weightings", () => {
    expect(hpiWeightsFor("power").strength).toBeGreaterThan(hpiWeightsFor("run").strength);
    expect(hpiWeightsFor("run").endurance).toBeGreaterThan(hpiWeightsFor("power").endurance);
  });
});

describe("prescription bias", () => {
  it("adds work to the bar for a strength goal and takes it off for an endurance one", () => {
    expect(goalProfile("power").bias.setAdj).toBeGreaterThan(goalProfile("run").bias.setAdj);
    expect(goalProfile("power").bias.pctAdj).toBeGreaterThan(goalProfile("run").bias.pctAdj);
  });

  it("favours the aerobic system only for goals whose objective is the engine", () => {
    expect(goalProfile("run").bias.preferAerobic).toBe(true);
    expect(goalProfile("tri").bias.preferAerobic).toBe(true);
    expect(goalProfile("power").bias.preferAerobic).toBe(false);
    expect(goalProfile("hybrid").bias.preferAerobic).toBe(false);
  });

  it("leaves a concurrent athlete exactly where the engine already was", () => {
    // Deliberate: the engine's existing balance IS the concurrent one, so this
    // change must be a no-op for the athlete the app was designed around.
    const b = goalProfile("hybrid").bias;
    expect(b).toEqual({ setAdj: 0, pctAdj: 0, condRoundsAdj: 0, preferAerobic: false });
  });

  it("keeps every bias inside one step of the experience tier's own range", () => {
    // The goal should shape a session, not overrule the readiness and
    // progression signals that decide it. `experience` moves ±1 set and ±5%.
    for (const g of GOAL_TREE) {
      const b = goalProfile(g.id).bias;
      expect(Math.abs(b.setAdj)).toBeLessThanOrEqual(1);
      expect(Math.abs(b.pctAdj)).toBeLessThanOrEqual(0.05);
      expect(Math.abs(b.condRoundsAdj)).toBeLessThanOrEqual(2);
    }
  });
});

describe("free text", () => {
  it("gives a coach's own goal the balanced treatment rather than a guess", () => {
    expect(emphasisFor("Return from ACL, phase 2")).toBe("concurrent");
    expect(hpiWeightsFor("Return from ACL, phase 2")).toBe(HYBRID_WEIGHTS);
  });
});
