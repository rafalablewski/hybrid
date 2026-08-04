import { describe, it, expect } from "vitest";
import { tissueAxis, injuryHeadlineKey, RISK_ZONES, FLAG_THRESHOLD } from "./tissue-axis";
import { computeInjuryRisk, calibrateRisk, type InjuryRisk, type TissueRisk } from "./engines/injury";
import type { MuscleGroup } from "./engines/types";

const tissue = (t: MuscleGroup, risk: number, over: Partial<TissueRisk> = {}): TissueRisk => ({
  tissue: t,
  risk,
  prob: calibrateRisk(risk),
  band: risk >= 70 ? "high" : risk >= 50 ? "elevated" : risk >= 30 ? "moderate" : "low",
  acwr: 1,
  drivers: [],
  enoughHistory: true,
  ...over,
});

const mk = (tissues: TissueRisk[], over: Partial<InjuryRisk> = {}): InjuryRisk => {
  const overall = tissues.length ? Math.max(...tissues.map((t) => t.risk)) : 0;
  return {
    overall,
    prob: calibrateRisk(overall),
    band: overall >= 70 ? "high" : overall >= 50 ? "elevated" : overall >= 30 ? "moderate" : "low",
    modelVersion: "heuristic-cal-v0",
    tissues,
    flagged: tissues.filter((t) => t.band === "elevated" || t.band === "high"),
    historyDays: 60,
    minHistoryDays: 14,
    awaitingBaseline: [],
    ...over,
  };
};

describe("risk zones", () => {
  it("tile the whole axis with no gap or overlap", () => {
    expect(RISK_ZONES.reduce((a, z) => a + z.widthPct, 0)).toBe(100);
    RISK_ZONES.forEach((z, i) => {
      if (i > 0) expect(z.from).toBe(RISK_ZONES[i - 1]!.to);
      expect(z.to - z.from).toBe(z.widthPct);
    });
    expect(RISK_ZONES[0]!.from).toBe(0);
    expect(RISK_ZONES[RISK_ZONES.length - 1]!.to).toBe(100);
  });

  it("puts the flag line exactly at the elevated band's floor", () => {
    const elevated = RISK_ZONES.find((z) => z.band === "elevated");
    expect(elevated?.from).toBe(FLAG_THRESHOLD);
  });

  /** The zones are a REDRAWING of engines/injury's band(). If that function's
   *  thresholds move and these don't, the card would tint a score with one
   *  band and file it under another. */
  it("agrees with the engine's own banding at every boundary", () => {
    for (const z of RISK_ZONES) {
      for (const score of [z.from, z.to - 1]) {
        const axis = tissueAxis(mk([tissue("quads", score)]));
        expect(axis.rows[0]!.band).toBe(z.band);
      }
    }
  });
});

describe("tissueAxis", () => {
  it("sorts rows highest-first even when the engine hands them over unsorted", () => {
    const axis = tissueAxis(mk([tissue("quads", 12), tissue("posterior", 71), tissue("back", 33)]));
    expect(axis.rows.map((r) => r.tissue)).toEqual(["posterior", "back", "quads"]);
  });

  it("marks exactly one top row, and it carries the headline score", () => {
    const axis = tissueAxis(mk([tissue("quads", 40), tissue("posterior", 71)]));
    expect(axis.rows.filter((r) => r.top)).toHaveLength(1);
    expect(axis.topTissue).toBe("posterior");
    expect(axis.rows.find((r) => r.top)?.risk).toBe(axis.overall);
  });

  it("marks only one top row when two tissues tie at the maximum", () => {
    const axis = tissueAxis(mk([tissue("quads", 55), tissue("posterior", 55)]));
    expect(axis.rows.filter((r) => r.top)).toHaveLength(1);
  });

  it("marks no top row at all when nothing has been trained", () => {
    const axis = tissueAxis(mk([tissue("quads", 0), tissue("posterior", 0)]));
    expect(axis.rows.some((r) => r.top)).toBe(false);
    expect(axis.topTissue).toBeNull();
  });

  it("flags exactly the tissues at or above the flag line", () => {
    const axis = tissueAxis(mk([tissue("posterior", 71), tissue("quads", 50), tissue("back", 49)]));
    expect(axis.rows.map((r) => r.flagged)).toEqual([true, true, false]);
    expect(axis.flaggedCount).toBe(2);
  });

  /** The count the card prints and the engine's own worklist must never
   *  disagree — they are the same fact stated twice. */
  it("counts the same flagged tissues the engine does, on real logged data", () => {
    // 30 days of squatting, ramped hard over the last week — enough chronic
    // history for the ratio to be trusted, and enough of a spike to flag.
    const log = Array.from({ length: 30 }, (_, i) => ({
      daysAgo: i,
      items: [{ move: "Back Squat", hardSets: i < 7 ? 8 : 2, topRpe: 9, e1rm: 150 }],
    }));
    const risk = computeInjuryRisk(log, undefined);
    const axis = tissueAxis(risk);
    expect(axis.flaggedCount).toBe(risk.flagged.length);
    expect(axis.overall).toBe(risk.overall);
    expect(axis.rows).toHaveLength(risk.tissues.length);
  });

  it("positions every tick inside the axis", () => {
    const axis = tissueAxis(mk([tissue("posterior", 71), tissue("quads", 0)]));
    for (const r of axis.rows) expect(r.leftPct).toBeGreaterThanOrEqual(0);
    for (const r of axis.rows) expect(r.leftPct).toBeLessThanOrEqual(100);
  });

  it("reports probability as an unrounded percent of the engine's calibration", () => {
    const axis = tissueAxis(mk([tissue("posterior", 32)]));
    expect(axis.rows[0]!.probPct).toBeCloseTo(calibrateRisk(32) * 100, 6);
    expect(axis.rows[0]!.probPct).toBeCloseTo(4.1, 1);
  });

  it("nulls the ratio for a tissue with no trusted baseline, and keeps it otherwise", () => {
    const axis = tissueAxis(mk([
      tissue("posterior", 20, { acwr: 1.12 }),
      tissue("chest", 11, { acwr: 1, enoughHistory: false }),
    ]));
    expect(axis.rows[0]!.acwr).toBe(1.12);
    expect(axis.rows[1]!.acwr).toBeNull();
  });

  it("carries the heaviest driver through, and null when there is none", () => {
    const axis = tissueAxis(mk([
      tissue("posterior", 71, { drivers: [{ kind: "spike", label: "", contribution: 40 }] }),
      tissue("chest", 4),
    ]));
    expect(axis.rows[0]!.driver).toBe("spike");
    expect(axis.rows[1]!.driver).toBeNull();
  });

  it("passes the model version and the awaiting-baseline list straight through", () => {
    const axis = tissueAxis(mk([tissue("quads", 10)], { awaitingBaseline: ["chest"] }));
    expect(axis.modelVersion).toBe("heuristic-cal-v0");
    expect(axis.awaitingBaseline).toEqual(["chest"]);
  });

  it("survives an athlete with no tissues at all", () => {
    const axis = tissueAxis(mk([]));
    expect(axis.rows).toEqual([]);
    expect(axis.flaggedCount).toBe(0);
    expect(axis.topTissue).toBeNull();
  });
});

describe("injuryHeadlineKey", () => {
  it("says clear when nothing is on the worklist", () => {
    expect(injuryHeadlineKey({ band: "moderate", flaggedCount: 0 })).toBe("w.injury.line.clear");
  });
  it("escalates the wording with the band once something is flagged", () => {
    expect(injuryHeadlineKey({ band: "elevated", flaggedCount: 1 })).toBe("w.injury.line.elevated");
    expect(injuryHeadlineKey({ band: "high", flaggedCount: 2 })).toBe("w.injury.line.high");
  });

  /** `overall` is the max of the tissues, so a flagged tissue and an
   *  elevated-or-high band are the same fact. If that ever stops holding the
   *  headline would contradict the rows beneath it. */
  it("never says clear while the band is elevated or high", () => {
    const axis = tissueAxis(mk([tissue("posterior", 71), tissue("quads", 20)]));
    expect(axis.flaggedCount).toBeGreaterThan(0);
    expect(injuryHeadlineKey(axis)).not.toBe("w.injury.line.clear");
  });
});
