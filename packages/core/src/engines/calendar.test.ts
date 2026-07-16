import { describe, it, expect } from "vitest";
import { sessionsByDay, monthMatrix, loadIntensity } from "./calendar";
import type { LoggedSession } from "./session";

// LOCAL-constructed timestamps so day-grouping expectations hold in any TZ.
const at = (day: number, hour: number) => new Date(2026, 5, day, hour).toISOString(); // June 2026, local time
const sess = (id: string, iso: string): LoggedSession => ({
  id, title: "Lower", startedAt: iso,
  blocks: [{ kind: "strength", name: "Back Squat", sets: [{ load: "100", reps: "5", rpe: "8" }, { load: "100", reps: "5", rpe: "8" }] }],
});

describe("sessionsByDay", () => {
  it("groups by UTC day and sums count/load/volume", () => {
    const by = sessionsByDay([
      sess("a", at(1, 8)),
      sess("b", at(1, 18)),
      sess("c", at(2, 8)),
    ]);
    expect(by["2026-06-01"]!.count).toBe(2);
    expect(by["2026-06-01"]!.volume).toBe(2 * (100 * 5 + 100 * 5)); // two sessions
    expect(by["2026-06-01"]!.load).toBeGreaterThan(0);
    expect(by["2026-06-02"]!.count).toBe(1);
  });
});

describe("monthMatrix", () => {
  it("returns a 6×7 grid", () => {
    const m = monthMatrix(2026, 5); // June 2026
    expect(m).toHaveLength(6);
    expect(m[0]).toHaveLength(7);
  });

  it("marks in-month vs adjacent days and starts Monday", () => {
    // June 1 2026 is a Monday → first cell should be June 1, in-month
    const m = monthMatrix(2026, 5, true);
    expect(m[0]![0]!.date).toBe("2026-06-01");
    expect(m[0]![0]!.inMonth).toBe(true);
    // last week bleeds into July
    const flat = m.flat();
    expect(flat.some((c) => !c.inMonth)).toBe(true);
    expect(flat).toHaveLength(42);
  });
});

describe("loadIntensity", () => {
  it("scales 0..1 against the busiest day", () => {
    const by = sessionsByDay([sess("a", at(1, 8)), sess("b", at(1, 18)), sess("c", at(3, 8))]);
    const intensity = loadIntensity(by);
    expect(intensity("2026-06-01")).toBeCloseTo(1, 5); // busiest
    expect(intensity("2026-06-03")).toBeGreaterThan(0);
    expect(intensity("2026-06-03")).toBeLessThan(1);
    expect(intensity("2026-06-09")).toBe(0); // nothing logged
  });
});
