import { describe, expect, it } from "vitest";
import {
  AURORA_ICON_PATHS,
  AURORA_NAV_ICONS,
  GLYPH_NAMES,
  HUB_GLYPHS,
  NUTRITION_GLYPHS,
  PRODUCT_GLYPHS,
  glyphPaths,
  type GlyphName,
} from "./icons";
import { SPORT_MARK_PATHS } from "./sport-marks";
import { glyphMark, markPaths, sportMarkOf } from "./mark";

/**
 * THE ONE VOCABULARY.
 *
 * Four path maps ship in icons.ts and they are four ORIGINS, not four
 * languages. Nothing enforced that until this file: the drift it exists to
 * catch is exactly the drift that already happened once — nutrition shipped a
 * SECOND crescent moon of its own, under the same name, in the same box, three
 * hundred lines from the first one, and both were live for months.
 */

const ORIGINS = {
  AURORA_ICON_PATHS,
  NUTRITION_GLYPHS,
  HUB_GLYPHS,
  PRODUCT_GLYPHS,
} as const;

describe("the glyph vocabulary", () => {
  it("HARD — the four origins share no name", () => {
    // A collision is silent and picks a winner by object-spread order, which is
    // to say by the order someone happened to write the maps in.
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const [origin, map] of Object.entries(ORIGINS)) {
      for (const name of Object.keys(map)) {
        const first = seen.get(name);
        if (first) clashes.push(`"${name}" — ${first} and ${origin}`);
        else seen.set(name, origin);
      }
    }
    expect(clashes, `\ntwo origins draw the same name:\n  ${clashes.join("\n  ")}`).toEqual([]);
  });

  it("HARD — every name in the union resolves to path data", () => {
    for (const name of GLYPH_NAMES) {
      expect(glyphPaths(name).length, `${name} has no paths`).toBeGreaterThan(0);
    }
  });

  it("HARD — every glyph is drawn in the 72-unit box, not some other one", () => {
    // THE DEFECT THIS CATCHES, and it is not hypothetical. The nutrition kit's
    // eleven icons were authored in a 24-unit box at strokeWidth ~2. Rendered
    // beside the shared set — 72-unit, `auroraIconStroke` — one screen drew the
    // app's icons at a visibly different optical weight from the screen next to
    // it, and nothing failed, because a viewBox mismatch is invisible in review
    // and obvious on glass.
    //
    // A glyph that never exceeds ~40 was drawn for a smaller box; one that runs
    // past ~120 was drawn for a bigger one. Relative arc/curve DELTAS are
    // legitimately negative and are not coordinates, so the test reads the
    // magnitude the path reaches, not every number in it.
    const all = [...Object.entries(ORIGINS), ["SPORT_MARK_PATHS", SPORT_MARK_PATHS] as const];
    const bad: string[] = [];
    for (const [origin, map] of all) {
      for (const [name, paths] of Object.entries(map as Record<string, string[]>)) {
        const nums = paths.flatMap((d) => [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Math.abs(Number(m[0]))));
        const reach = Math.max(...nums);
        if (!paths.every((d) => /^[Mm]/.test(d.trim()))) bad.push(`${origin}.${name}: a path does not start with a moveto`);
        if (reach < 40) bad.push(`${origin}.${name}: reaches only ${reach} — drawn for a smaller box?`);
        if (reach > 120) bad.push(`${origin}.${name}: reaches ${reach} — drawn for a bigger box?`);
      }
    }
    expect(bad, `\n  ${bad.join("\n  ")}`).toEqual([]);
  });

  it("HARD — the nav map names only glyphs that exist", () => {
    const missing = Object.entries(AURORA_NAV_ICONS)
      .filter(([, icon]) => !(icon in AURORA_ICON_PATHS))
      .map(([id, icon]) => `${id} → ${icon}`);
    expect(missing).toEqual([]);
  });

  it("HARD — the effort ramp is five rungs of ONE head", () => {
    // The five faces replace fourteen emoji across three self-report scales
    // (effort, fatigue, mood). They only read as a SCALE if they are the same
    // drawing with the expression changed — five different heads would be five
    // different pictures, which is what the emoji were.
    const faces: GlyphName[] = ["face-easy", "face-steady", "face-solid", "face-hard", "face-spent"];
    const heads = new Set(faces.map((f) => glyphPaths(f)[0]));
    expect(heads.size, "the five faces do not share one head outline").toBe(1);
    for (const f of faces) expect(glyphPaths(f).length).toBeGreaterThan(1);
  });
});

describe("marks", () => {
  it("resolves a glyph mark and a sport mark through one function", () => {
    expect(markPaths(glyphMark("trophy"))).toEqual(AURORA_ICON_PATHS.trophy);
    expect(markPaths(sportMarkOf("Rowing"))).toEqual(SPORT_MARK_PATHS.oar);
  });

  it("returns nothing for a sport with no drawing, rather than a wrong one", () => {
    // The caller's cue to fall back. Drawing SOMETHING would be the confident
    // wrong answer this codebase refuses everywhere else.
    expect(markPaths(sportMarkOf("Underwater Basket Weaving"))).toEqual([]);
  });
});
