import { describe, it, expect } from "vitest";
import {
  INJURY_AREAS,
  INJURY_FIGURES,
  INJURY_FRONT,
  INJURY_BACK,
  INJURY_VIEWBOX,
  INJURY_AREA_KEY,
  INJURY_AREA_HINT_KEY,
  INJURY_WHEN,
  INJURY_WHEN_KEY,
  nearestInjuryArea,
  injuryTouchPoint,
  injuryDateFor,
} from "./injury-body";
import { ALL_MUSCLES } from "./engines/movements";

describe("injury body", () => {
  it("draws every trackable area, and only those", () => {
    expect(INJURY_AREAS.map((a) => a.group)).toEqual(ALL_MUSCLES);
  });

  it("gives every area at least one polygon and a centre per polygon", () => {
    for (const a of INJURY_AREAS) {
      expect(a.shapes.length).toBeGreaterThan(0);
      expect(a.centres.length).toBe(a.shapes.length);
      for (const s of a.shapes) expect(s.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps each area on exactly one figure", () => {
    const front = new Set(INJURY_FRONT.areas.map((a) => a.group));
    const back = new Set(INJURY_BACK.areas.map((a) => a.group));
    for (const g of ALL_MUSCLES) expect(front.has(g) !== back.has(g)).toBe(true);
    expect(INJURY_FRONT.areas.length + INJURY_BACK.areas.length).toBe(ALL_MUSCLES.length);
  });

  it("keeps every polygon inside the crop both clients draw", () => {
    const { x, y, w, h } = INJURY_VIEWBOX;
    for (const fig of INJURY_FIGURES) {
      for (const a of fig.areas) {
        for (const s of a.shapes) {
          for (const q of s) {
            expect(q.x).toBeGreaterThanOrEqual(x);
            expect(q.x).toBeLessThanOrEqual(x + w);
            expect(q.y).toBeGreaterThanOrEqual(y);
            expect(q.y).toBeLessThanOrEqual(y + h);
          }
        }
      }
    }
  });

  it("resolves a touch on an area's own centre to that area", () => {
    for (const a of INJURY_AREAS) {
      for (const c of a.centres) {
        expect(nearestInjuryArea(a.side, c.x, c.y)).toBe(a.group);
      }
    }
  });

  it("reads a touch down the back of the arm as triceps, not the back", () => {
    // the arm sits at x≈27 on the back figure, the lats at x≈41
    expect(nearestInjuryArea("back", 27, 36)).toBe("triceps");
    expect(nearestInjuryArea("back", 73, 36)).toBe("triceps");
    expect(nearestInjuryArea("back", 45, 40)).toBe("back");
  });

  it("reads a touch on a thigh as quads on the front and hamstrings behind", () => {
    expect(nearestInjuryArea("front", 45, 70)).toBe("quads");
    expect(nearestInjuryArea("back", 45, 78)).toBe("posterior");
  });

  it("never guesses: the head and the space beside the figure resolve to nothing", () => {
    expect(nearestInjuryArea("front", 50, 8)).toBeNull();
    expect(nearestInjuryArea("back", 50, 8)).toBeNull();
    expect(nearestInjuryArea("front", 2, 50)).toBeNull();
    expect(nearestInjuryArea("back", 98, 95)).toBeNull();
  });

  it("maps a touch through the letterbox, not across the whole box", () => {
    const { x, y, w, h } = INJURY_VIEWBOX;
    // a box of the figure's own aspect: no letterbox, a pure linear map
    const exact = injuryTouchPoint(w * 3, h * 3, 0, 0)!;
    expect(exact.x).toBeCloseTo(x, 6);
    expect(exact.y).toBeCloseTo(y, 6);

    // twice as wide as it should be: the drawing is centred, so the box's own
    // left edge is OUTSIDE the viewBox and its centre is the figure's centre
    const wide = injuryTouchPoint(w * 6, h * 3, 0, 0)!;
    expect(wide.x).toBeCloseTo(x - w / 2, 6);
    expect(wide.y).toBeCloseTo(y, 6);
    const mid = injuryTouchPoint(w * 6, h * 3, w * 3, h * 1.5)!;
    expect(mid.x).toBeCloseTo(x + w / 2, 6);
    expect(mid.y).toBeCloseTo(y + h / 2, 6);

    expect(injuryTouchPoint(0, 100, 5, 5)).toBeNull();
  });

  it("resolves a touch on a rendered figure back to the right area", () => {
    // a 174 × 294 render (the phone's two-up size), tapped on the left thigh
    const p = injuryTouchPoint(174, 294, 174 * 0.38, 294 * 0.71)!;
    expect(nearestInjuryArea("front", p.x, p.y)).toBe("quads");
  });

  it("names every area, in the athlete's words", () => {
    for (const g of ALL_MUSCLES) {
      expect(INJURY_AREA_KEY[g]).toMatch(/^w\.injury\.area\./);
      expect(INJURY_AREA_HINT_KEY[g]).toMatch(/^w\.injury\.areaHint\./);
    }
  });
});

describe("when it happened", () => {
  it("keys every answer", () => {
    for (const w of INJURY_WHEN) expect(INJURY_WHEN_KEY[w]).toMatch(/^w\.injury\.when\./);
  });

  it("dates today as now and the others as further back, never forward", () => {
    const now = Date.parse("2026-08-04T09:00:00.000Z");
    const at = (w: Parameters<typeof injuryDateFor>[0]) => Date.parse(injuryDateFor(w, now));
    expect(at("today")).toBe(now);
    expect(at("week")).toBeLessThan(at("today"));
    expect(at("earlier")).toBeLessThan(at("week"));
    for (const w of INJURY_WHEN) expect(at(w)).toBeLessThanOrEqual(now);
  });
});
