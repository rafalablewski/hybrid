import { describe, it, expect } from "vitest";
import {
  computeEconomics,
  DEFAULT_ASSUMPTIONS,
  REVENUE_STREAMS,
  COST_DRIVERS,
  METRIC_GUIDE,
  FIXED_OPEX_ITEMS,
  fixedOpexMonthlyTotal,
  MARKET_PRICING,
  PLAN_COLUMNS,
  ENTITLEMENT_MATRIX,
  toUsd,
  PROJECTION_MONTHS,
  type EconomicAssumptions,
  type MarketId,
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

describe("fixed opex line items", () => {
  it("the recurring lines sum to the default fixed-opex assumption (±$1 rounding)", () => {
    const total = fixedOpexMonthlyTotal();
    expect(total).toBeGreaterThan(0);
    expect(Math.abs(total - DEFAULT_ASSUMPTIONS.fixedOpexMonthly)).toBeLessThanOrEqual(1);
  });

  it("one-time and future items carry no monthly run-rate", () => {
    for (const i of FIXED_OPEX_ITEMS) {
      if (i.kind !== "recurring") expect(i.monthlyUsd).toBe(0);
      else expect(i.monthlyUsd).toBeGreaterThan(0);
    }
  });

  it("includes Supabase, the Claude agent budget, and the domains", () => {
    const labels = FIXED_OPEX_ITEMS.map((i) => i.label.toLowerCase()).join(" | ");
    expect(labels).toContain("supabase");
    expect(labels).toContain("claude");
    expect(labels).toContain("hybrid.app");
  });
});

describe("focus markets + localized pricing", () => {
  it("covers exactly the five focus markets", () => {
    expect(MARKET_PRICING.map((m) => m.id)).toEqual<MarketId[]>(["us", "uk", "eu", "pl", "sg"]);
  });

  it("the US is the anchor at FX 1.0 and index 1.0", () => {
    const us = MARKET_PRICING.find((m) => m.id === "us")!;
    expect(us.fxPerUsd).toBe(1);
    expect(us.priceIndex).toBe(1);
    expect(toUsd(us.proMonthly, us.fxPerUsd)).toBeCloseTo(us.proMonthly, 6);
  });

  it("every market quotes positive prices and a usable FX rate", () => {
    for (const m of MARKET_PRICING) {
      expect(m.fxPerUsd).toBeGreaterThan(0);
      for (const p of [m.proMonthly, m.proAnnual, m.coachStarter, m.coachPro, m.coachBusiness, m.orgLow, m.orgHigh]) {
        expect(p).toBeGreaterThan(0);
      }
      expect(m.orgHigh).toBeGreaterThanOrEqual(m.orgLow);
      expect(m.rationale.length).toBeGreaterThan(0);
    }
  });

  it("the annual plan is always cheaper per month than monthly (a real discount)", () => {
    for (const m of MARKET_PRICING) {
      expect(m.proAnnual / 12).toBeLessThan(m.proMonthly);
    }
  });

  it("Poland is localized below the US on a purchasing-power lens", () => {
    const pl = MARKET_PRICING.find((m) => m.id === "pl")!;
    const us = MARKET_PRICING.find((m) => m.id === "us")!;
    expect(pl.priceIndex).toBeLessThan(us.priceIndex);
    // The effective USD take is below the US headline.
    expect(toUsd(pl.proMonthly, pl.fxPerUsd)).toBeLessThan(us.proMonthly);
  });

  it("toUsd guards a zero rate", () => {
    expect(toUsd(100, 0)).toBe(0);
  });
});

describe("entitlement matrix (what each plan gets)", () => {
  it("exposes the four plan columns free → org", () => {
    expect(PLAN_COLUMNS.map((c) => c.id)).toEqual(["free", "pro", "coach", "org"]);
  });

  it("free is the smallest bundle and org the largest (tiers nest)", () => {
    const count = (key: "free" | "pro" | "coach" | "org") =>
      ENTITLEMENT_MATRIX.filter((r) => r[key] !== false).length;
    expect(count("free")).toBeLessThan(count("pro"));
    expect(count("pro")).toBeLessThanOrEqual(count("coach"));
    expect(count("coach")).toBeLessThanOrEqual(count("org"));
  });

  it("the free logging loop is available on every plan", () => {
    const logging = ENTITLEMENT_MATRIX.filter((r) => r.group.startsWith("Log & basics"));
    expect(logging.length).toBeGreaterThan(0);
    for (const r of logging) {
      for (const key of ["free", "pro", "coach", "org"] as const) expect(r[key]).not.toBe(false);
    }
  });

  it("the Pro intelligence layer is gated off the free plan", () => {
    const ai = ENTITLEMENT_MATRIX.find((r) => r.feature.includes("AI coach"))!;
    expect(ai.free).toBe(false);
    expect(ai.pro).toBe(true);
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

  it("magic number is 0 (not Infinity) when shrinking on zero spend", () => {
    // No growth → no new units → no S&M spend; churn outpaces expansion → net-new < 0.
    const r = computeEconomics({ ...base, monthlyGrowthPct: 0, monthlyExpansionPct: 0 });
    expect(r.health.netNewMrr).toBeLessThan(0);
    expect(r.health.magicNumber).toBe(0);
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

  it("collapses MRR to zero once the customer base churns out", () => {
    // Brutal churn, no growth/expansion → the base rounds to zero within a year.
    const r = computeEconomics({ ...base, b2cMonthlyChurnPct: 60, coachMonthlyChurnPct: 60, monthlyGrowthPct: 0, monthlyExpansionPct: 0 });
    const dead = r.projection.find((p) => p.customers === 0);
    expect(dead).toBeDefined();
    expect(dead!.mrr).toBe(0);
    // Stays collapsed for the rest of the horizon.
    expect(r.projection[r.projection.length - 1]!.mrr).toBe(0);
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
