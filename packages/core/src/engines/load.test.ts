import { describe, it, expect } from "vitest";
import { sessionLoad, computeLoad } from "./load";
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
