import { describe, it, expect } from "vitest";
import { GYM_EXERCISES, type Muscle } from "./exercise-db";
import { MUSCLE_SHORT } from "./exercise-anatomy";
import {
  BODY_FIGURES,
  MUSCLE_SIDE,
  muscleRegion,
  exerciseBodyMap,
  SKETCH_BODY_ART,
} from "./body-map";

const ALL_MUSCLES = Object.keys(MUSCLE_SHORT) as Muscle[];

describe("body-map geometry", () => {
  it("assigns every muscle to exactly one figure with a drawable region", () => {
    for (const m of ALL_MUSCLES) {
      const side = MUSCLE_SIDE[m];
      expect(side, m).toBeTruthy();
      const shapes = muscleRegion(m);
      expect(shapes.length, m).toBeGreaterThan(0);
      for (const poly of shapes) {
        expect(poly.length, m).toBeGreaterThanOrEqual(3);
        for (const { x, y } of poly) {
          expect(x, m).toBeGreaterThanOrEqual(0);
          expect(x, m).toBeLessThanOrEqual(100);
          expect(y, m).toBeGreaterThanOrEqual(0);
          expect(y, m).toBeLessThanOrEqual(100);
        }
      }
    }
  });

  it("a muscle appears on only one figure (no double-mapping)", () => {
    const seen = new Set<Muscle>();
    for (const fig of BODY_FIGURES) {
      for (const r of fig.regions) {
        expect(seen.has(r.muscle), r.muscle).toBe(false);
        seen.add(r.muscle);
        expect(r.side).toBe(fig.side);
      }
    }
    // every muscle in the DB's vocabulary is covered
    expect(seen.size).toBe(ALL_MUSCLES.length);
  });
});

describe("body-map activation glow", () => {
  it("resolves every gym exercise, top mover glowing at 1", () => {
    for (const e of GYM_EXERCISES) {
      const map = exerciseBodyMap(e.name);
      expect(map, e.name).not.toBeNull();
      expect(map!.glow.length, e.name).toBeGreaterThan(0);
      // glow is ranked by activation (brightest first) → first is the max
      const maxIntensity = Math.max(...map!.glow.map((g) => g.intensity));
      expect(map!.glow[0]!.intensity, e.name).toBeCloseTo(maxIntensity);
      expect(map!.glow[0]!.intensity, e.name).toBeCloseTo(1);
    }
  });

  it("keeps every glow intensity in (0, 1] and side-tagged", () => {
    for (const e of GYM_EXERCISES) {
      for (const g of exerciseBodyMap(e.name)!.glow) {
        expect(g.intensity, `${e.name}:${g.muscle}`).toBeGreaterThan(0);
        expect(g.intensity, `${e.name}:${g.muscle}`).toBeLessThanOrEqual(1);
        expect(g.side, g.muscle).toBe(MUSCLE_SIDE[g.muscle]);
      }
    }
  });

  it("intensityOf covers every muscle; untargeted read 0", () => {
    const map = exerciseBodyMap("Barbell Curl");
    expect(map).not.toBeNull();
    for (const m of ALL_MUSCLES) {
      expect(typeof map!.intensityOf[m], m).toBe("number");
    }
    // a curl doesn't drive the quads
    expect(map!.intensityOf.quads).toBe(0);
    // and it does drive the biceps
    expect(map!.intensityOf.biceps).toBeGreaterThan(0);
  });

  it("resolves the library's equipment-qualified compound names", () => {
    // "Barbell Bench Press" is the library's display name for the built-in
    // "Bench Press" — the body-map must light up, not silently no-op.
    const map = exerciseBodyMap("Barbell Bench Press");
    expect(map).not.toBeNull();
    expect(map!.name).toBe("Bench Press");
    expect(map!.intensityOf.chest).toBeGreaterThan(0);
  });

  it("returns null for a name the DB doesn't know", () => {
    expect(exerciseBodyMap("Interpretive Dance")).toBeNull();
  });
});

describe("body-map swap seam (schematic → sketch)", () => {
  it("defaults to the schematic mannequin with figures and no sketch", () => {
    const map = exerciseBodyMap("Bench Press")!;
    expect(map.kind).toBe("schematic");
    expect(map.figures).toBe(BODY_FIGURES);
    expect(map.figures.length).toBe(2);
    expect(map.sketch).toBeNull();
  });

  it("flips every lift to kind:sketch once SKETCH_BODY_ART is populated", () => {
    const art = { front: "front.png", back: "back.png", overlays: {} };
    SKETCH_BODY_ART.art = art;
    try {
      const map = exerciseBodyMap("Bench Press")!;
      expect(map.kind).toBe("sketch");
      expect(map.sketch).toBe(art);
      // the glow data (the muscle bars' source) is unchanged by the swap
      expect(map.glow.length).toBeGreaterThan(0);
      expect(map.glow[0]!.intensity).toBeCloseTo(1);
    } finally {
      SKETCH_BODY_ART.art = null;
    }
  });
});
