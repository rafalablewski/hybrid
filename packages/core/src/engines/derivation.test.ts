import { describe, expect, it } from "vitest";
import {
  deriveHpi,
  deriveReadiness,
  deriveTissueRisk,
  feelingImpacts,
  FEELING_THRESHOLDS,
} from "./derivation";
import { computeReadiness } from "./readiness";
import { computeFatigue } from "./fatigue";
import { computeHpi } from "./hpi";
import { computeInjuryRisk } from "./injury";
import { feelingFromRating, READINESS_LOAD_FACTOR } from "../readiness-feeling";
import { SAMPLE_BIOMETRICS, SAMPLE_TRAINING_LOG } from "./sample-data";
import { ALL_MUSCLES } from "./movements";

describe("deriveReadiness", () => {
  it("ends in exactly the live engine's score (drift guard)", () => {
    const live = computeReadiness(computeFatigue(SAMPLE_TRAINING_LOG), SAMPLE_BIOMETRICS);
    const d = deriveReadiness(SAMPLE_TRAINING_LOG, SAMPLE_BIOMETRICS);
    expect(d.result).toBe(`${live.score} / 100`);
    expect(d.steps[d.steps.length - 1]!.math).toContain(`= ${live.score}`);
  });

  it("shows one wearable step per metric and an honest no-bio path", () => {
    const withBio = deriveReadiness(SAMPLE_TRAINING_LOG, SAMPLE_BIOMETRICS);
    expect(withBio.steps.filter((s) => s.label.startsWith("Wearable – "))).toHaveLength(3);
    const without = deriveReadiness(SAMPLE_TRAINING_LOG);
    expect(without.steps.some((s) => s.math.includes("no signals"))).toBe(true);
  });
});

describe("deriveHpi", () => {
  it("ends in exactly the live engine's score and limiter (drift guard)", () => {
    const live = computeHpi(computeFatigue(SAMPLE_TRAINING_LOG), SAMPLE_BIOMETRICS);
    const d = deriveHpi(SAMPLE_TRAINING_LOG, SAMPLE_BIOMETRICS);
    expect(d.result).toBe(`${live.score} / 100 (${live.band})`);
    expect(d.steps.find((s) => s.label === "Limiter")!.math).toContain(`→ ${live.limiter}`);
  });
});

describe("deriveTissueRisk", () => {
  it("matches the live engine per tissue (drift guard)", () => {
    const live = computeInjuryRisk(SAMPLE_TRAINING_LOG, SAMPLE_BIOMETRICS);
    for (const m of ALL_MUSCLES) {
      const t = live.tissues.find((x) => x.tissue === m)!;
      const d = deriveTissueRisk(SAMPLE_TRAINING_LOG, m, SAMPLE_BIOMETRICS);
      expect(d.result).toContain(`${t.risk} / 100 (${t.band})`);
      expect(d.result).toContain(`${(t.prob * 100).toFixed(1)}%`);
    }
  });

  it("marks a personal onset when one is in effect", () => {
    const d = deriveTissueRisk(SAMPLE_TRAINING_LOG, "quads", SAMPLE_BIOMETRICS, undefined, 1.51);
    const spike = d.steps.find((s) => s.label.startsWith("Workload spike"))!;
    expect(spike.label).toContain("1.51");
    expect(spike.note).toContain("personal onset");
  });
});

describe("FEELING_THRESHOLDS", () => {
  it("tracks feelingFromRating (drift guard)", () => {
    expect(feelingFromRating(4.5)).toBe("primed");
    expect(feelingFromRating(4.49)).toBe("good");
    expect(feelingFromRating(3.5)).toBe("good");
    expect(feelingFromRating(3.49)).toBe("flat");
    expect(feelingFromRating(2.5)).toBe("flat");
    expect(feelingFromRating(2.49)).toBe("wrecked");
    expect(FEELING_THRESHOLDS.map((t) => t.feeling)).toEqual(["primed", "good", "flat", "wrecked"]);
  });
});

describe("feelingImpacts", () => {
  const rows = feelingImpacts(SAMPLE_TRAINING_LOG, SAMPLE_BIOMETRICS);
  const by = Object.fromEntries(rows.map((r) => [r.feeling, r]));

  it("returns one row per feeling, best → worst", () => {
    expect(rows.map((r) => r.feeling)).toEqual(["primed", "good", "flat", "wrecked"]);
  });

  it("factors mirror the shared load-factor table", () => {
    for (const r of rows) expect(r.factor).toBe(READINESS_LOAD_FACTOR[r.feeling]);
  });

  it("wrecked deloads: lighter bar AND one fewer set than good", () => {
    expect(Number(by.wrecked!.load)).toBeLessThan(Number(by.good!.load));
    expect(by.wrecked!.sets).toBe(by.good!.sets - 1);
    expect(by.wrecked!.setAdj).toBe(-1);
  });

  it("primed earns a touch more load; good is neutral (nothing moved)", () => {
    expect(Number(by.primed!.load)).toBeGreaterThanOrEqual(Number(by.good!.load));
    expect(by.good!.moved).toBe(false);
    expect(by.wrecked!.moved).toBe(true);
  });
});
