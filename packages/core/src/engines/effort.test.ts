import { describe, it, expect } from "vitest";
import {
  objectiveSessionRpe,
  effortSamples,
  deriveEffortModel,
  predictReportedRpe,
  effectiveSessionRpe,
  personalTrainingLog,
  effortTrend,
  EFFORT_BIAS_MAX,
  EFFORT_BIAS_PRIOR_WEIGHT,
} from "./effort";
import { toTrainingLog } from "./session";
import { computeFatigue } from "./fatigue";
import { computeReadiness } from "./readiness";
import { computeInjuryRisk } from "./injury";
import type { LoggedSession } from "./session";

/** A 40-minute 10 km run — the session at the heart of the whole model. */
const run = (id: string, at: string, feel?: number): LoggedSession => ({
  id,
  title: "Easy run",
  startedAt: at,
  completedAt: new Date(Date.parse(at) + 40 * 60000).toISOString(),
  blocks: [{ kind: "cardio", name: "Running", discipline: "running", distance: 10, minutes: 40 }],
  ...(feel != null ? { feel } : {}),
});

const day = (n: number) => new Date(Date.parse("2026-01-01T08:00:00.000Z") + n * 86_400_000).toISOString();

describe("objectiveSessionRpe", () => {
  it("is the minutes-weighted mean RPE the log implies", () => {
    // A cardio block with no entered RPE defaults to 6 in sessionLoad.
    expect(objectiveSessionRpe(run("a", day(0)))).toBeCloseTo(6, 5);
  });

  it("follows an entered RPE", () => {
    const hard: LoggedSession = {
      ...run("a", day(0)),
      blocks: [{ kind: "cardio", name: "Running", discipline: "running", distance: 10, minutes: 40, rpe: 9 }],
    };
    expect(objectiveSessionRpe(hard)).toBeCloseTo(9, 5);
  });

  it("is null when the session has no computable duration", () => {
    expect(objectiveSessionRpe({ id: "x", title: "", startedAt: day(0), blocks: [] })).toBeNull();
  });
});

describe("effortSamples", () => {
  it("keeps only sessions the athlete actually rated", () => {
    const s = effortSamples([run("a", day(0), 5), run("b", day(1))]);
    expect(s.map((x) => x.sessionId)).toEqual(["a"]);
    // feel 5 = "all out" = sRPE 10; the log implied 6.
    expect(s[0]!.reported).toBe(10);
    expect(s[0]!.objective).toBeCloseTo(6, 5);
    expect(s[0]!.residual).toBeCloseTo(4, 5);
  });
});

describe("deriveEffortModel", () => {
  it("stays at the prior with no evidence", () => {
    const m = deriveEffortModel([]);
    expect(m.bias).toBe(0);
    expect(m.personalized).toBe(false);
    expect(m.mae).toBeNull();
  });

  it("barely moves on a single session, and moves a long way on many", () => {
    const one = deriveEffortModel(effortSamples([run("a", day(0), 5)]));
    const many = deriveEffortModel(effortSamples(Array.from({ length: 20 }, (_, i) => run(`s${i}`, day(i), 5))));
    expect(Math.abs(one.bias)).toBeLessThan(1);
    expect(many.bias).toBeGreaterThan(2);
    expect(many.bias).toBeGreaterThan(one.bias);
  });

  it("never exceeds the bounds, however extreme the history", () => {
    const extreme = deriveEffortModel(effortSamples(Array.from({ length: 200 }, (_, i) => run(`s${i}`, day(i), 5))));
    expect(extreme.bias).toBeLessThanOrEqual(EFFORT_BIAS_MAX);
    const soft = deriveEffortModel(effortSamples(Array.from({ length: 200 }, (_, i) => run(`s${i}`, day(i), 1))));
    expect(soft.bias).toBeGreaterThanOrEqual(-EFFORT_BIAS_MAX);
  });

  it("separates the two athletes who logged the identical session", () => {
    // THE case the module exists for: same 10 km in 40 min, 12 times each.
    const floated = deriveEffortModel(effortSamples(Array.from({ length: 12 }, (_, i) => run(`f${i}`, day(i), 2))));
    const destroyed = deriveEffortModel(effortSamples(Array.from({ length: 12 }, (_, i) => run(`d${i}`, day(i), 5))));
    expect(destroyed.bias).toBeGreaterThan(floated.bias + 3);
    // and the engine's prediction for the SAME next session differs accordingly
    expect(predictReportedRpe(6, destroyed)).toBeGreaterThan(predictReportedRpe(6, floated) + 3);
  });

  it("scores itself out-of-sample, and beats the unpersonalised baseline on a biased athlete", () => {
    const m = deriveEffortModel(effortSamples(Array.from({ length: 10 }, (_, i) => run(`s${i}`, day(i), 5))));
    expect(m.mae).not.toBeNull();
    expect(m.baselineMae).not.toBeNull();
    expect(m.mae!).toBeLessThan(m.baselineMae!);
  });

  it("does NOT claim an improvement for an athlete who has no bias", () => {
    // feel 3 = sRPE 6 = exactly what the log implies → residual 0 throughout.
    const m = deriveEffortModel(effortSamples(Array.from({ length: 10 }, (_, i) => run(`s${i}`, day(i), 3))));
    expect(m.bias).toBe(0);
    expect(m.mae).toBe(m.baselineMae);
  });

  it("honours a custom prior weight", () => {
    const samples = effortSamples(Array.from({ length: 6 }, (_, i) => run(`s${i}`, day(i), 5)));
    const stiff = deriveEffortModel(samples, EFFORT_BIAS_PRIOR_WEIGHT * 10);
    const loose = deriveEffortModel(samples, 1);
    expect(loose.bias).toBeGreaterThan(stiff.bias);
  });
});

describe("effectiveSessionRpe", () => {
  it("prefers the athlete's own answer over the model", () => {
    const model = deriveEffortModel(effortSamples(Array.from({ length: 20 }, (_, i) => run(`s${i}`, day(i), 5))));
    expect(effectiveSessionRpe(run("x", day(30), 1), model)).toBe(2); // feel 1 → sRPE 2
  });

  it("falls back to the model's prediction for an unrated session", () => {
    const model = deriveEffortModel(effortSamples(Array.from({ length: 20 }, (_, i) => run(`s${i}`, day(i), 5))));
    const predicted = effectiveSessionRpe(run("x", day(30)), model)!;
    expect(predicted).toBeGreaterThan(6); // the objective 6, corrected upward
  });

  it("is exactly the objective effort with no model", () => {
    expect(effectiveSessionRpe(run("x", day(0)))).toBeCloseTo(6, 5);
  });
});

// The point of the whole exercise: a reported feeling has to CHANGE something.
describe("personalTrainingLog", () => {
  // A LIFT, not a run: "Running" doesn't resolve in the movements catalog, so
  // cardio contributes to the energy systems but not to muscle fatigue — and
  // readiness reads muscles only. A squat exercises the path under test.
  const squat = (id: string, at: string, feel?: number, sets = 5): LoggedSession => ({
    id,
    title: "Squat day",
    startedAt: at,
    completedAt: new Date(Date.parse(at) + 50 * 60000).toISOString(),
    blocks: [{ kind: "strength", name: "Back Squat", sets: Array.from({ length: sets }, () => ({ load: "100", reps: "5" })) }],
    ...(feel != null ? { feel } : {}),
  });
  const hist = (feel?: number) => Array.from({ length: 8 }, (_, i) => squat(`s${i}`, day(i), feel));
  // An hour after the LAST session: fatigue has a 2-day half-life, so a `now`
  // days later decays every athlete to the same rested ceiling and the
  // comparison below would pass or fail for the wrong reason.
  const now = Date.parse(day(7)) + 3_600_000;

  it("is bit-for-bit the old behaviour when nobody has rated anything", () => {
    const sessions = hist();
    expect(personalTrainingLog(sessions, now)).toEqual(toTrainingLog(sessions, now));
  });

  it("carries the athlete's reported effort into the training log", () => {
    expect(personalTrainingLog(hist(5), now)[0]!.items[0]!.topRpe).toBe(10);
    expect(personalTrainingLog(hist(1), now)[0]!.items[0]!.topRpe).toBe(2);
  });

  // Whether a UNIFORM rating moves readiness depends on a detail of the fatigue
  // engine that is easy to get wrong in either direction, so both regimes are
  // pinned. Muscle fatigue is normalised against the athlete's own max — but
  // that max is floored at 40, so the normalisation only cancels a uniform
  // shift once the athlete's raw load clears the floor.
  it("shifts readiness on a uniform rating while total load sits under the floor", () => {
    const wreckedR = computeReadiness(computeFatigue(personalTrainingLog(hist(5), now)));
    const easyR = computeReadiness(computeFatigue(personalTrainingLog(hist(1), now)));
    expect(easyR.score).toBeGreaterThan(wreckedR.score);
  });

  it("cancels a uniform rating once the load clears the normalisation floor", () => {
    const big = (feel: number) =>
      Array.from({ length: 8 }, (_, i) => squat(`s${i}`, day(i), feel, 20));
    const wreckedR = computeReadiness(computeFatigue(personalTrainingLog(big(5), now)));
    const easyR = computeReadiness(computeFatigue(personalTrainingLog(big(1), now)));
    expect(easyR.score).toBe(wreckedR.score);
  });

  it("moves ACWR and injury risk on identical objective training", () => {
    // The clinically meaningful payoff, and the strongest demonstration that
    // the wiring does something real: 28 days of the SAME squat session, and
    // the only difference is what the athlete said the last week cost them.
    // ACWR is sRPE-based, so a reported effort is exactly its input.
    const month = (recent: number, older: number) =>
      Array.from({ length: 28 }, (_, i) => squat(`s${i}`, day(27 - i), i < 7 ? recent : older));
    const monthNow = Date.parse(day(27)) + 3_600_000;
    const hard = computeInjuryRisk(personalTrainingLog(month(5, 3), monthNow));
    const easy = computeInjuryRisk(personalTrainingLog(month(1, 3), monthNow));
    expect(hard.tissues[0]!.acwr).toBeGreaterThan(easy.tissues[0]!.acwr);
    expect(hard.overall).toBeGreaterThan(easy.overall);
    // Concretely: a caution-band spike vs a detraining read, from the same log.
    expect(hard.tissues[0]!.acwr).toBeGreaterThan(1.3);
    expect(easy.tissues[0]!.acwr).toBeLessThan(0.8);
  });

  it("does not overwrite an RPE the athlete entered per block", () => {
    const explicit: LoggedSession = {
      ...run("a", day(0), 5),
      blocks: [{ kind: "cardio", name: "Running", discipline: "running", distance: 10, minutes: 40, rpe: 4 }],
    };
    expect(personalTrainingLog([explicit], now)[0]!.items[0]!.rpe).toBe(4);
  });
});

describe("effortTrend", () => {
  // Same objective session every week; the athlete reports it progressively
  // easier — the one honest fitness read a self-report can give.
  const easing = () =>
    effortSamples([
      run("a", day(0), 5),
      run("b", day(7), 5),
      run("c", day(14), 4),
      run("d", day(21), 4),
      run("e", day(28), 3),
      run("f", day(35), 3),
    ]);

  it("reads a falling residual as getting fitter", () => {
    const t = effortTrend(easing())!;
    expect(t.direction).toBe("fitter");
    expect(t.perMonth).toBeLessThan(0);
    expect(t.n).toBe(6);
    expect(t.days).toBe(35);
  });

  it("reads a rising residual as getting harder", () => {
    const worsening = effortSamples([
      run("a", day(0), 2), run("b", day(7), 2), run("c", day(14), 3),
      run("d", day(21), 3), run("e", day(28), 4), run("f", day(35), 5),
    ]);
    expect(effortTrend(worsening)!.direction).toBe("harder");
  });

  it("calls a steady athlete flat rather than inventing a direction", () => {
    const steady = effortSamples(Array.from({ length: 8 }, (_, i) => run(`s${i}`, day(i * 5), 4)));
    expect(effortTrend(steady)!.direction).toBe("flat");
  });

  it("refuses to draw a line through too few points, or too short a window", () => {
    expect(effortTrend(effortSamples([run("a", day(0), 5), run("b", day(30), 2)]))).toBeNull();
    // six points, but all inside a week
    const crammed = effortSamples(Array.from({ length: 6 }, (_, i) => run(`s${i}`, day(i), 5 - Math.floor(i / 2))));
    expect(effortTrend(crammed)).toBeNull();
  });
});
