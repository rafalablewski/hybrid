import { describe, it, expect } from "vitest";
import {
  RTP_STAGES,
  RTP_GATES,
  evaluateRtp,
  advanceRtp,
  nextStage,
  calibrateRisk,
  computeInjuryRisk,
  RISK_MODEL_VERSION,
} from "./index";

describe("RTP rails", () => {
  it("blocks advancement until every gate in the stage is met", () => {
    const ev = evaluateRtp({ stage: "acute", completed: ["pain_free_rest"] });
    expect(ev.canAdvance).toBe(false);
    expect(ev.blockedBy).toContain("Swelling resolved");
    expect(ev.nextStage).toBe("recovery");
  });

  it("allows advancement when all gates are met, resetting the checklist", () => {
    const keys = RTP_GATES.acute.map((g) => g.key);
    const ev = evaluateRtp({ stage: "acute", completed: keys });
    expect(ev.canAdvance).toBe(true);
    const advanced = advanceRtp({ stage: "acute", completed: keys });
    expect(advanced.stage).toBe("recovery");
    expect(advanced.completed).toEqual([]);
  });

  it("does not advance past a stage with unmet gates", () => {
    const same = advanceRtp({ stage: "recovery", completed: [] });
    expect(same.stage).toBe("recovery");
  });

  it("progress rises monotonically across stages", () => {
    const a = evaluateRtp({ stage: "acute", completed: [] }).progress;
    const b = evaluateRtp({ stage: "reconditioning", completed: [] }).progress;
    const c = evaluateRtp({ stage: "cleared", completed: [] }).progress;
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
    expect(c).toBe(1);
  });

  it("cleared is terminal", () => {
    expect(nextStage("cleared")).toBeNull();
    expect(evaluateRtp({ stage: "cleared", completed: [] }).canAdvance).toBe(false);
  });

  it("every non-terminal stage defines at least one gate", () => {
    for (const s of RTP_STAGES) {
      if (s !== "cleared") expect(RTP_GATES[s].length).toBeGreaterThan(0);
    }
  });
});

describe("injury calibration", () => {
  it("maps score to a probability that increases monotonically in 0..1", () => {
    expect(calibrateRisk(0)).toBeGreaterThan(0);
    expect(calibrateRisk(100)).toBeLessThan(1);
    expect(calibrateRisk(80)).toBeGreaterThan(calibrateRisk(50));
    expect(calibrateRisk(50)).toBeGreaterThan(calibrateRisk(20));
  });

  it("anchors roughly to the documented prior (50→~10%, 80→~35%)", () => {
    expect(calibrateRisk(50)).toBeGreaterThan(0.07);
    expect(calibrateRisk(50)).toBeLessThan(0.14);
    expect(calibrateRisk(80)).toBeGreaterThan(0.28);
    expect(calibrateRisk(80)).toBeLessThan(0.42);
  });

  it("injury risk carries a calibrated prob + model version", () => {
    const r = computeInjuryRisk([{ daysAgo: 1, items: [{ move: "Back Squat", topRpe: 9, hardSets: 8 }] }]);
    expect(r.modelVersion).toBe(RISK_MODEL_VERSION);
    expect(r.prob).toBeGreaterThanOrEqual(0);
    expect(r.prob).toBeLessThanOrEqual(1);
    expect(r.tissues[0]!.prob).toBeCloseTo(calibrateRisk(r.tissues[0]!.risk), 5);
  });
});
