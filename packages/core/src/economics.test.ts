import { describe, it, expect } from "vitest";
import {
  computeEconomics,
  DEFAULT_ASSUMPTIONS,
  REVENUE_STREAMS,
  COST_DRIVERS,
  METRIC_GUIDE,
  PROJECTION_MONTHS,
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
  it("cost drivers cover ai, infra, stripe, support and a fixed line", () => {
    const ids = COST_DRIVERS.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(["ai", "infra", "stripe", "support", "fixed"]));
    expect(COST_DRIVERS.some((c) => c.kind === "fixed")).toBe(true);
  });
  it("the metric guide documents every headline indicator", () => {
    const ids = METRIC_GUIDE.map((m) => m.id);
    expect(ids).toEqual(
      expect.arrayContaining(["mrr", "ltv", "payback", "ltvcac", "ruleof40", "nrr", "grr", "quickratio", "burnmultiple", "runway"]),
    );
    for (const m of METRIC_GUIDE) {
      expect(m.what.length).toBeGreaterThan(0);
      expect(m.formula.length).toBeGreaterThan(0);
      expect(m.benchmark.length).toBeGreaterThan(0);
    }
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
    expect(r.cogs.total).toBeCloseTo(r.cogs.ai + r.cogs.infra + r.cogs.stripe + r.cogs.support + r.cogs.fixed, 6);
    expect(r.grossProfit).toBeCloseTo(r.revenue.total - r.cogs.total, 6);
    expect(r.grossMargin).toBeCloseTo(r.grossProfit / r.revenue.total, 6);
  });

  it("AI cost only bills the active share", () => {
    const r = computeEconomics({ ...base, aiActivePct: 50, aiCostPerUserMonthly: 4, totalUsers: 1000 });
    expect(r.cogs.ai).toBeCloseTo(1000 * 0.5 * 4, 4);
  });

  it("support cost scales with the coach base", () => {
    const r = computeEconomics({ ...base, coaches: 30, coachServiceCostMonthly: 3 });
    expect(r.cogs.support).toBeCloseTo(30 * 3, 4);
  });

  it("stripe cost combines a percentage of revenue and a flat per-account fee", () => {
    const r = computeEconomics(base);
    expect(r.cogs.stripe).toBeCloseTo(r.revenue.total * 0.029 + r.payingUnits * 0.3, 4);
  });
});

describe("computeEconomics — segment unit economics", () => {
  it("splits paying units across segments and matches segment MRR", () => {
    const r = computeEconomics(base);
    expect(r.segments.b2c.payingUnits).toBe(50);
    expect(r.segments.coach.payingUnits).toBe(20);
    expect(r.segments.b2c.mrr).toBeCloseTo(r.revenue.b2c, 6);
    expect(r.segments.coach.mrr).toBeCloseTo(r.revenue.coach, 6);
  });

  it("coach seats carry a higher LTV than consumers (stickier, higher ARPU)", () => {
    const r = computeEconomics(base);
    expect(r.segments.coach.arpu).toBeGreaterThan(r.segments.b2c.arpu);
    expect(r.segments.coach.ltv).toBeGreaterThan(r.segments.b2c.ltv);
  });

  it("segment LTV = arpu × margin ÷ churn", () => {
    const r = computeEconomics(base);
    const s = r.segments.b2c;
    expect(s.ltv).toBeCloseTo((s.arpu * s.grossMargin) / s.monthlyChurn, 4);
  });

  it("segment CAC payback = cac ÷ (arpu × margin)", () => {
    const r = computeEconomics(base);
    const s = r.segments.coach;
    expect(s.cacPaybackMonths).toBeCloseTo(s.cac / (s.arpu * s.grossMargin), 4);
  });
});

describe("computeEconomics — blended LTV / CAC", () => {
  it("blended LTV:CAC and payback are positive for the default model", () => {
    const r = computeEconomics(base);
    expect(r.blendedArpu).toBeGreaterThan(0);
    expect(r.ltv).toBeGreaterThan(0);
    expect(r.ltvToCac).toBeGreaterThan(0);
    expect(r.cacPaybackMonths).toBeGreaterThan(0);
  });

  it("blended churn is revenue-weighted across the segments", () => {
    // Pure (profitable) B2C → blended LTV uses the B2C churn.
    const r = computeEconomics({ ...base, proConversionPct: 25, fixedOpexMonthly: 100, coaches: 0, orgAthletes: 0 });
    expect(r.grossMargin).toBeGreaterThan(0);
    expect(r.ltv).toBeCloseTo((r.blendedArpu * r.grossMargin) / (base.b2cMonthlyChurnPct / 100), 4);
  });
});

describe("computeEconomics — health scorecard", () => {
  it("annualizes monthly growth and computes the Rule of 40", () => {
    const r = computeEconomics(base);
    const expectedGrowth = (Math.pow(1 + base.monthlyGrowthPct / 100, 12) - 1) * 100;
    expect(r.health.annualGrowthRatePct).toBeCloseTo(expectedGrowth, 4);
    expect(r.health.ruleOf40).toBeCloseTo(expectedGrowth + r.grossMargin * 100, 4);
  });

  it("net retention exceeds gross retention when there is expansion", () => {
    const r = computeEconomics(base);
    expect(r.health.netRetentionAnnualPct).toBeGreaterThan(r.health.grossRetentionAnnualPct);
    expect(r.health.grossRetentionAnnualPct).toBeLessThanOrEqual(100);
  });

  it("quick ratio rises with growth and falls with churn", () => {
    const lo = computeEconomics({ ...base, monthlyGrowthPct: 2 });
    const hi = computeEconomics({ ...base, monthlyGrowthPct: 20 });
    expect(hi.health.quickRatio).toBeGreaterThan(lo.health.quickRatio);
  });

  it("runway is finite while burning and infinite once profitable", () => {
    const burning = computeEconomics({ ...base, proConversionPct: 0, coaches: 0, fixedOpexMonthly: 5000, cashOnHand: 50000 });
    expect(burning.grossProfit).toBeLessThan(0);
    expect(burning.health.runwayMonths).toBeCloseTo(50000 / -burning.grossProfit, 2);

    const profitable = computeEconomics({ ...base, proConversionPct: 20, fixedOpexMonthly: 100 });
    expect(profitable.grossProfit).toBeGreaterThan(0);
    expect(profitable.health.runwayMonths).toBe(Infinity);
    expect(profitable.health.burnMultiple).toBe(0);
  });
});

describe("computeEconomics — forward projection", () => {
  it("returns month 0..N starting from today's MRR", () => {
    const r = computeEconomics(base);
    expect(r.projection.length).toBe(PROJECTION_MONTHS + 1);
    const first = r.projection[0]!;
    const final = r.projection[PROJECTION_MONTHS]!;
    expect(first.month).toBe(0);
    expect(first.mrr).toBeCloseTo(r.revenue.total, 6);
    expect(r.projectionSummary.endingMrr).toBeCloseTo(final.mrr, 6);
    expect(r.projectionSummary.endingArr).toBeCloseTo(r.projectionSummary.endingMrr * 12, 6);
  });

  it("grows MRR month over month with positive net growth", () => {
    const r = computeEconomics(base);
    expect(r.projection[PROJECTION_MONTHS]!.mrr).toBeGreaterThan(r.projection[0]!.mrr);
  });

  it("cumulative cash accumulates the monthly P&L on top of the starting balance", () => {
    const r = computeEconomics(base);
    expect(r.projection[0]!.cumulativeCash).toBeCloseTo(base.cashOnHand, 6);
    const m1 = r.projection[1]!;
    expect(m1.cumulativeCash).toBeCloseTo(base.cashOnHand + m1.profit, 6);
  });

  it("flags an already-profitable model as break-even at month 0", () => {
    const r = computeEconomics({ ...base, proConversionPct: 25, fixedOpexMonthly: 100 });
    expect(r.grossProfit).toBeGreaterThan(0);
    expect(r.projectionSummary.breakEvenMonth).toBe(0);
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
    // Projection stays finite throughout.
    for (const p of r.projection) {
      expect(Number.isFinite(p.mrr)).toBe(true);
      expect(Number.isFinite(p.cumulativeCash)).toBe(true);
    }
  });

  it("zero churn yields an infinite LTV (guarded, not NaN)", () => {
    const r = computeEconomics({ ...base, b2cMonthlyChurnPct: 0, coachMonthlyChurnPct: 0 });
    expect(r.ltv).toBe(Infinity);
    expect(r.segments.b2c.ltv).toBe(Infinity);
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
