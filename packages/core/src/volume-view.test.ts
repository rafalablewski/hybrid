import { describe, it, expect } from "vitest";
import {
  RAIL, BAND_KEYS, bandRegion, railX, railGeometry, railScale, volumeSummary, sortByUrgency, setsLabel, deltaLabel,
  sourceLabelKey, sourceWhyKey, factorLabelKey, blockKindKey, factorPercent, blockRamp, targetVerdict, TARGET_VERDICT_KEY,
  provenanceLadder, rungMeta, factorAffectsKey,
} from "./volume-view";
import { muscleVolumeStatus, VOLUME_LANDMARKS } from "./engines/landmarks";
import type { MuscleGroup } from "./engines/types";

const L = VOLUME_LANDMARKS;
const st = (m: MuscleGroup, sets: number) => muscleVolumeStatus(m, sets, L[m]);

describe("railX", () => {
  it("pins the landmark anchors to the same x for every muscle", () => {
    // The whole point: Triceps (MRV 18) and Back (MRV 22) put their ceiling at
    // the SAME place, so a stack of rows reads as one picture.
    for (const m of ["quads", "back", "triceps", "glutes"] as MuscleGroup[]) {
      expect(railX(L[m].mev, L[m])).toBeCloseTo(RAIL.mev, 6);
      expect(railX(L[m].mavHigh, L[m])).toBeCloseTo(RAIL.mavHigh, 6);
      expect(railX(L[m].mrv, L[m])).toBeCloseTo(RAIL.mrv, 6);
    }
  });

  it("is zero at zero sets and monotonic across the whole range", () => {
    const l = L.chest;
    expect(railX(0, l)).toBe(0);
    let prev = -1;
    for (let sets = 0; sets <= l.mrv * 2; sets += 0.5) {
      const x = railX(sets, l);
      expect(x).toBeGreaterThanOrEqual(prev);
      expect(x).toBeLessThanOrEqual(1);
      prev = x;
    }
  });

  it("saturates the overshoot tail at 1.0 once 50% past the ceiling", () => {
    const l = L.triceps; // mrv 18
    expect(railX(l.mrv * 1.5, l)).toBeCloseTo(1, 6);
    expect(railX(l.mrv * 3, l)).toBe(1);
    expect(railX(l.mrv * 1.25, l)).toBeGreaterThan(RAIL.mrv);
    expect(railX(l.mrv * 1.25, l)).toBeLessThan(1);
  });

  it("never divides by zero on degenerate landmarks", () => {
    const flat = { mv: 0, mev: 0, mavLow: 0, mavHigh: 0, mrv: 0 };
    expect(Number.isFinite(railX(0, flat))).toBe(true);
    expect(Number.isFinite(railX(10, flat))).toBe(true);
    expect(railX(10, flat)).toBeLessThanOrEqual(1);
  });
});

describe("railGeometry", () => {
  it("places the productive band between mavLow and the fixed mavHigh anchor", () => {
    const g = railGeometry(st("back", 12));
    expect(g.bandStart).toBeGreaterThan(RAIL.mev);
    expect(g.bandStart).toBeLessThan(RAIL.mavHigh);
    expect(g.bandEnd).toBe(RAIL.mavHigh);
    expect(g.mev).toBe(RAIL.mev);
    expect(g.mrv).toBe(RAIL.mrv);
  });
});

describe("railScale", () => {
  it("prints each muscle's own landmark values at the shared anchors", () => {
    const s = railScale(L.chest);
    expect([s.mev, s.mav, s.mrv]).toEqual(["8", "12–18", "20"]);
    expect(s.mevX).toBe(RAIL.mev);
    expect(s.mrvX).toBe(RAIL.mrv);
  });

  it("puts the MAV label inside the band for every muscle", () => {
    for (const m of Object.keys(L) as MuscleGroup[]) {
      const s = railScale(L[m]);
      expect(s.mavX).toBeGreaterThanOrEqual(railX(L[m].mavLow, L[m]));
      expect(s.mavX).toBeLessThanOrEqual(RAIL.mavHigh);
    }
  });

  it("collapses a degenerate MAV range to one number", () => {
    expect(railScale({ mv: 4, mev: 6, mavLow: 12, mavHigh: 12, mrv: 16 }).mav).toBe("12");
  });
});

describe("bandRegion", () => {
  it("spans the shortfall, the productive band and the overshoot", () => {
    const l = L.chest;
    expect(bandRegion("mev", l)).toEqual({ from: 0, to: RAIL.mev });
    expect(bandRegion("mrv", l)).toEqual({ from: RAIL.mrv, to: 1 });
    const mav = bandRegion("mav", l);
    expect(mav.from).toBeCloseTo(railX(l.mavLow, l), 6);
    expect(mav.to).toBe(RAIL.mavHigh);
  });

  it("gives every band a non-empty, in-order, in-bounds region on every muscle", () => {
    for (const m of Object.keys(L) as MuscleGroup[]) {
      for (const k of BAND_KEYS) {
        const r = bandRegion(k, L[m]);
        expect(r.from).toBeGreaterThanOrEqual(0);
        expect(r.to).toBeLessThanOrEqual(1);
        expect(r.to).toBeGreaterThan(r.from);
      }
    }
  });
});

describe("volumeSummary", () => {
  const rows = [st("quads", 3), st("glutes", 8), st("chest", 22), st("shoulders", 28)];

  it("counts what is in range and buckets the rest", () => {
    const s = volumeSummary(rows);
    expect(s.total).toBe(4);
    expect(s.inRange).toBe(1); // glutes at 8 sits in MAV
    expect(s.over.map((r) => r.muscle)).toEqual(["shoulders", "chest"]); // worst first
    expect(s.under.map((r) => r.muscle)).toEqual(["quads"]);
    expect(s.verdict).toBe("mixed");
  });

  it("reads 'balanced' only when nothing needs a change", () => {
    expect(volumeSummary([st("glutes", 8), st("back", 16)]).verdict).toBe("balanced");
  });

  it("reads 'none' when nothing was logged", () => {
    const s = volumeSummary([st("glutes", 0), st("back", 0)]);
    expect(s.empty).toBe(true);
    expect(s.verdict).toBe("none");
  });

  it("counts a near-ceiling muscle as in range, not as a problem", () => {
    const s = volumeSummary([st("chest", 19)]); // > mavHigh 18, < mrv 20
    expect(s.peak).toHaveLength(1);
    expect(s.inRange).toBe(1);
    expect(s.over).toHaveLength(0);
    expect(s.verdict).toBe("balanced");
  });
});

describe("sortByUrgency", () => {
  it("leads with over-the-ceiling, then under-the-minimum, then the rest", () => {
    const sorted = sortByUrgency([st("glutes", 8), st("quads", 3), st("chest", 22), st("back", 21)]);
    expect(sorted.map((r) => r.muscle)).toEqual(["chest", "quads", "back", "glutes"]);
  });
});

describe("labels", () => {
  it("keeps whole set counts whole and fractional counts halved", () => {
    expect(setsLabel(12)).toBe("12");
    expect(setsLabel(12.5)).toBe("12.5");
  });

  it("signs the delta with a real minus sign", () => {
    expect(deltaLabel(st("quads", 3))).toBe("+9");
    expect(deltaLabel(st("chest", 22))).toBe("−4");
    expect(deltaLabel(st("chest", 19))).toBe("—");
  });
});

describe("landmark provenance + the block ramp", () => {
  it("names the i18n key for each source, factor and week kind", () => {
    expect(sourceLabelKey("population")).toBe("w.analyze.vol.sourcePopulation");
    expect(sourceWhyKey("observed")).toBe("w.analyze.vol.sourceWhyObserved");
    expect(factorLabelKey("bodyweight")).toBe("w.analyze.vol.factorBodyweight");
    expect(blockKindKey("deload")).toBe("w.analyze.vol.kindDeload");
  });

  it("draws the provenance as four rungs, lit as far as the evidence reaches", () => {
    const rungs = provenanceLadder({
      layers: ["population", "profile"],
      source: "profile",
      profileConfidence: 0.62,
      observedConfidence: 0,
    });
    expect(rungs.map((r) => r.source)).toEqual(["population", "profile", "observed", "manual"]);
    expect(rungs.map((r) => r.lit)).toEqual([true, true, false, false]);
    // Exactly one rung names the numbers, and it is the deepest lit one.
    expect(rungs.filter((r) => r.active).map((r) => r.source)).toEqual(["profile"]);
    // Each rung carries only the confidence its own layer can claim.
    expect(rungMeta(rungs[0]!)).toBe("");
    expect(rungMeta(rungs[1]!)).toBe("62%");
    expect(rungMeta(rungs[2]!)).toBe("—");
    expect(rungs[1]!.whyKey).toBe("w.analyze.vol.sourceWhyProfile");
  });

  it("lights a skipped layer's rung only when it contributed", () => {
    // The athlete typed their own numbers without ever filling in a profile:
    // manual is active, profile stays dark, and the ladder says so.
    const rungs = provenanceLadder({
      layers: ["population", "manual"],
      source: "manual",
      profileConfidence: 0,
      observedConfidence: 0,
    });
    expect(rungs.map((r) => r.lit)).toEqual([true, false, false, true]);
    expect(rungs[3]!.active).toBe(true);
    // A number the athlete typed is not an estimate to be confident about.
    expect(rungMeta(rungs[3]!)).toBe("");
  });

  it("names the i18n key for which end of the band a factor moved", () => {
    expect(factorAffectsKey("stimulus")).toBe("w.analyze.vol.affectsStimulus");
    expect(factorAffectsKey("recovery")).toBe("w.analyze.vol.affectsRecovery");
    expect(factorAffectsKey("both")).toBe("w.analyze.vol.affectsBoth");
  });

  it("states a factor's effect as a signed percentage, with a real minus sign", () => {
    expect(factorPercent(1.08)).toBe("+8%");
    expect(factorPercent(0.85)).toBe("−15%");
    expect(factorPercent(1)).toBe("—");
    expect(factorPercent(0.85).includes("-")).toBe(false);
  });

  it("draws the block as a ramp that climbs then steps down for the deload", () => {
    const cols = blockRamp({ week: 2, weeks: 4 }, VOLUME_LANDMARKS);
    expect(cols).toHaveLength(4);
    expect(cols[0]!.height).toBeLessThan(cols[1]!.height);
    expect(cols[1]!.height).toBeLessThan(cols[2]!.height);
    expect(cols[3]!.height).toBeLessThan(cols[0]!.height); // the deload
    expect(cols.map((c) => c.current)).toEqual([false, true, false, false]);
    expect(cols.every((c) => c.height > 0 && c.height <= 1)).toBe(true);
  });

  it("calls a set either side of the target on-target", () => {
    expect(targetVerdict(12, 12)).toBe("on");
    expect(targetVerdict(13, 12)).toBe("on");
    expect(targetVerdict(14, 12)).toBe("over");
    expect(targetVerdict(10, 12)).toBe("under");
    expect(TARGET_VERDICT_KEY.over).toBe("w.analyze.vol.overTarget");
  });
});
