import { describe, it, expect } from "vitest";
import {
  computeEconomics,
  DEFAULT_ASSUMPTIONS,
  REVENUE_STREAMS,
  COST_DRIVERS,
  type EconomicAssumptions,
} from "./economics";

const base = DEFAULT_ASSUMPTIONS;

describe("model constants", () => {
  it("ships all four revenue streams with the data network flagged future", () => {
    expect(REVENUE_STREAMS.map((s) => s.id)).toEqual(["b2c", "coach", "org", "data"]);
    expect(REVENUE_STREAMS.find((s) => s.id === "data")?.future).toBe(true);
    expect(REVENUE_STREAMS.filter((s) => s.future).length).toBe(1);
  });
  it("every stream has at least one tier", () => {
    for (const s of REVENUE_STREAMS) expect(s.tiers.length).toBeGreaterThan(0);
  });
  it("cost drivers cover ai, infra, stripe and a fixed line", () => {
    const ids = COST_DRIVERS.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(["ai", "infra", "stripe", "fixed"]));
    expect(COST_DRIVERS.some((c) => c.kind === "fixed")).toBe(true);
  });
});

describe("computeEconomics — revenue", () => {
  it("sums the streams into the total MRR", () => {
    const r = computeEconomics(base);
    expect(r.revenue.total).toBeCloseTo(r.revenue.b2c + r.revenue.coach + r.revenue.org, 6);
    expect(r.arr).toBeCloseTo(r.revenue.total * 12, 6);
  });

  it("B2C revenue blends monthly + annual plans", () => {
    // 1000 users × 5% = 50 Pro. 70% monthly @12.99 + 30% annual @99/12.
    const r = computeEconomics({ ...base, coaches: 0, orgAthletes: 0 });
    const perUser = 0.7 * 12.99 + 0.3 * (99 / 12);
    expect(r.revenue.b2c).toBeCloseTo(50 * perUser, 4);
  });

  it("coach revenue follows the tier mix", () => {
    const r = computeEconomics({ ...base, proConversionPct: 0, orgAthletes: 0 });
    const expected = 20 * (0.6 * 29 + 0.3 * 79 + 0.1 * 199);
    expect(r.revenue.coach).toBeCloseTo(expected, 4);
  });

  it("org revenue is the annual contract expressed monthly", () => {
    const r = computeEconomics({ ...base, proConversionPct: 0, coaches: 0, orgAthletes: 120, orgPricePerAthleteYear: 60 });
    expect(r.revenue.org).toBeCloseTo((120 * 60) / 12, 4);
  });
});

describe("computeEconomics — margin + COGS", () => {
  it("gross margin equals (revenue − cogs) / revenue", () => {
    const r = computeEconomics(base);
    expect(r.cogs.total).toBeCloseTo(r.cogs.ai + r.cogs.infra + r.cogs.stripe + r.cogs.fixed, 6);
    expect(r.grossProfit).toBeCloseTo(r.revenue.total - r.cogs.total, 6);
    expect(r.grossMargin).toBeCloseTo(r.grossProfit / r.revenue.total, 6);
  });

  it("AI cost only bills the active share", () => {
    const r = computeEconomics({ ...base, aiActivePct: 50, aiCostPerUserMonthly: 4, totalUsers: 1000 });
    expect(r.cogs.ai).toBeCloseTo(1000 * 0.5 * 4, 4);
  });

  it("stripe cost combines a percentage of revenue and a flat per-account fee", () => {
    const r = computeEconomics(base);
    expect(r.cogs.stripe).toBeCloseTo(r.revenue.total * 0.029 + r.payingUnits * 0.3, 4);
  });
});

describe("computeEconomics — LTV / CAC", () => {
  it("LTV:CAC and payback are positive for the default model", () => {
    const r = computeEconomics(base);
    expect(r.blendedArpu).toBeGreaterThan(0);
    expect(r.ltv).toBeGreaterThan(0);
    expect(r.ltvToCac).toBeGreaterThan(0);
    expect(r.cacPaybackMonths).toBeGreaterThan(0);
  });

  it("LTV = arpu × margin ÷ churn", () => {
    const r = computeEconomics(base);
    expect(r.ltv).toBeCloseTo((r.blendedArpu * r.grossMargin) / 0.05, 4);
  });
});

describe("computeEconomics — robustness", () => {
  it("an empty platform never divides by zero", () => {
    const empty: EconomicAssumptions = { ...base, totalUsers: 0, coaches: 0, orgAthletes: 0 };
    const r = computeEconomics(empty);
    expect(r.revenue.total).toBe(0);
    expect(r.blendedArpu).toBe(0);
    expect(r.grossMargin).toBe(0);
    expect(Number.isFinite(r.cogs.total)).toBe(true);
    // No revenue but fixed opex → a burn.
    expect(r.monthlyContribution).toBeLessThan(0);
  });

  it("zero churn yields an infinite LTV (guarded, not NaN)", () => {
    const r = computeEconomics({ ...base, monthlyChurnPct: 0 });
    expect(r.ltv).toBe(Infinity);
  });

  it("more Pro conversion strictly increases MRR (monotonic)", () => {
    const lo = computeEconomics({ ...base, proConversionPct: 3 });
    const hi = computeEconomics({ ...base, proConversionPct: 8 });
    expect(hi.revenue.b2c).toBeGreaterThan(lo.revenue.b2c);
    expect(hi.revenue.total).toBeGreaterThan(lo.revenue.total);
  });

  it("negative inputs never produce negative revenue (guarded like the other streams)", () => {
    const r = computeEconomics({
      ...base,
      coachStarterPrice: -29,
      coachProPrice: -79,
      coachBusinessPrice: -199,
      proPriceMonthly: -10,
      orgAthletes: 100,
      orgPricePerAthleteYear: -60,
    });
    expect(r.revenue.coach).toBe(0);
    expect(r.revenue.b2c).toBeGreaterThanOrEqual(0);
    expect(r.revenue.org).toBe(0);
    expect(r.revenue.total).toBeGreaterThanOrEqual(0);
  });

  it("break-even Pro users is a non-negative integer when reachable", () => {
    const r = computeEconomics(base);
    expect(Number.isInteger(r.breakEvenProUsers)).toBe(true);
    expect(r.breakEvenProUsers).toBeGreaterThanOrEqual(0);
  });
});
