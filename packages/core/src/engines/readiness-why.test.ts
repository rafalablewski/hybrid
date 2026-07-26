import { describe, it, expect } from "vitest";
import { readinessWhy } from "./performance-state";
import type { TrainingLog } from "./types";

describe("readinessWhy — the Performance page's truth-based readiness lines", () => {
  it("is honest with an empty log: baseline line, no invented lifts or loads", () => {
    const lines = readinessWhy([]);
    expect(lines[0]).toMatch(/^Readiness \d+\/100\.$/);
    expect(lines[1]).toContain("Nothing logged yet");
    const all = lines.join(" ");
    // The fabrications the old prescription copy leaked into this block:
    expect(all).not.toContain("Back Squat");
    expect(all).not.toContain("prescribed");
    expect(all).not.toContain("starting estimate");
    expect(all).not.toContain("conditioning is");
  });

  it("grounds the fatigue claim in the actual log's most-loaded tissue", () => {
    const log: TrainingLog = [
      { daysAgo: 0, items: [{ move: "Back Squat", topRpe: 9, hardSets: 8 }] },
      { daysAgo: 1, items: [{ move: "Back Squat", topRpe: 9, hardSets: 8 }] },
    ];
    const lines = readinessWhy(log);
    expect(lines[0]).toMatch(/^Readiness \d+\/100\.$/);
    expect(lines[1]).toContain("Computed from your logged training");
    expect(lines[1]).toContain("quads fatigue");
    // Still no session prescription — that narrative belongs to prescribeSession.
    expect(lines.join(" ")).not.toContain("prescribed");
  });

  it("says 'cleared to train' when nothing carries meaningful fatigue", () => {
    const log: TrainingLog = [
      { daysAgo: 13, items: [{ move: "Back Squat", topRpe: 6, hardSets: 1 }] },
    ];
    const lines = readinessWhy(log);
    expect(lines[1]).toContain("no meaningful residual fatigue");
  });
});
