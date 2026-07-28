import { describe, it, expect } from "vitest";
import { CHECKIN_COOLDOWN_MS, checkinCooldownRemainingMs, CHECKIN_STEP_COUNT, CHECKIN_METRICS } from "./checkin-flow";

describe("checkin cooldown", () => {
  const now = 1_000_000_000_000;
  it("is a 6-hour window", () => {
    expect(CHECKIN_COOLDOWN_MS).toBe(6 * 60 * 60 * 1000);
  });
  it("reports the full window right after a log", () => {
    expect(checkinCooldownRemainingMs(now, now)).toBe(CHECKIN_COOLDOWN_MS);
  });
  it("counts down as time passes", () => {
    const twoHours = 2 * 60 * 60 * 1000;
    expect(checkinCooldownRemainingMs(now - twoHours, now)).toBe(4 * 60 * 60 * 1000);
  });
  it("clamps to 0 once the window is open again", () => {
    const sevenHours = 7 * 60 * 60 * 1000;
    expect(checkinCooldownRemainingMs(now - sevenHours, now)).toBe(0);
  });
  it("has one flow step per metric plus a details step", () => {
    expect(CHECKIN_STEP_COUNT).toBe(CHECKIN_METRICS.length + 1);
  });
});
import { describe, it, expect } from "vitest";
import {
  CHECKIN_METRICS,
  quickCheckinMetrics,
  answeredMetrics,
  outstandingMetrics,
  checkinCompleteness,
  firstOutstandingStep,
  checkinSteps,
  dayCompleteness,
  firstOutstandingIndex,
  stepAnswered,
  QUICK_CHECKIN_METRIC,
} from "./checkin-flow";
import { checkinFeeling, checkinRating } from "./readiness-feeling";

describe("one tap answers one question", () => {
  it("writes ONLY the metric it asked about", () => {
    // THE REGRESSION: this used to write the rating into all four, inventing
    // three measurements the athlete never gave — which the volume profile then
    // showed back to them as "measured".
    expect(quickCheckinMetrics(4)).toEqual({ energy: 4, sleep: null, soreness: null, mood: null });
    expect(QUICK_CHECKIN_METRIC).toBe("energy");
  });

  it("clamps a nonsense rating onto the scale", () => {
    expect(quickCheckinMetrics(9).energy).toBe(5);
    expect(quickCheckinMetrics(0).energy).toBe(1);
    expect(quickCheckinMetrics(3.4).energy).toBe(3);
  });

  it("still resolves to the same feeling the athlete picked", () => {
    // The whole point of the old fabrication was that checkinRating averaged
    // four equal numbers. It averages whatever is PRESENT, so one is enough.
    for (const [rating, feeling] of [[5, "primed"], [4, "good"], [3, "flat"], [2, "wrecked"]] as const) {
      const c = quickCheckinMetrics(rating);
      expect(checkinRating(c)).toBe(rating);
      expect(checkinFeeling(c)).toBe(feeling);
    }
  });

  it("knows what has been answered and what is still outstanding", () => {
    const quick = quickCheckinMetrics(4);
    expect(answeredMetrics(quick)).toEqual(["energy"]);
    expect(outstandingMetrics(quick)).toEqual(["sleep", "soreness", "mood"]);
    expect(checkinCompleteness(quick)).toEqual({ answered: 1, total: 4, complete: false });

    const full = { energy: 4, sleep: 3, soreness: 5, mood: 4 };
    expect(outstandingMetrics(full)).toEqual([]);
    expect(checkinCompleteness(full).complete).toBe(true);
  });

  it("treats an off-scale or missing value as unanswered, not as a middling 3", () => {
    const junk = { energy: 4, sleep: null, soreness: 0, mood: 99 };
    expect(answeredMetrics(junk)).toEqual(["energy"]);
    expect(answeredMetrics(null)).toEqual([]);
    expect(checkinCompleteness(undefined)).toEqual({ answered: 0, total: 4, complete: false });
  });

  it("outstanding follows the flow's own order", () => {
    expect(outstandingMetrics({})).toEqual(CHECKIN_METRICS.map((m) => m.key));
  });

  it("opens the follow-up on the first unanswered question", () => {
    // After the quick tap answers Energy, the follow-up starts at Sleep (1).
    expect(firstOutstandingStep(quickCheckinMetrics(4))).toBe(1);
    // Nothing answered → the very first question.
    expect(firstOutstandingStep({})).toBe(0);
    // A gap in the middle is where it resumes, not blindly step 1.
    expect(firstOutstandingStep({ energy: 4, sleep: 3, soreness: null, mood: null })).toBe(2);
    // All four in → the details/submit card.
    expect(firstOutstandingStep({ energy: 4, sleep: 3, soreness: 5, mood: 4 })).toBe(CHECKIN_METRICS.length);
  });
});

describe("one card — the day and its sessions", () => {
  const S = (id: string, title: string, h: number, feel?: number | null) => ({
    id, title, startedAt: new Date(Date.UTC(2026, 6, 16, h)).toISOString(), feel: feel ?? null,
  });

  it("a rest day is exactly the four daily questions plus details", () => {
    const steps = checkinSteps([]);
    expect(steps.map((s) => s.kind)).toEqual(["metric", "metric", "metric", "metric", "details"]);
  });

  it("a training day asks once per session, in the order the day happened", () => {
    const steps = checkinSteps([S("b", "Evening intervals", 18), S("a", "Morning squats", 7)]);
    expect(steps.map((s) => s.kind)).toEqual(["metric", "metric", "metric", "metric", "effort", "effort", "details"]);
    const efforts = steps.filter((s): s is Extract<typeof s, { kind: "effort" }> => s.kind === "effort");
    // Sorted by start time, not by the order the client happened to pass them.
    expect(efforts.map((e) => e.session.title)).toEqual(["Morning squats", "Evening intervals"]);
  });

  it("a hard lift and an easy jog are two questions, not one", () => {
    const sessions = [S("a", "Squats", 7), S("b", "Jog", 18)];
    const { total } = dayCompleteness({ energy: 4, sleep: 4, soreness: 4, mood: 4 }, sessions);
    expect(total).toBe(6); // four daily + two sessions
  });

  it("counts completeness across both halves", () => {
    const sessions = [S("a", "Squats", 7, 4), S("b", "Jog", 18)];
    const done = dayCompleteness({ energy: 4, sleep: null, soreness: null, mood: null }, sessions);
    expect(done).toEqual({ answered: 2, total: 6, complete: false }); // energy + the rated session
    const all = dayCompleteness({ energy: 4, sleep: 3, soreness: 5, mood: 4 }, [S("a", "Squats", 7, 4), S("b", "Jog", 18, 2)]);
    expect(all.complete).toBe(true);
  });

  it("resumes at the first genuinely unanswered step, daily or session", () => {
    const sessions = [S("a", "Squats", 7), S("b", "Jog", 18)];
    // Only energy in → resume at Sleep (index 1).
    expect(firstOutstandingIndex(quickCheckinMetrics(4), sessions)).toBe(1);
    // All four daily in → resume at the FIRST session's effort (index 4).
    expect(firstOutstandingIndex({ energy: 4, sleep: 3, soreness: 5, mood: 4 }, sessions)).toBe(4);
    // First session rated → resume at the second (index 5).
    expect(firstOutstandingIndex({ energy: 4, sleep: 3, soreness: 5, mood: 4 }, [S("a", "Squats", 7, 4), S("b", "Jog", 18)])).toBe(5);
    // Everything in → the details card (the last index).
    const full = [S("a", "Squats", 7, 4), S("b", "Jog", 18, 2)];
    expect(firstOutstandingIndex({ energy: 4, sleep: 3, soreness: 5, mood: 4 }, full)).toBe(checkinSteps(full).length - 1);
  });

  it("an off-scale stored effort counts as unanswered", () => {
    const sessions = [S("a", "Squats", 7, 0 as unknown as number)];
    expect(stepAnswered(checkinSteps(sessions)[4]!, {})).toBe(false);
  });
});
