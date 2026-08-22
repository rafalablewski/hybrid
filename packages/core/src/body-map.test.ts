import { describe, it, expect } from "vitest";
import { GYM_EXERCISES, gymExercisesByCategory, type GymCategory, type Muscle } from "./exercise-db";
import { MUSCLE_SHORT } from "./exercise-anatomy";
import {
  BODY_FIGURES,
  bodyPath,
  MUSCLE_SIDE,
  muscleRegion,
  exerciseBodyMap,
  roomBodyMark,
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

describe("room body marks", () => {
  const namesIn = (category: GymCategory) => gymExercisesByCategory(category).map((e) => e.name);

  it("lights the muscle a room is named for, on the side that carries it", () => {
    const chest = roomBodyMark(namesIn("Chest"))!;
    expect(chest.side).toBe("front");
    expect(chest.top).toBe("chest");
    expect(chest.intensityOf.chest).toBe(1);

    const back = roomBodyMark(namesIn("Back"))!;
    expect(back.side).toBe("back");
    expect(back.top).toBe("lats");

    // Triceps live on the back view, biceps on the front — the mark follows the
    // geometry, not the room's position in the list.
    expect(roomBodyMark(namesIn("Triceps"))!.side).toBe("back");
    expect(roomBodyMark(namesIn("Biceps"))!.side).toBe("front");
    expect(roomBodyMark(namesIn("Calves"))!.top).toBe("calves");
  });

  it("keeps the mark legible: only muscles near the top mover are lit", () => {
    for (const category of [...new Set(GYM_EXERCISES.map((e) => e.category))]) {
      const mark = roomBodyMark(namesIn(category));
      expect(mark, category).not.toBeNull();
      const lit = Object.values(mark!.intensityOf).filter((v) => v > 0);
      expect(lit.length, category).toBeGreaterThan(0);
      // a dozen faint regions would read as a smudge at tile size
      expect(lit.length, category).toBeLessThanOrEqual(6);
      for (const v of lit) expect(v).toBeGreaterThanOrEqual(0.25);
      expect(Math.max(...lit), category).toBe(1);
      // every lit muscle actually lives on the figure being drawn
      for (const [m, v] of Object.entries(mark!.intensityOf)) {
        if (v > 0) expect(MUSCLE_SIDE[m as Muscle], `${category}/${m}`).toBe(mark!.side);
      }
    }
  });

  it("returns null when a room holds no lift the database knows", () => {
    expect(roomBodyMark([])).toBeNull();
    expect(roomBodyMark(["Trail Running", "Padel"])).toBeNull();
  });
});

describe("bodyPath — the geometry's de-robotiser", () => {
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];

  it("passes through every authored point, so anatomy stays where it was placed", () => {
    const d = bodyPath(square);
    // Each cubic segment ENDS on an authored point — that is the property that
    // lets a muscle be drawn by placing five points rather than fifty.
    for (const pt of square) expect(d).toContain(`${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`);
  });

  it("closes the shape and emits curves, not corners", () => {
    const d = bodyPath(square);
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect(d).toContain("C");
    // One cubic per edge of a closed ring.
    expect(d.match(/C/g)?.length).toBe(square.length);
  });

  it("tension 0 is the polygon it started as", () => {
    // The control points collapse onto the anchors, so a caller that wants the
    // old straight-edged reading can still have it without a second code path.
    const d = bodyPath(square, 0);
    expect(d).toContain("C0.00 0.00 10.00 0.00 10.00 0.00");
  });

  it("refuses a degenerate ring rather than emitting a broken path", () => {
    expect(bodyPath([])).toBe("");
    expect(bodyPath([{ x: 1, y: 1 }, { x: 2, y: 2 }])).toBe("");
  });

  it("every shipped figure part is drawable", () => {
    for (const fig of BODY_FIGURES) {
      for (const part of fig.outline) expect(bodyPath(part).length).toBeGreaterThan(0);
      for (const r of fig.regions)
        for (const shape of r.shapes) expect(bodyPath(shape).length).toBeGreaterThan(0);
    }
  });
});
