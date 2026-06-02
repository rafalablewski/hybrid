import { describe, it, expect } from "vitest";
import { deploymentReadiness, unitReadiness, type UnitMember } from "./tactical";

describe("deploymentReadiness", () => {
  it("a fit, healthy operator reads ready", () => {
    const r = deploymentReadiness({ hpi: 88, injuryRisk: 10, loadCarriage: 85, workCapacity: 82 });
    expect(r.status).toBe("ready");
    expect(r.dri).toBeGreaterThan(80);
    expect(r.limiters).toHaveLength(0);
  });

  it("high injury risk hard-gates to non-deployable regardless of fitness", () => {
    const r = deploymentReadiness({ hpi: 95, injuryRisk: 75 });
    expect(r.status).toBe("non-deployable");
    expect(r.limiters.some((l) => l.includes("injury"))).toBe(true);
  });

  it("works with only HPI + injury risk", () => {
    const r = deploymentReadiness({ hpi: 70, injuryRisk: 20 });
    expect(r.dri).toBeGreaterThanOrEqual(0);
    expect(r.dri).toBeLessThanOrEqual(100);
  });

  it("flags weak occupational capacities", () => {
    const r = deploymentReadiness({ hpi: 75, injuryRisk: 20, loadCarriage: 45, workCapacity: 50 });
    expect(r.limiters).toContain("load carriage");
    expect(r.limiters).toContain("work capacity");
  });
});

describe("unitReadiness", () => {
  const members: UnitMember[] = [
    { name: "A", dri: 88, status: "ready" },
    { name: "B", dri: 70, status: "qualified" },
    { name: "C", dri: 55, status: "limited" },
    { name: "D", dri: 40, status: "non-deployable" },
    { name: "E", dri: 82, status: "ready" },
  ];

  it("counts deployable and sorts by DRI", () => {
    const u = unitReadiness(members);
    expect(u.deployable).toBe(3); // ready + qualified
    expect(u.total).toBe(5);
    expect(u.pctReady).toBe(60);
    expect(u.members[0]!.name).toBe("A");
  });

  it("go/no-go honors the threshold", () => {
    expect(unitReadiness(members, 0.8).go).toBe(false); // 60% < 80%
    expect(unitReadiness(members, 0.5).go).toBe(true);
  });
});
