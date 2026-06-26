import { describe, it, expect } from "vitest";
import { plansForGoal, GOAL_TREE, PLAN_DETAIL } from "./plans";

describe("plansForGoal", () => {
  // The old gym plans were retired; plans are being rebuilt goal-shaped. Each
  // authored goal carries the plan in the shape that fits it; the rest are empty.
  it("carries the authored plans per goal, nothing elsewhere", () => {
    const authored: Record<string, string[]> = {
      oly: ["oly-soviet-8wk"],
      run: ["run-5k-beginner-9wk"],
      bb: ["bb-ppl-6day"],
      fatloss: ["fatloss-kb-saturday"],
      kettlebell: ["kb-12wk-strong"],
    };
    for (const node of GOAL_TREE) {
      expect(plansForGoal(node.name).map((p) => p.id)).toEqual(authored[node.id] ?? []);
    }
  });

  it("is empty for a goal with no uploaded plans yet", () => {
    expect(plansForGoal("Strongman")).toEqual([]);
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

describe("plan library sets×reps", () => {
  // Every plan must show a SINGLE rep target — never a range (e.g. "5 × 8–12").
  // Guards against a future plan upload reintroducing a range in the source data.
  it("has no rep/set range in any sr string across PLAN_DETAIL", () => {
    const range = /(\d+)\s*[–—-]\s*(\d+)/;
    const offenders: string[] = [];
    for (const [id, detail] of Object.entries(PLAN_DETAIL)) {
      for (const day of detail.days ?? []) {
        for (const it of day.items ?? []) {
          if (range.test(it.sr)) offenders.push(`${id} · ${it.name}: ${it.sr}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
