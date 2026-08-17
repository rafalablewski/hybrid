import { describe, it, expect } from "vitest";
import {
  sleepFromCheckins,
  bodyweightTrend,
  energyBalanceFromBodyweight,
  measuredProfile,
  withMeasured,
  measuredFields,
} from "./landmark-context";
import { personalizeLandmarks, NUTRITION_RECOVERY, proteinRecovery } from "./landmark-profile";
import { FUEL_MIN_DAYS, FUEL_WINDOW_DAYS } from "./fuel";
import type { RecoveryReport } from "./landmark-adapt";
import type { BodyweightPoint } from "../bodyweight";
import type { Signal } from "./signals";

const NOW = new Date("2026-06-16T12:00:00.000Z").getTime();
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

/** Daily check-ins for the last `n` days, each with the given sleep score. */
const checkins = (n: number, sleep: number | null, extra: Partial<RecoveryReport> = {}): RecoveryReport[] =>
  Array.from({ length: n }, (_, i) => ({ date: daysAgo(i), sleep, ...extra }));

/** A weigh-in every 3 days, drifting by `kgPerWeek` toward TODAY — so today's
 *  weight is `todayKg` and older weigh-ins run backwards up (or down) the trend. */
const weighIns = (weeks: number, todayKg: number, kgPerWeek: number): BodyweightPoint[] => {
  const out: BodyweightPoint[] = [];
  for (let d = 0; d <= weeks * 7; d += 3) {
    out.push({ date: daysAgo(d), weightKg: Math.round((todayKg - (kgPerWeek * d) / 7) * 10) / 10 });
  }
  return out;
};

describe("sleep from check-ins", () => {
  it("averages the check-in's own 1–5 scale, unreinterpreted", () => {
    expect(sleepFromCheckins([{ date: daysAgo(1), sleep: 4 }, { date: daysAgo(2), sleep: 3 }], { now: NOW })).toBe(3.5);
  });

  it("is null when nobody checked in, or checked in without a sleep score", () => {
    expect(sleepFromCheckins([], { now: NOW })).toBeNull();
    expect(sleepFromCheckins([{ date: daysAgo(1), soreness: 4 }], { now: NOW })).toBeNull();
  });

  it("ignores reports outside the window, in the future, or off-scale", () => {
    const reports: RecoveryReport[] = [
      { date: daysAgo(1), sleep: 5 },
      { date: daysAgo(90), sleep: 1 },       // too old
      { date: daysAgo(-3), sleep: 1 },       // the future
      { date: daysAgo(2), sleep: 9 },        // off the scale
      { date: "not-a-date", sleep: 1 },
    ];
    expect(sleepFromCheckins(reports, { now: NOW })).toBe(5);
  });
});

describe("the bodyweight trend", () => {
  it("needs three measurements across two weeks before it will fit", () => {
    expect(bodyweightTrend([], { now: NOW })).toBeNull();
    expect(bodyweightTrend([{ date: daysAgo(1), weightKg: 80 }, { date: daysAgo(20), weightKg: 82 }], { now: NOW })).toBeNull();
    // Three points, but only a week apart.
    expect(bodyweightTrend(weighIns(1, 80, -0.5), { now: NOW })).toBeNull();
    expect(bodyweightTrend(weighIns(4, 80, -0.5), { now: NOW })).not.toBeNull();
  });

  it("reports the rate as a percentage of body mass per week", () => {
    const losing = bodyweightTrend(weighIns(6, 80, -0.4), { now: NOW })!;
    expect(losing.kgPerDay).toBeLessThan(0);
    expect(losing.percentPerWeek).toBeCloseTo(-0.5, 1); // 0.4 kg of 80 kg
    const gaining = bodyweightTrend(weighIns(6, 80, 0.4), { now: NOW })!;
    expect(gaining.percentPerWeek).toBeCloseTo(0.5, 1);
  });

  it("is not thrown by one bad weigh-in", () => {
    const points = weighIns(6, 80, -0.4);
    points[3] = { ...points[3]!, weightKg: points[3]!.weightKg - 2 }; // a dehydrated morning
    const trend = bodyweightTrend(points, { now: NOW })!;
    expect(trend.percentPerWeek).toBeLessThan(0);
    expect(trend.percentPerWeek).toBeGreaterThan(-1.2);
  });
});

describe("energy availability from the scale", () => {
  it("reads a falling scale as a deficit and a rising one as a surplus", () => {
    expect(energyBalanceFromBodyweight(weighIns(6, 80, -0.4), { now: NOW })).toBe("deficit");
    expect(energyBalanceFromBodyweight(weighIns(6, 80, 0.4), { now: NOW })).toBe("surplus");
  });

  it("calls a flat scale maintenance — water-weight noise is not a diet", () => {
    expect(energyBalanceFromBodyweight(weighIns(6, 80, 0.05), { now: NOW })).toBe("maintenance");
  });

  it("leaves an unknown unknown rather than assuming maintenance", () => {
    // Assuming maintenance would silently hand back a recovery multiplier of 1.
    expect(energyBalanceFromBodyweight([], { now: NOW })).toBeNull();
    expect(energyBalanceFromBodyweight([{ date: daysAgo(2), weightKg: 80 }], { now: NOW })).toBeNull();
  });
});

describe("measured defaults under the athlete's own answers", () => {
  it("collects what the app can answer for itself", () => {
    const m = measuredProfile({ checkins: checkins(10, 2), bodyweight: weighIns(6, 80, -0.4), now: NOW });
    expect(m.sleep).toBe(2);
    expect(m.nutrition).toBe("deficit");
    expect(m.measured).toEqual(["sleep", "nutrition"]);
  });

  it("never derives stress — the check-in never asked", () => {
    const m = measuredProfile({ checkins: checkins(10, 3, { mood: 1, energy: 1 }), now: NOW });
    expect(m.measured).not.toContain("stress");
    expect((m as unknown as Record<string, unknown>).stress).toBeUndefined();
  });

  it("what the athlete typed always wins over the measurement", () => {
    const measured = measuredProfile({ checkins: checkins(10, 2), bodyweight: weighIns(6, 80, -0.4), now: NOW });
    const merged = withMeasured({ sleep: 5, experience: "advanced" }, measured);
    expect(merged.sleep).toBe(5);          // typed
    expect(merged.nutrition).toBe("deficit"); // measured, nothing typed
    expect(merged.experience).toBe("advanced");
  });

  it("reports which fields ended up measured, so the UI can mark them", () => {
    const measured = measuredProfile({ checkins: checkins(10, 2), bodyweight: weighIns(6, 80, -0.4), now: NOW });
    expect([...measuredFields({}, measured)]).toEqual(["sleep", "nutrition"]);
    expect([...measuredFields({ sleep: 5 }, measured)]).toEqual(["nutrition"]);
    expect([...measuredFields({ sleep: 5, nutrition: "surplus" }, measured)]).toEqual([]);
  });

  it("with nothing measured, the stored profile passes through untouched", () => {
    const measured = measuredProfile({ now: NOW });
    expect(measured.measured).toEqual([]);
    expect(withMeasured({ experience: "beginner" }, measured)).toEqual({ experience: "beginner", sleep: undefined, nutrition: undefined, heightCm: undefined });
  });

  it("takes height from the body log rather than asking for it twice", () => {
    const m = measuredProfile({ heightCm: 183, now: NOW });
    expect(m.heightCm).toBe(183);
    expect(m.measured).toContain("heightCm");
    expect(withMeasured({}, m).heightCm).toBe(183);
    // …and the athlete's own typed height still wins over the logged one.
    expect(withMeasured({ heightCm: 179 }, m).heightCm).toBe(179);
    expect([...measuredFields({ heightCm: 179 }, m)]).not.toContain("heightCm");
  });

  it("ignores an unset or implausible logged height", () => {
    expect(measuredProfile({ now: NOW }).measured).not.toContain("heightCm");
    expect(measuredProfile({ heightCm: null, now: NOW }).measured).not.toContain("heightCm");
    expect(measuredProfile({ heightCm: 72, now: NOW }).measured).not.toContain("heightCm");
  });
});

/* ── THE NUTRITION JOIN: the log leads, the scale backs it up ──────────────── */

// Nutrition days are LOCAL calendar days, so these fixtures are built locally
// (the rest of this file works in UTC, which is fine for weigh-ins and
// check-ins — those are read as instants, not as days on a diary).
const LOCAL_NOW = new Date(2026, 5, 16, 18).getTime();
const localAt = (d: number, hour = 13) => {
  const x = new Date(LOCAL_NOW - d * 86_400_000);
  return new Date(x.getFullYear(), x.getMonth(), x.getDate(), hour).toISOString();
};
const nsig = (kind: Signal["kind"], value: number, d: number): Signal => ({
  athleteId: "u", kind, value, unit: "", source: "manual", ts: localAt(d),
});

/** A diary at `pct` of the bodyweight-heuristic maintenance (~31 kcal/kg) —
 *  the one maintenance path that is independent of logged intake, so `pct`
 *  means exactly what it says. `days` lets a test sit under the sufficiency
 *  floor on purpose. */
const diary = (pct: number, opts: { days?: number; proteinG?: number; bwKg?: number } = {}): Signal[] => {
  const bw = opts.bwKg ?? 80;
  const kcal = Math.round(bw * 31 * pct);
  const out: Signal[] = [];
  for (let d = 1; d <= (opts.days ?? FUEL_WINDOW_DAYS); d++) {
    out.push(nsig("energyIntake", kcal, d));
    if (opts.proteinG != null) out.push(nsig("protein", opts.proteinG, d));
  }
  out.push(nsig("bodyMass", bw, 1));
  return out;
};

/** Weigh-ins built on the LOCAL clock, to pair with the diaries above. */
const localWeighIns = (weeks: number, todayKg: number, kgPerWeek: number): BodyweightPoint[] => {
  const out: BodyweightPoint[] = [];
  for (let d = 0; d <= weeks * 7; d += 3) {
    out.push({ date: localAt(d), weightKg: Math.round((todayKg - (kgPerWeek * d) / 7) * 10) / 10 });
  }
  return out;
};

describe("energy availability — the log leads", () => {
  it("reads the DIARY when it can, and says so", () => {
    const m = measuredProfile({ nutritionSignals: diary(0.75), now: LOCAL_NOW });
    expect(m.nutrition).toBe("deficit");
    expect(m.nutritionBasis).toBe("intake");
    expect(m.measured).toContain("nutrition");
  });

  it("OVERRULES the scale when the two disagree — the log is the earlier answer", () => {
    // The scale says the athlete is gaining; the diary, over the last fortnight,
    // says they have started eating well under maintenance. On day four of a cut
    // the trend is still last month's water and the diary is already right.
    const m = measuredProfile({
      nutritionSignals: diary(0.75),
      bodyweight: localWeighIns(6, 82, +0.5),
      now: LOCAL_NOW,
    });
    expect(m.nutrition).toBe("deficit");
    expect(m.nutritionBasis).toBe("intake");
  });

  it("falls back to the SCALE when the diary is too thin to clear the gates", () => {
    const m = measuredProfile({
      nutritionSignals: diary(0.75, { days: FUEL_MIN_DAYS - 1 }),
      bodyweight: localWeighIns(6, 80, -0.4),
      now: LOCAL_NOW,
    });
    expect(m.nutrition).toBe("deficit");
    expect(m.nutritionBasis).toBe("bodyweight");
    // …which is also how an athlete whose logging is fiction still gets caught:
    // a log too thin to be believed IS the fallback firing.
    expect(m.energy!.sufficient).toBe(false);
  });

  it("says nothing at all when neither path can answer", () => {
    const m = measuredProfile({ now: LOCAL_NOW });
    expect(m.nutrition).toBeUndefined();
    expect(m.nutritionBasis).toBeUndefined();
    expect(m.measured).not.toContain("nutrition");
  });

  it("what the athlete typed still wins over BOTH paths", () => {
    const m = measuredProfile({ nutritionSignals: diary(0.75), now: LOCAL_NOW });
    expect(withMeasured({ nutrition: "surplus" }, m).nutrition).toBe("surplus");
    expect([...measuredFields({ nutrition: "surplus" }, m)]).not.toContain("nutrition");
  });

  it("carries the whole read, so a SILENCE can be explained rather than just shown", () => {
    const m = measuredProfile({ nutritionSignals: diary(0.75, { days: 2 }), now: LOCAL_NOW });
    expect(m.energy!.reason).toBe("tooFewDays");
    expect(m.energy!.days).toBe(2);
  });
});

describe("protein — the half with no second path", () => {
  it("is read from the diary and applied to the recovery multiplier", () => {
    const m = measuredProfile({ nutritionSignals: diary(1, { proteinG: 80, bwKg: 80 }), now: LOCAL_NOW });
    expect(m.proteinGPerKg).toBeCloseTo(1, 2);
    expect(m.measured).toContain("proteinGPerKg");
    const p = personalizeLandmarks(withMeasured({}, m));
    expect(p.factors.find((f) => f.key === "protein")?.multiplier).toBe(proteinRecovery(1));
  });

  it("earns NO bonus above the plateau — more protein does not buy more sets", () => {
    const plenty = measuredProfile({ nutritionSignals: diary(1, { proteinG: 240, bwKg: 80 }), now: LOCAL_NOW });
    const enough = measuredProfile({ nutritionSignals: diary(1, { proteinG: 130, bwKg: 80 }), now: LOCAL_NOW });
    expect(proteinRecovery(plenty.proteinGPerKg!)).toBe(1);
    expect(proteinRecovery(enough.proteinGPerKg!)).toBe(1);
    // …and neither earns a factor row, because a multiplier of 1 moved nothing.
    expect(personalizeLandmarks(withMeasured({}, plenty)).factors.some((f) => f.key === "protein")).toBe(false);
  });

  it("is silent below its own day floor rather than applied off two days", () => {
    const m = measuredProfile({ nutritionSignals: diary(1, { proteinG: 60, days: FUEL_MIN_DAYS - 1 }), now: LOCAL_NOW });
    expect(m.proteinGPerKg).toBeUndefined();
    expect(m.measured).not.toContain("proteinGPerKg");
  });

  it("is never something the athlete can type — it is measured or absent", () => {
    const m = measuredProfile({ nutritionSignals: diary(1, { proteinG: 80, bwKg: 80 }), now: LOCAL_NOW });
    // A stored value cannot shadow it: sanitizeVolumeProfile does not accept the
    // field, so the only way it reaches the model is from the log.
    expect(withMeasured({ proteinGPerKg: 3 } as never, m).proteinGPerKg).toBeCloseTo(1, 2);
  });
});

describe("the two nutrition factors compound, and are bounded", () => {
  it("a deep deficit AND low protein cost more than either alone", () => {
    const both = personalizeLandmarks({ nutrition: "deficit", proteinGPerKg: 0.9 });
    const energyOnly = personalizeLandmarks({ nutrition: "deficit" });
    const proteinOnly = personalizeLandmarks({ proteinGPerKg: 0.9 });
    expect(both.recovery).toBeLessThan(energyOnly.recovery);
    expect(both.recovery).toBeLessThan(proteinOnly.recovery);
    expect(both.recovery).toBeCloseTo(NUTRITION_RECOVERY.deficit * proteinRecovery(0.9), 6);
  });

  it("protein does not tax landmark CONFIDENCE — logging food is a practice, not a fact about the body", () => {
    const withProtein = personalizeLandmarks({
      experience: "intermediate", ageYears: 30, bodyweightKg: 80, sleep: 4,
      stress: 2, nutrition: "maintenance", daysPerWeek: 4, proteinGPerKg: 1.8,
    });
    const without = personalizeLandmarks({
      experience: "intermediate", ageYears: 30, bodyweightKg: 80, sleep: 4,
      stress: 2, nutrition: "maintenance", daysPerWeek: 4,
    });
    expect(withProtein.confidence).toBe(1);
    expect(without.confidence).toBe(1);
  });

  it("a protein figure alone still counts as personalized", () => {
    const p = personalizeLandmarks({ proteinGPerKg: 0.8 });
    expect(p.personalized).toBe(true);
    expect(p.recovery).toBeLessThan(1);
  });
});
