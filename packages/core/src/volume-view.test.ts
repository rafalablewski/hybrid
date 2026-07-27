import { describe, it, expect } from "vitest";
import { RAIL, railX, railGeometry, railScale, volumeSummary, sortByUrgency, setsLabel, deltaLabel } from "./volume-view";
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
