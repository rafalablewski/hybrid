import { describe, expect, it } from "vitest";
import { NUTRITION_TAP_FLOWS, TAP_BUDGET, TAP_FLOWS, overBudget, tapCost } from "./tap-budget";

describe("the tap budget", () => {
  it("is five", () => {
    expect(TAP_BUDGET).toBe(5);
  });

  it("HARD — no registered flow costs more than five taps", () => {
    const over = overBudget(TAP_FLOWS).map((f) => `${f.id} (${tapCost(f)}): ${f.steps.join(" → ")}`);
    expect(over).toEqual([]);
  });

  it("counts every flow from a tab root, never from halfway through one", () => {
    // The start is the whole argument. A flow counted from the screen it
    // already happens to be on fits any budget.
    for (const f of TAP_FLOWS) {
      expect(["today", "nutrition"], f.id).toContain(f.from);
      expect(f.steps.length, `${f.id} has no steps`).toBeGreaterThan(0);
    }
  });

  it("keeps the register honest: unique ids, no blank steps", () => {
    const ids = TAP_FLOWS.map((f) => f.id);
    expect(ids.length, "duplicate flow id").toBe(new Set(ids).size);
    for (const f of TAP_FLOWS) {
      expect(f.what.trim(), `${f.id} says nothing about what it is`).not.toBe("");
      for (const s of f.steps) expect(s.trim(), `${f.id} has a blank step`).not.toBe("");
    }
  });

  it("carries the nutrition flows the food-logging redesign was measured against", () => {
    // Named explicitly rather than counted, so deleting a flow to make the
    // ceiling is a visible edit to this test and not a quiet one to the list.
    expect(NUTRITION_TAP_FLOWS.map((f) => f.id).sort()).toEqual([
      "create-food-with-pack",
      "delete-saved-food",
      "edit-saved-food",
      "forget-a-pack",
      "forget-a-recent",
      "log-recent",
      "log-saved-food",
      "log-weighed",
      "log-whole-pack",
    ]);
    expect(TAP_FLOWS).toEqual(NUTRITION_TAP_FLOWS);
  });

  it("the three flows that were impossible or six taps deep are the ones that moved", () => {
    // A regression on any of these is the redesign coming undone.
    const by = (id: string) => NUTRITION_TAP_FLOWS.find((f) => f.id === id)!;
    expect(tapCost(by("log-whole-pack"))).toBe(4);
    expect(tapCost(by("log-weighed"))).toBe(5);
    expect(tapCost(by("forget-a-pack"))).toBe(5);
    expect(tapCost(by("forget-a-recent"))).toBe(4);
  });
});
