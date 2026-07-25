import { describe, it, expect } from "vitest";
import { prescribeForSport, SPORTS, SPORT_NAMES } from "./sports";
import { olympicSport } from "./olympic-sports";
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
    // "Calf Raise (slow)" is neither in the exercise DB nor logged — no load source.
    const rx = prescribeForSport("Running", 0, {});
    const bw = rx.blocks.find((b) => b.name === "Calf Raise (slow)")!;
    expect(bw.bodyweight).toBe(true);
    expect(bw.load).toBeUndefined();
    expect(bw.scheme).not.toContain("kg");
    // …while Bulgarian Split Squat now HAS a DB base load, so it gets a real
    // starting estimate instead of a bodyweight fallback.
    const bss = rx.blocks.find((b) => b.name === "Bulgarian Split Squat")!;
    expect(bss.load).toBeGreaterThan(0);
  });

  it("doses fewer reps as the level rises", () => {
    expect(prescribeForSport("Cycling", 0).setScheme).toBe("3×8");
    expect(prescribeForSport("Cycling", 3).setScheme).toBe("5×3");
  });

  it("prescribes Squash from its signature lunge, personalized from logs", () => {
    const rx = prescribeForSport("Squash", 0, { sessions: [session("Bulgarian Split Squat", "40", "6")] });
    const lunge = rx.blocks.find((b) => b.name === "Bulgarian Split Squat")!;
    expect(lunge).toBeDefined();
    expect(lunge.demand).toBe("Lunge strength & stability");
    expect(lunge.load).toBeGreaterThan(0);
    expect(lunge.loadBasis).toContain("e1RM");
    expect(rx.personalized).toBe(true);
    // court-specific plyo/conditioning picks have no load source → bodyweight/tempo
    const bound = rx.blocks.find((b) => b.name === "Lateral Bound")!;
    expect(bound.bodyweight).toBe(true);
    expect(bound.load).toBeUndefined();
  });

  it("is one database with the loggable catalog — every engine sport is a catalog sport carrying the SAME pool", () => {
    // The S&C engine is a projection of the single catalog: no sport can be
    // prescribable without being loggable, and the pool has one source.
    for (const name of SPORT_NAMES) {
      const cat = olympicSport(name);
      expect(cat, `${name} must exist in the sport catalog`).toBeDefined();
      expect(cat!.sc, `${name} must carry an sc block`).toBeDefined();
      expect(SPORTS[name]!.pool).toBe(cat!.sc!.pool); // same array reference — one source of truth
      expect(SPORTS[name]!.family).toBe(cat!.sc!.family);
    }
    // The seven prescribable sports, in catalog order.
    expect(SPORT_NAMES).toEqual(["Running", "Swimming", "Cycling", "Boxing", "BJJ", "Squash", "Climbing"]);
  });
});
