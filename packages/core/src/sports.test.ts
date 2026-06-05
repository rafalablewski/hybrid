import { describe, it, expect } from "vitest";
import { prescribeForSport } from "./sports";
import type { LoggedSession } from "./engines/session";

const session = (lift: string, load: string, reps: string): LoggedSession => ({
  id: "s1",
  title: "t",
  startedAt: new Date().toISOString(),
  completedAt: null,
  blocks: [{ kind: "strength", name: lift, sets: [{ load, reps }] }],
  readiness: null,
});

describe("prescribeForSport", () => {
  it("prescribes a real working load from the athlete's logged lifts", () => {
    // Cycling @ Beginner includes Back Squat (a loadable barbell lift).
    const rx = prescribeForSport("Cycling", 0, { sessions: [session("Back Squat", "150", "5")] });
    const squat = rx.blocks.find((b) => b.name === "Back Squat")!;
    expect(squat.load).toBeGreaterThan(0);
    expect(squat.scheme).toContain("kg");
    expect(squat.loadBasis).toContain("e1RM");
    expect(squat.bodyweight).toBeUndefined();
    expect(rx.personalized).toBe(true);
  });

  it("shows a starting estimate (not personalized) when nothing is logged", () => {
    const rx = prescribeForSport("Cycling", 0, {});
    const squat = rx.blocks.find((b) => b.name === "Back Squat")!;
    expect(squat.load).toBeGreaterThan(0);
    expect(squat.loadBasis).toContain("estimate");
    expect(rx.personalized).toBe(false);
  });

  it("treats movements with no load source as bodyweight/tempo", () => {
    // Bulgarian Split Squat isn't a known barbell base load and isn't logged.
    const rx = prescribeForSport("Running", 0, {});
    const bss = rx.blocks.find((b) => b.name === "Bulgarian Split Squat")!;
    expect(bss.bodyweight).toBe(true);
    expect(bss.load).toBeUndefined();
    expect(bss.scheme).not.toContain("kg");
  });

  it("doses fewer reps as the level rises", () => {
    expect(prescribeForSport("Cycling", 0).setScheme).toBe("3×8");
    expect(prescribeForSport("Cycling", 3).setScheme).toBe("5×3");
  });
});
