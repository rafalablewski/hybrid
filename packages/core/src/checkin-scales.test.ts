import { describe, it, expect } from "vitest";
import { sorenessFromCheckin, checkinFromSoreness, freshnessFromCheckin } from "./checkin-scales";
import { checkinRating, feelingFromRating } from "./readiness-feeling";
import { CHECKIN_METRICS, metricLabelKey } from "./checkin-flow";
import { makeT } from "./i18n";

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
    // 1. The guided flow asks about FRESHNESS, and now SAYS freshness too —
    //    the storage key is the column, the copy key is the word the athlete
    //    reads, and they are allowed to differ only in this one direction.
    const metric = CHECKIN_METRICS.find((m) => m.key === "soreness")!;
    expect(metric.questionKey).toBe("w.recovery.checkins.qFreshness");
    expect(metric.labelKey).toBe("w.recovery.checkins.freshness");
    expect(metricLabelKey("soreness")).toBe("w.recovery.checkins.freshness");

    // 2. checkinRating averages all four metrics as higher = better, which is
    //    only correct if the stored soreness value is a freshness reading.
    expect(checkinRating({ energy: 5, sleep: 5, soreness: 5, mood: 5 })).toBe(5);
    expect(feelingFromRating(checkinRating({ energy: 5, sleep: 5, soreness: 5, mood: 5 })!)).toBe("primed");
    expect(feelingFromRating(checkinRating({ energy: 1, sleep: 1, soreness: 1, mood: 1 })!)).toBe("wrecked");

    // 3. …so the athlete who feels PRIMED is the one with the LEAST soreness.
    expect(sorenessFromCheckin(5)).toBeLessThan(sorenessFromCheckin(1)!);
  });

  it("never SHOWS the athlete the word the column uses", () => {
    // The label and the stored polarity disagreed for as long as the metric was
    // called Soreness on screen: the card asked "how fresh do your muscles
    // feel?" under a heading that meant the opposite, in three languages. The
    // question was always right, so the heading moved to match it.
    //
    // Scoped to the metric's OWN strings — "watch for soreness" elsewhere in the
    // app is a symptom being described, not this scale being mislabelled.
    const metric = CHECKIN_METRICS.find((m) => m.key === "soreness")!;
    for (const lang of ["en", "pl", "de"] as const) {
      const t = makeT(lang);
      for (const key of [metric.labelKey, metric.questionKey, "w.recovery.checkins.freshnessLc", "w.teams.coach.freshness"]) {
        const s = t(key).toLowerCase();
        expect(s, `${lang}:${key}`).not.toBe(key); // the key actually resolves
        for (const banned of ["sore", "bolesn", "zakwas", "ból", "muskelkater"]) {
          expect(s.includes(banned), `${lang}:${key} = "${s}"`).toBe(false);
        }
      }
    }
  });
});
