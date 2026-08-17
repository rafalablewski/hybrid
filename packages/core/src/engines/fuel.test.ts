import { describe, it, expect } from "vitest";
import {
  energyBalance,
  fuelAdjustment,
  energyStateFromIntake,
  FUEL_DEADBAND_PCT,
  FUEL_MIN_DAYS,
  FUEL_MIN_DAY_KCAL,
  FUEL_PENALTY_MAX,
  FUEL_SATURATION_PCT,
  FUEL_SURPLUS_PCT,
  FUEL_WINDOW_DAYS,
  FUEL_BODY_MASS_STALE_DAYS,
} from "./fuel";
import { computeReadiness } from "./readiness";
import { readinessDeficit } from "./readiness-deficit";
import { readinessFacts, readinessVerdict } from "./performance-state";
import { computeFatigue } from "./fatigue";
import { prescribeSession } from "./prescription";
import { sampleNutritionSignals, SAMPLE_TRAINING_LOG } from "./sample-data";
import type { Signal } from "./signals";
import type { TrainingLog } from "./types";

const DAY = 86_400_000;
// LOCAL-constructed fixtures, because a nutrition day is the athlete's own
// calendar day and a UTC-built timestamp lands on the wrong one west of London.
const NOW = new Date(2026, 5, 3, 18).getTime();
const at = (daysAgo: number, hour = 13) => {
  const d = new Date(NOW - daysAgo * DAY);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour).toISOString();
};

const sig = (kind: Signal["kind"], value: number, daysAgo: number, hour = 13): Signal => ({
  athleteId: "u", kind, value, unit: "", source: "manual", ts: at(daysAgo, hour),
});

/** `n` completed days of eating `kcal` (and optionally `protein`), ending yesterday. */
const eating = (n: number, kcal: number, protein?: number): Signal[] => {
  const out: Signal[] = [];
  for (let d = 1; d <= n; d++) {
    out.push(sig("energyIntake", kcal, d));
    if (protein != null) out.push(sig("protein", protein, d));
  }
  return out;
};

/** Weigh-ins that hold steady, so maintenance can be estimated without the
 *  weight trend contributing anything of its own. */
const steadyWeight = (kg = 80): Signal[] => [sig("bodyMass", kg, 28), sig("bodyMass", kg, 1)];

describe("energyBalance — the gates, before any number is produced", () => {
  it("says nothing at all on an empty log", () => {
    const b = energyBalance([], { now: NOW });
    expect(b.sufficient).toBe(false);
    expect(b.reason).toBe("noLog");
    expect(b.balancePct).toBeNull();
  });

  it("refuses a thin log rather than reading it as a crash diet", () => {
    const b = energyBalance([...eating(FUEL_MIN_DAYS - 1, 2000), ...steadyWeight()], { now: NOW });
    expect(b.days).toBe(FUEL_MIN_DAYS - 1);
    expect(b.sufficient).toBe(false);
    expect(b.reason).toBe("tooFewDays");
  });

  it("refuses when maintenance cannot be estimated, even with plenty of days", () => {
    const b = energyBalance(eating(10, 2000), { now: NOW });
    expect(b.days).toBe(10);
    expect(b.maintenance).toBeNull();
    expect(b.sufficient).toBe(false);
    expect(b.reason).toBe("noMaintenance");
  });

  it("EXCLUDES TODAY — a day in progress is a day with dinner still ahead of it", () => {
    // Today carries one 400 kcal breakfast. If it counted, the average would
    // crater and the term would read worst first thing in the morning.
    const s = [...eating(7, 2600), sig("energyIntake", 400, 0, 8), ...steadyWeight()];
    const b = energyBalance(s, { now: NOW });
    expect(b.days).toBe(7);
    expect(b.avgIntake).toBe(2600);
  });

  it("reads a day under the floor as a GAP in the record, not as a fast", () => {
    const s = [
      ...eating(6, 2600),
      sig("energyIntake", FUEL_MIN_DAY_KCAL - 200, 7), // logged breakfast, forgot the rest
      ...steadyWeight(),
    ];
    const b = energyBalance(s, { now: NOW });
    expect(b.days).toBe(6);
    expect(b.avgIntake).toBe(2600);
  });

  it("ignores anything older than the window", () => {
    const s = [...eating(6, 2600), sig("energyIntake", 900, FUEL_WINDOW_DAYS + 3), ...steadyWeight()];
    expect(energyBalance(s, { now: NOW }).days).toBe(6);
  });

  it("ignores a future-stamped row", () => {
    const s = [...eating(6, 2600), sig("energyIntake", 5000, -2), ...steadyWeight()];
    expect(energyBalance(s, { now: NOW }).days).toBe(6);
  });
});

describe("energyBalance — the join itself", () => {
  /**
   * The shape that makes the term MEAN something. `estimateMaintenance` fits
   * maintenance partly to logged intake, so a flat log at any level reads as
   * maintenance by construction — what this detects is a CHANGE. Two weeks at
   * `before`, then two weeks at `after`, which is what a cut looks like in a
   * diary and is the case where the scale alone is still mostly water.
   */
  const cut = (after: number, before: number, protein?: number): Signal[] => {
    const out: Signal[] = [];
    for (let d = 1; d <= 28; d++) {
      out.push(sig("energyIntake", d <= 14 ? after : before, d));
      if (protein != null) out.push(sig("protein", protein, d));
    }
    // Both weigh-ins INSIDE the maintenance window, so `estimateMaintenance`
    // takes its energy-balance path rather than the bodyweight heuristic — the
    // path this athlete is meant to exercise. (A row stamped exactly 28 days
    // back falls outside a 28-day window; 26 is comfortably inside it.)
    out.push(sig("bodyMass", 80, 26), sig("bodyMass", 79.2, 1));
    return out;
  };

  it("measures the recent fortnight against the longer-run maintenance", () => {
    const b = energyBalance(cut(2100, 2900), { now: NOW });
    expect(b.sufficient).toBe(true);
    expect(b.days).toBe(14);
    expect(b.avgIntake).toBe(2100);
    expect(b.maintenance!).toBeGreaterThan(2500);
    expect(b.balanceKcal!).toBeLessThan(0);
    expect(b.balancePct!).toBeLessThan(-FUEL_DEADBAND_PCT);
  });

  it("computes protein per kg from the athlete's own body mass", () => {
    const b = energyBalance(cut(2100, 2900, 120), { now: NOW });
    expect(b.bodyMassKg).toBe(79.2);
    expect(b.proteinGPerKg).toBeCloseTo(120 / 79.2, 2);
    expect(b.proteinDays).toBe(14);
    expect(b.proteinSufficient).toBe(true);
  });

  it("gates protein SEPARATELY — it needs no maintenance estimate", () => {
    // Enough days, enough protein, but no weigh-in at all, so maintenance is
    // unknowable. The energy half must stay silent and the protein half must
    // still be readable — folding them into one flag would throw that away.
    const s = [...eating(10, 2400, 150), sig("bodyMass", 75, 2)];
    const b = energyBalance(s, { now: NOW });
    // A single weigh-in gives the bodyweight heuristic a number to work with,
    // so this athlete DOES get a maintenance estimate — from ~31 kcal/kg.
    expect(b.maintenanceBasis).toContain("bodyweight");
    expect(b.proteinSufficient).toBe(true);
    expect(b.proteinGPerKg).toBeCloseTo(2, 1);
  });

  it("leaves protein unreadable without a body mass to divide by", () => {
    const b = energyBalance(eating(10, 2400, 150), { now: NOW });
    expect(b.proteinGPerKg).toBeNull();
    expect(b.proteinSufficient).toBe(false);
  });

  it("will not stand a STALE weigh-in in for what the athlete weighs", () => {
    // A weight from two years ago is a different person, and it would not
    // degrade the read — it would fabricate one, both as the protein divisor
    // and as the input to the maintenance heuristic.
    const stale = [...eating(10, 2400, 150), sig("bodyMass", 75, FUEL_BODY_MASS_STALE_DAYS + 30)];
    const b = energyBalance(stale, { now: NOW });
    expect(b.bodyMassKg).toBeNull();
    expect(b.proteinGPerKg).toBeNull();
    expect(b.sufficient).toBe(false);
    expect(b.reason).toBe("noMaintenance");
    // …and a recent one is accepted, so the gate is the age and nothing else.
    const fresh = [...eating(10, 2400, 150), sig("bodyMass", 75, 3)];
    expect(energyBalance(fresh, { now: NOW }).bodyMassKg).toBe(75);
  });
});

describe("fuelAdjustment — the ramp", () => {
  /**
   * The ramp, driven through the real signal path at a KNOWN maintenance.
   *
   * Deliberately on the bodyweight-heuristic path (one weigh-in, so
   * `estimateMaintenance` cannot fit an energy balance and falls back to
   * ~31 kcal/kg): that is the one path where maintenance is completely
   * independent of logged intake, so `pct` in means exactly `pct` of
   * maintenance out and the ramp is tested rather than the estimator. A first
   * cut fitted maintenance from intake and the two moved together, which is the
   * circularity the module header is about — the test would have been checking
   * the fixture's arithmetic against itself.
   */
  const BW = 80;
  const MAINTENANCE = BW * 31;
  const atPct = (pct: number): Signal[] => {
    const out: Signal[] = [];
    const kcal = Math.round(MAINTENANCE * pct);
    for (let d = 1; d <= FUEL_WINDOW_DAYS; d++) out.push(sig("energyIntake", kcal, d));
    out.push(sig("bodyMass", BW, 1));
    return out;
  };

  it("costs nothing inside the deadband — that is the under-reporting allowance", () => {
    const f = fuelAdjustment(atPct(1 - FUEL_DEADBAND_PCT * 0.8), { now: NOW });
    expect(f.balance.sufficient).toBe(true);
    expect(f.points).toBe(0);
    expect(f.severity).toBe(0);
  });

  it("costs points once the shortfall clears the deadband", () => {
    const f = fuelAdjustment(atPct(0.75), { now: NOW });
    expect(f.points).toBeLessThan(0);
    expect(f.points).toBeGreaterThanOrEqual(-FUEL_PENALTY_MAX);
  });

  it("saturates — past the ceiling more deficit buys no more penalty", () => {
    const deep = fuelAdjustment(atPct(1 - FUEL_SATURATION_PCT), { now: NOW });
    const deeper = fuelAdjustment(atPct(0.5), { now: NOW });
    expect(deep.points).toBe(-FUEL_PENALTY_MAX);
    expect(deeper.points).toBe(-FUEL_PENALTY_MAX);
  });

  it("IS NEVER POSITIVE — a surplus earns nothing", () => {
    for (const pct of [1.05, 1.2, 1.5]) {
      const f = fuelAdjustment(atPct(pct), { now: NOW });
      expect(f.points).toBe(0);
    }
  });

  it("is exactly zero, not small, when the log cannot support a read", () => {
    const f = fuelAdjustment(eating(2, 2000), { now: NOW });
    expect(f.points).toBe(0);
    expect(f.balance.sufficient).toBe(false);
  });

  it("is monotonic — eating less never costs fewer points", () => {
    let prev = 1;
    for (const pct of [1.1, 1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6]) {
      const p = fuelAdjustment(atPct(pct), { now: NOW }).points;
      expect(p).toBeLessThanOrEqual(prev);
      prev = p;
    }
  });

  it("the three-way state uses ASYMMETRIC bands, because logging runs low", () => {
    expect(energyStateFromIntake(fuelAdjustment(atPct(1 - FUEL_DEADBAND_PCT), { now: NOW }).balance)).toBe("deficit");
    expect(energyStateFromIntake(fuelAdjustment(atPct(1), { now: NOW }).balance)).toBe("maintenance");
    expect(energyStateFromIntake(fuelAdjustment(atPct(1 + FUEL_SURPLUS_PCT), { now: NOW }).balance)).toBe("surplus");
    // …and the surplus threshold is the nearer one: a logged 6% surplus already
    // reads as a surplus while a logged 6% deficit does not yet read as one.
    expect(energyStateFromIntake(fuelAdjustment(atPct(0.94), { now: NOW }).balance)).toBe("maintenance");
  });

  it("returns null rather than 'maintenance' when it cannot tell", () => {
    expect(energyStateFromIntake(energyBalance([], { now: NOW }))).toBeNull();
  });
});

describe("the join reaches readiness", () => {
  const fatigue = computeFatigue(SAMPLE_TRAINING_LOG);

  it("under-eating takes points off the score", () => {
    const plain = computeReadiness(fatigue);
    const fed = computeReadiness(fatigue, undefined, 0, -4);
    expect(fed.score).toBe(plain.score - 4);
    expect(fed.fuelAdj).toBe(-4);
  });

  it("a positive term cannot become a credit, even if a caller passes one", () => {
    const r = computeReadiness(fatigue, undefined, 0, 5);
    expect(r.fuelAdj).toBe(0);
    expect(r.score).toBe(computeReadiness(fatigue).score);
  });

  it("does NOT stand down for a wearable, unlike the heat prior", () => {
    const bio = {
      hrv: { today: 68, baseline: 62, unit: "ms", better: "high" as const },
      restingHr: { today: 52, baseline: 54, unit: "bpm", better: "low" as const },
      sleep: { today: 7.4, baseline: 7.2, unit: "h", better: "high" as const },
    };
    const withBio = computeReadiness(fatigue, bio, 0, 0);
    const withBioAndFuel = computeReadiness(fatigue, bio, 0, -5);
    expect(withBioAndFuel.score).toBe(withBio.score - 5);
  });

  it("the sum law holds — kept plus every cost is exactly 100", () => {
    for (const fuelAdj of [0, -1, -2, -3, -4, -5, -6]) {
      const d = readinessDeficit(SAMPLE_TRAINING_LOG, undefined, 0, fuelAdj);
      const total = d.kept + d.costs.reduce((a, c) => a + c.points, 0);
      expect(total).toBe(100);
    }
  });

  it("draws a fuel ARC — a cost that can't be drawn is a cost the ring can't defend", () => {
    const d = readinessDeficit(SAMPLE_TRAINING_LOG, undefined, 0, -5);
    const fuel = d.costs.find((c) => c.kind === "fuel");
    expect(fuel).toBeDefined();
    expect(fuel!.points).toBeGreaterThan(0);
    expect(d.fuelAdj).toBe(-5);
  });

  it("draws NO fuel arc when the term is zero", () => {
    const d = readinessDeficit(SAMPLE_TRAINING_LOG, undefined, 0, 0);
    expect(d.costs.some((c) => c.kind === "fuel")).toBe(false);
  });

  it("the ring's arcs stay in their fixed slot order", () => {
    const d = readinessDeficit(SAMPLE_TRAINING_LOG, undefined, 0, -4);
    const order = d.costs.map((c) => c.kind);
    const rank = { tissue: 0, conditioning: 1, fuel: 2, wearable: 3, ceiling: 4 };
    for (let i = 1; i < order.length; i++) {
      expect(rank[order[i]!]).toBeGreaterThan(rank[order[i - 1]!]);
    }
  });

  it("the face can NAME under-eating — the one line the join exists for", () => {
    // A rested athlete carrying nothing but a deep fuel cost: the only thing
    // standing between them and a full number is what they ate.
    const rested: TrainingLog = [{ daysAgo: 20, items: [{ move: "Back Squat", e1rm: 100, topRpe: 6, hardSets: 1 }] }];
    const v = readinessVerdict(rested, undefined, 0, -6);
    expect(v.kind).toBe("fuel");
    expect(v.key).toBe("w.home.readiness.verdictFuel");
  });

  it("the provenance line reports the DEPTH, not the points the arc already shows", () => {
    const fuel = fuelAdjustment(sampleNutritionSignals(NOW) as Signal[], { now: NOW });
    const facts = readinessFacts(SAMPLE_TRAINING_LOG, undefined, 0, fuel);
    const line = facts.find((f) => f.key === "w.home.readiness.factFuel");
    expect(line).toBeDefined();
    // A percentage of maintenance, not a point count — the arc carries the cost.
    expect(line!.value).toBe(Math.round(-fuel.balance.balancePct! * 100));
    expect(line!.value).toBeGreaterThan(Math.abs(fuel.points));
  });

  it("says nothing in the provenance line when there is nothing to report", () => {
    const facts = readinessFacts(SAMPLE_TRAINING_LOG, undefined, 0, fuelAdjustment([], { now: NOW }));
    expect(facts.some((f) => f.key === "w.home.readiness.factFuel")).toBe(false);
  });

  it("reaches the PRESCRIPTION, not just the number on the card", () => {
    const fed = prescribeSession(SAMPLE_TRAINING_LOG, undefined, { fuelAdj: 0 });
    const starved = prescribeSession(SAMPLE_TRAINING_LOG, undefined, { fuelAdj: -6 });
    expect(starved.readiness).toBe(fed.readiness - 6);
  });

  it("every existing caller resolves unchanged — the term is optional and additive", () => {
    expect(computeReadiness(fatigue).score).toBe(computeReadiness(fatigue, undefined, 0, 0).score);
    expect(readinessDeficit(SAMPLE_TRAINING_LOG).costs).toEqual(
      readinessDeficit(SAMPLE_TRAINING_LOG, undefined, 0, 0).costs,
    );
  });
});

describe("the sample athlete — the demo, end to end", () => {
  it("reads a real deficit off a real-shaped diary", () => {
    const f = fuelAdjustment(sampleNutritionSignals(NOW) as Signal[], { now: NOW });
    expect(f.balance.sufficient).toBe(true);
    expect(f.balance.days).toBe(FUEL_WINDOW_DAYS);
    expect(energyStateFromIntake(f.balance)).toBe("deficit");
    expect(f.points).toBeLessThan(0);
    // …and the readiness number knows it, which is the whole claim.
    const withFood = computeReadiness(computeFatigue(SAMPLE_TRAINING_LOG), undefined, 0, f.points);
    const blind = computeReadiness(computeFatigue(SAMPLE_TRAINING_LOG));
    expect(withFood.score).toBeLessThan(blind.score);
  });
});
