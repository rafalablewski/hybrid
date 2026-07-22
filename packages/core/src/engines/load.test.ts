import { describe, it, expect } from "vitest";
import { sessionLoad, computeLoad, sessionEnergyKcal, trainingEnergyOnDay } from "./load";
import type { LoggedSession } from "./session";

const DAY = 86_400_000;
const NOW = Date.parse("2026-06-03T12:00:00.000Z");
const ago = (n: number) => new Date(NOW - n * DAY).toISOString();

function strengthSession(id: string, daysAgo: number, sets = 4, rpe = "8"): LoggedSession {
  return {
    id,
    title: "S",
    startedAt: ago(daysAgo),
    blocks: [{ kind: "strength", name: "Back Squat", sets: Array.from({ length: sets }, () => ({ load: "100", reps: "5", rpe })) }],
  };
}

describe("sessionLoad (sRPE)", () => {
  it("is duration × RPE per block", () => {
    // 4 sets × 3.5 min × RPE 8 = 112
    expect(sessionLoad(strengthSession("a", 0, 4, "8"))).toBe(112);
  });
  it("uses conditioning minutes × rpe", () => {
    const s: LoggedSession = { id: "c", title: "C", startedAt: ago(0), blocks: [{ kind: "conditioning", name: "Row", minutes: 30, rpe: 7 }] };
    expect(sessionLoad(s)).toBe(210);
  });
});

describe("sessionEnergyKcal (training fuel estimate)", () => {
  it("estimates a positive kcal cost that scales with bodyweight", () => {
    const s = strengthSession("a", 0, 6, "8");
    const light = sessionEnergyKcal(s, 60);
    const heavy = sessionEnergyKcal(s, 90);
    expect(light).toBeGreaterThan(0);
    expect(heavy).toBeGreaterThan(light);
  });
  it("costs more for harder conditioning than easy cardio of equal length", () => {
    const easy: LoggedSession = { id: "e", title: "E", startedAt: ago(0), blocks: [{ kind: "cardio", name: "Jog", minutes: 30, rpe: 4 }] };
    const hard: LoggedSession = { id: "h", title: "H", startedAt: ago(0), blocks: [{ kind: "conditioning", name: "Intervals", minutes: 30, rpe: 9 }] };
    expect(sessionEnergyKcal(hard, 75)).toBeGreaterThan(sessionEnergyKcal(easy, 75));
  });
  it("defaults to a 75 kg athlete when weight is unknown", () => {
    const s = strengthSession("a", 0, 6, "8");
    expect(sessionEnergyKcal(s)).toBe(sessionEnergyKcal(s, 75));
  });
});

describe("trainingEnergyOnDay", () => {
  it("sums only sessions on the day containing now", () => {
    const s = [strengthSession("today", 0, 6, "8"), strengthSession("today2", 0, 4, "7"), strengthSession("yesterday", 1, 6, "8")];
    const total = trainingEnergyOnDay(s, 80, NOW);
    expect(total).toBe(sessionEnergyKcal(s[0]!, 80) + sessionEnergyKcal(s[1]!, 80));
  });
  it("is 0 on a rest day", () => {
    expect(trainingEnergyOnDay([strengthSession("y", 2)], 80, NOW)).toBe(0);
  });
});

describe("computeLoad — ACWR", () => {
  it("is insufficient without ~2 weeks of history", () => {
    const r = computeLoad([strengthSession("a", 0), strengthSession("b", 2)], NOW);
    expect(r.band).toBe("insufficient");
    expect(r.enoughHistory).toBe(false);
  });

  it("reads as sweet-spot when load is steady across 4 weeks", () => {
    // ~3 identical sessions/week for 4 weeks
    const s: LoggedSession[] = [];
    let i = 0;
    for (let d = 1; d <= 27; d += 2) s.push(strengthSession(`s${i++}`, d));
    const r = computeLoad(s, NOW);
    expect(r.enoughHistory).toBe(true);
    expect(r.acwr).toBeGreaterThan(0.7);
    expect(r.acwr).toBeLessThan(1.4);
    expect(["sweet-spot", "caution"]).toContain(r.band);
  });

  it("flags danger on an acute spike over a low chronic base", () => {
    const s: LoggedSession[] = [
      strengthSession("c1", 20), // small chronic base
      // big acute week
      strengthSession("a1", 0, 8), strengthSession("a2", 1, 8), strengthSession("a3", 2, 8),
      strengthSession("a4", 3, 8), strengthSession("a5", 5, 8),
    ];
    const r = computeLoad(s, NOW);
    expect(r.acwr).toBeGreaterThan(1.5);
    expect(r.band).toBe("danger");
  });

  it("reports weekly buckets and strain", () => {
    const s = [strengthSession("a", 0), strengthSession("b", 8), strengthSession("c", 15)];
    const r = computeLoad(s, NOW);
    expect(r.weekly).toHaveLength(4);
    expect(r.strain).toBeGreaterThanOrEqual(0);
  });
});
