import { describe, it, expect } from "vitest";
import {
  freshnessExplain, ENERGY_SYSTEMS, ENERGY_SYSTEM_KEY, FRESHNESS_COPY,
} from "./freshness-explain";
import { computeFatigue, ENDURANCE_SCALE, FATIGUE_HALF_LIFE_DAYS } from "./fatigue";
import { computeHpi, hpiBand, ENDURANCE_WEIGHTS, STRENGTH_WEIGHTS } from "./hpi";
import { hpiRole } from "../semantic";
import { ALL_MUSCLES } from "./movements";
import type { Biometrics, TrainingLog } from "./types";

/**
 * THE ONE LAW: the sheet explains the figure the CARD prints — never a second
 * number arrived at the same way. Every case below reduces to
 * `explain.score === computeHpi(...).components[pillar]`, plus the ledger's
 * last step being that same score.
 */

const LIFTING: TrainingLog = [
  { daysAgo: 0, items: [{ move: "Back Squat", topRpe: 9, hardSets: 6 }] },
  { daysAgo: 1, items: [{ move: "Bench Press", topRpe: 8, hardSets: 5 }] },
  { daysAgo: 3, items: [{ move: "Deadlift", topRpe: 9, hardSets: 4 }] },
];

const RUNNING: TrainingLog = [
  { daysAgo: 0, items: [{ move: "Run", system: "aerobic", minutes: 55, rpe: 5 }] },
  { daysAgo: 1, items: [{ move: "Intervals", system: "anaerobic", minutes: 25, rpe: 9 }] },
  { daysAgo: 2, items: [{ move: "Tempo Run", system: "threshold", minutes: 35, rpe: 7 }] },
];

const BOTH: TrainingLog = [...LIFTING, ...RUNNING];

const BIO: Biometrics = {
  hrv: { today: 39, baseline: 62, unit: "ms", better: "high" },
  restingHr: { today: 60, baseline: 51, unit: "bpm", better: "low" },
  sleep: { today: 5.4, baseline: 7.6, unit: "h", better: "high" },
};

describe("freshnessExplain — the figure it explains is the figure the card prints", () => {
  it("matches computeHpi's components exactly, for both pillars", () => {
    const hpi = computeHpi(computeFatigue(BOTH));
    expect(freshnessExplain("strength", BOTH).score).toBe(hpi.components.strength);
    expect(freshnessExplain("endurance", BOTH).score).toBe(hpi.components.endurance);
  });

  it("is unmoved by the wearable — which is a headline additive, not a component", () => {
    for (const pillar of ["strength", "endurance"] as const) {
      expect(freshnessExplain(pillar, BOTH, BIO).score).toBe(freshnessExplain(pillar, BOTH).score);
    }
  });

  it("ends its ledger on that same score, and marks it as the total", () => {
    for (const pillar of ["strength", "endurance"] as const) {
      const e = freshnessExplain(pillar, BOTH);
      const totals = e.steps.filter((s) => s.total);
      expect(totals).toHaveLength(1);
      expect(totals[0]!.value).toBe(e.score);
      expect(e.steps[e.steps.length - 1]!.total).toBe(true);
    }
  });

  it("keeps score + fatigue at exactly 100", () => {
    for (const log of [[], LIFTING, RUNNING, BOTH]) {
      for (const pillar of ["strength", "endurance"] as const) {
        const e = freshnessExplain(pillar, log);
        expect(e.score + e.fatigue).toBe(100);
      }
    }
  });

  it("bands and colours by the same rule as the headline", () => {
    const e = freshnessExplain("strength", BOTH);
    expect(e.band).toBe(hpiBand(e.score));
    expect(e.role).toBe(hpiRole(hpiBand(e.score)));
  });
});

describe("freshnessExplain — the strength inputs", () => {
  it("lists all seven tissues, heaviest first", () => {
    const e = freshnessExplain("strength", LIFTING);
    expect(e.rows).toHaveLength(ALL_MUSCLES.length);
    expect(new Set(e.rows.map((r) => r.muscle))).toEqual(new Set(ALL_MUSCLES));
    for (let i = 1; i < e.rows.length; i++) {
      expect(e.rows[i - 1]!.value).toBeGreaterThanOrEqual(e.rows[i]!.value);
    }
  });

  it("names exactly one top tissue, and it is the most-fatigued one", () => {
    const e = freshnessExplain("strength", LIFTING);
    const fatigue = computeFatigue(LIFTING);
    const top = e.rows.filter((r) => r.top);
    expect(top).toHaveLength(1);
    const heaviest = Math.max(...ALL_MUSCLES.map((m) => fatigue.muscles[m]));
    expect(top[0]!.value).toBe(heaviest);
  });

  it("reproduces the rounded average as the first step", () => {
    const e = freshnessExplain("strength", LIFTING);
    const fatigue = computeFatigue(LIFTING);
    const avg = ALL_MUSCLES.reduce((a, m) => a + fatigue.muscles[m], 0) / ALL_MUSCLES.length;
    expect(e.steps[0]!.value).toBe(Math.round(avg));
    expect(e.steps[0]!.arg).toBe(ALL_MUSCLES.length);
  });

  it("points at no tissue when nothing has loaded one", () => {
    const e = freshnessExplain("strength", RUNNING);
    expect(e.rows.every((r) => !r.top)).toBe(true);
    expect(e.rows.every((r) => r.sharePct === 0)).toBe(true);
  });
});

describe("freshnessExplain — the endurance inputs", () => {
  it("lists the three systems in the fixed intensity order", () => {
    const e = freshnessExplain("endurance", RUNNING);
    expect(e.rows.map((r) => r.key)).toEqual(ENERGY_SYSTEMS.map((s) => ENERGY_SYSTEM_KEY[s]));
  });

  it("keeps that order even when a lighter system carries more load", () => {
    const aerobicHeavy: TrainingLog = [{ daysAgo: 0, items: [{ move: "Run", system: "aerobic", minutes: 180, rpe: 6 }] }];
    const e = freshnessExplain("endurance", aerobicHeavy);
    expect(e.rows.map((r) => r.key)).toEqual(ENERGY_SYSTEMS.map((s) => ENERGY_SYSTEM_KEY[s]));
    expect(e.rows.find((r) => r.top)!.key).toBe(ENERGY_SYSTEM_KEY.aerobic);
  });

  it("names the saturation scale on the step that applies it", () => {
    const e = freshnessExplain("endurance", RUNNING);
    expect(e.steps[1]!.arg).toBe(ENDURANCE_SCALE);
    expect(e.steps[1]!.value).toBe(e.fatigue);
  });

  it("sums the three system loads into the ledger's first step", () => {
    const e = freshnessExplain("endurance", RUNNING);
    expect(e.steps[0]!.value).toBe(e.rows.reduce((a, r) => a + r.value, 0));
  });
});

describe("freshnessExplain — the honesty flags", () => {
  it("calls an empty log a baseline, not a measurement", () => {
    for (const pillar of ["strength", "endurance"] as const) {
      const e = freshnessExplain(pillar, []);
      expect(e.empty).toBe(true);
      expect(e.noInput).toBe(true);
      expect(e.score).toBe(100);
    }
  });

  it("separates 'nothing logged' from 'nothing that feeds THIS pillar'", () => {
    const runner = freshnessExplain("strength", RUNNING);
    expect(runner.empty).toBe(false);
    expect(runner.noInput).toBe(true);
    expect(runner.score).toBe(100);

    const lifter = freshnessExplain("endurance", LIFTING);
    expect(lifter.empty).toBe(false);
    expect(lifter.noInput).toBe(true);
    expect(lifter.score).toBe(100);
  });

  it("stops claiming noInput the moment the pillar has real work in it", () => {
    expect(freshnessExplain("strength", BOTH).noInput).toBe(false);
    expect(freshnessExplain("endurance", BOTH).noInput).toBe(false);
  });

  it("still reports noInput for work that is old but real", () => {
    const stale: TrainingLog = [{ daysAgo: 40, items: [{ move: "Back Squat", topRpe: 8, hardSets: 5 }] }];
    const e = freshnessExplain("strength", stale);
    expect(e.noInput).toBe(false);
    expect(e.empty).toBe(false);
  });
});

describe("freshnessExplain — the roll-up into the headline", () => {
  it("reports each pillar's whole-percent share, and the two sum to 100", () => {
    const s = freshnessExplain("strength", BOTH).weightPct;
    const e = freshnessExplain("endurance", BOTH).weightPct;
    expect(s).toBe(55);
    expect(e).toBe(45);
    expect(s + e).toBe(100);
  });

  it("follows a non-default weighting", () => {
    expect(freshnessExplain("strength", BOTH, undefined, STRENGTH_WEIGHTS).weightPct).toBe(80);
    expect(freshnessExplain("endurance", BOTH, undefined, ENDURANCE_WEIGHTS).weightPct).toBe(75);
  });

  it("states the decay the window is built on, from the engine's own constant", () => {
    expect(freshnessExplain("strength", BOTH).halfLifeDays).toBe(FATIGUE_HALF_LIFE_DAYS);
  });
});

describe("freshnessExplain — the copy map", () => {
  it("titles each sheet with the very label the card's column carries", () => {
    expect(FRESHNESS_COPY.strength.title).toBe("w.home.cockpit.strengthFresh");
    expect(FRESHNESS_COPY.endurance.title).toBe("w.home.cockpit.enduranceFresh");
  });

  it("gives every pillar a full set of blocks, and never shares one between them", () => {
    const parts = ["what", "how", "inputs", "limit", "noInput"] as const;
    for (const part of parts) {
      expect(FRESHNESS_COPY.strength[part]).toBeTruthy();
      expect(FRESHNESS_COPY.endurance[part]).not.toBe(FRESHNESS_COPY.strength[part]);
    }
  });
});
