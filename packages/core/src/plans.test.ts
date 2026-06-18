import { describe, it, expect } from "vitest";
import { plansForGoal, GOAL_TREE } from "./plans";

describe("plansForGoal", () => {
  it("returns the named plans for a goal that has them", () => {
    const bb = plansForGoal("Bodybuilding");
    expect(bb.length).toBeGreaterThan(0);
    expect(bb.map((p) => p.id)).toContain("bb-fb4");
  });

  it("is empty for a goal with no uploaded plans yet", () => {
    expect(plansForGoal("Powerlifting")).toEqual([]);
  });

  it("is empty for an unknown goal (never throws)", () => {
    expect(plansForGoal("Not A Goal")).toEqual([]);
  });

  it("only ever returns plans that belong to that goal node", () => {
    for (const node of GOAL_TREE) {
      expect(plansForGoal(node.name)).toBe(node.plans);
    }
  });
});
