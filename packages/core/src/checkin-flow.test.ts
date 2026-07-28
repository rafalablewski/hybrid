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
import {
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
  quickCheckinFeeling,
  quickCheckinPatch,
  checkinMetricPatch,
  checkinMetricWordKey,
  checkinScaleFeeling,
} from "./checkin-flow";
import { checkinFeeling, checkinRating, readinessLoadFactor, READINESS_LOAD_FACTOR } from "./readiness-feeling";

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

describe("the readiness question answers itself", () => {
  it("reports the tap, not the average of four different questions", () => {
    // THE REGRESSION: Today's picker drew `checkinFeeling` — the mean of every
    // metric present — under "how ready do you feel?". Tap Primed, then answer
    // the other three honestly, and the card came back highlighting a face the
    // athlete never chose and captioning it "you logged Good".
    const day = { energy: 5, sleep: 3, soreness: 2, mood: 4 };
    expect(checkinFeeling(day)).toBe("good"); // the day, averaged — a different question
    expect(quickCheckinFeeling(day)).toBe("primed"); // what was actually tapped
  });

  it("round-trips every level of the picker", () => {
    for (const [rating, feeling] of [[5, "primed"], [4, "good"], [3, "flat"], [2, "wrecked"]] as const) {
      expect(quickCheckinFeeling(quickCheckinMetrics(rating))).toBe(feeling);
    }
  });

  it("is null when the readiness question itself is unanswered", () => {
    // A day whose sleep and mood are logged has NOT answered "how ready do you
    // feel" — the card must show no selection rather than infer one.
    expect(quickCheckinFeeling({ energy: null, sleep: 4, soreness: 4, mood: 4 })).toBeNull();
    expect(quickCheckinFeeling(null)).toBeNull();
    expect(quickCheckinFeeling({})).toBeNull();
  });

  it("names the quick metric in the picker's own vocabulary", () => {
    // Same stored number, same face, so it must not have two names: Today said
    // "Primed" for a 5 while the wizard's own card said "Great".
    expect(checkinMetricWordKey("energy", 5)).toBe("w.recovery.readiness.primed");
    expect(checkinMetricWordKey("energy", 3)).toBe("w.recovery.readiness.flat");
    // The other three are not readiness questions — "Wrecked" is not an answer
    // to "how did you sleep?".
    expect(checkinMetricWordKey("sleep", 5)).toBe("w.recovery.checkins.scale5");
    expect(checkinMetricWordKey("mood", 3)).toBe("w.recovery.checkins.scale3");
  });

  it("agrees with the face drawn beside it", () => {
    for (const v of [1, 2, 3, 4, 5]) {
      expect(checkinMetricWordKey("energy", v)).toBe(`w.recovery.readiness.${checkinScaleFeeling(v)}`);
    }
  });
});

describe("a write may only touch what it answered", () => {
  it("a readiness tap sends one metric and no nulls", () => {
    // THE REGRESSION: this sent {energy, sleep: null, soreness: null, mood:
    // null}, which the route wrote over the day's row — so re-tapping readiness
    // in the afternoon deleted the sleep, freshness and mood logged that
    // morning. An omitted key leaves the stored value alone.
    expect(quickCheckinPatch(4)).toEqual({ energy: 4 });
    expect(Object.keys(quickCheckinPatch(4))).toEqual(["energy"]);
    expect(quickCheckinPatch(9)).toEqual({ energy: 5 });
  });

  it("the guided flow sends only the questions actually answered", () => {
    const ratings = { energy: 3, sleep: 5, soreness: 3, mood: 3 };
    // Sleep tapped; the rest walked past on their neutral default.
    expect(checkinMetricPatch(ratings, ["sleep"])).toEqual({ sleep: 5 });
    // A skipped question is absent, NOT a middling 3 — nothing downstream may
    // read a default as a measurement.
    expect("soreness" in checkinMetricPatch(ratings, ["sleep"])).toBe(false);
    expect(checkinMetricPatch(ratings, ["energy", "sleep", "soreness", "mood"])).toEqual(ratings);
    expect(checkinMetricPatch(ratings, [])).toEqual({});
  });

  it("clamps and rounds whatever it does send", () => {
    expect(checkinMetricPatch({ mood: 7.6 }, ["mood"])).toEqual({ mood: 5 });
    expect(checkinMetricPatch({ mood: Number.NaN }, ["mood"])).toEqual({});
    expect(checkinMetricPatch({}, ["mood"])).toEqual({});
  });
});

describe("one question, one number, every surface", () => {
  // The readiness pick drives four separate things: the picker's own
  // highlight, the week rail's readiness pill, the load multiplier, and the
  // nudge that QUOTES it back ("you're feeling flat today"). Each of them read
  // `checkinFeeling` — the average — so on any day whose four answers weren't
  // equal, the app told the athlete they had said something they hadn't.
  const day = { energy: 5, sleep: 2, soreness: 2, mood: 3 };

  it("the average and the answer genuinely disagree", () => {
    expect(checkinFeeling(day)).toBe("flat");
    expect(quickCheckinFeeling(day)).toBe("primed");
  });

  it("the load factor follows the answer, not the average", () => {
    // Reading the average here deloaded an athlete who had just said they were
    // primed, and captioned it with their own supposed words.
    expect(readinessLoadFactor(quickCheckinFeeling(day))).toBe(READINESS_LOAD_FACTOR.primed);
    expect(readinessLoadFactor(quickCheckinFeeling(day))).not.toBe(readinessLoadFactor(checkinFeeling(day)));
  });

  it("no answer means no nudge, rather than one inferred from sleep and mood", () => {
    const noReadiness = { energy: null, sleep: 2, soreness: 2, mood: 2 };
    expect(quickCheckinFeeling(noReadiness)).toBeNull();
    expect(readinessLoadFactor(quickCheckinFeeling(noReadiness))).toBe(1);
  });
});
