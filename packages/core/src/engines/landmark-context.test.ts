import { describe, it, expect } from "vitest";
import {
  sleepFromCheckins,
  bodyweightTrend,
  energyBalanceFromBodyweight,
  measuredProfile,
  withMeasured,
  measuredFields,
} from "./landmark-context";
import type { RecoveryReport } from "./landmark-adapt";
import type { BodyweightPoint } from "../bodyweight";

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
    expect(withMeasured({ experience: "beginner" }, measured)).toEqual({ experience: "beginner", sleep: undefined, nutrition: undefined });
  });
});
