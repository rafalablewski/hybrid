import { describe, it, expect } from "vitest";
import { sorenessFromCheckin, checkinFromSoreness, freshnessFromCheckin } from "./checkin-scales";
import { checkinRating, feelingFromRating } from "./readiness-feeling";
import { CHECKIN_METRICS } from "./checkin-flow";

/**
 * These tests exist to stop the `soreness` column's name from lying its way
 * back into a model. The column stores FRESHNESS (5 = fresh); the estimator
 * once read it as soreness and quietly punished athletes for feeling good.
 */
describe("the check-in soreness column stores freshness", () => {
  it("converts the stored value into real soreness", () => {
    // 5 in the column means "my muscles feel fresh" → soreness 1.
    expect(sorenessFromCheckin(5)).toBe(1);
    expect(sorenessFromCheckin(1)).toBe(5);
    expect(sorenessFromCheckin(3)).toBe(3);
  });

  it("round-trips", () => {
    for (const v of [1, 2, 3, 4, 5]) expect(checkinFromSoreness(sorenessFromCheckin(v)!)).toBe(v);
  });

  it("leaves an unreported metric unknown rather than middling", () => {
    for (const bad of [null, undefined, 0, 6, NaN, "4" as unknown as number]) {
      expect(sorenessFromCheckin(bad)).toBeNull();
      expect(freshnessFromCheckin(bad)).toBeNull();
    }
  });

  it("agrees with every writer in the app", () => {
    // 1. The guided flow asks about FRESHNESS, not soreness.
    expect(CHECKIN_METRICS.find((m) => m.key === "soreness")!.questionKey).toBe("w.recovery.checkins.qSoreness");

    // 2. checkinRating averages all four metrics as higher = better, which is
    //    only correct if the stored soreness value is a freshness reading.
    expect(checkinRating({ energy: 5, sleep: 5, soreness: 5, mood: 5 })).toBe(5);
    expect(feelingFromRating(checkinRating({ energy: 5, sleep: 5, soreness: 5, mood: 5 })!)).toBe("primed");
    expect(feelingFromRating(checkinRating({ energy: 1, sleep: 1, soreness: 1, mood: 1 })!)).toBe("wrecked");

    // 3. …so the athlete who feels PRIMED is the one with the LEAST soreness.
    expect(sorenessFromCheckin(5)).toBeLessThan(sorenessFromCheckin(1)!);
  });
});
