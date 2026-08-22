import { describe, it, expect } from "vitest";
import { fs, lh, tracking, trackFigure } from "../scale";
import { fonts } from "./tokens";
import { formatClock } from "../duration";
import { cut, weight, text, resolveText, unitFor, FLUSH, UNIT_RATIO, TIMES, type TextToken } from "./typography";

const TOKENS = Object.keys(text) as TextToken[];

describe("the named type styles", () => {
  it("HARD — every style resolves through the shared primitives, never a raw number", () => {
    // The whole point of the file: a style holds ROLE NAMES. If a size ever
    // stops being an `fs` key or a leading stops being an `lh` ratio, the
    // ladder has been forked and a change to a rung no longer moves the app.
    for (const t of TOKENS) {
      const s = text[t];
      expect(Object.keys(fs), `${t}.size`).toContain(s.size);
      if (s.leading !== FLUSH) expect(Object.keys(lh), `${t}.leading`).toContain(s.leading);
      if (s.tracking !== "figure") expect(Object.keys(tracking), `${t}.tracking`).toContain(s.tracking);
      expect(Object.values(weight), `${t}.weight`).toContain(s.weight);
    }
  });

  it("HARD — the cut set matches the faces the app actually loads", () => {
    // TWO cuts, because two faces are loaded. The spec's third (Söhne Schmal,
    // takeover titles at 34 and above) is deliberately absent until the face
    // ships — see the note on `cut`. This guard is not decoration: `condensed`
    // was deleted from tokens.ts once for existing as a name with no binary
    // behind it, and the failure mode was invisible (the phone drew one face,
    // the admin panel another). If you are adding the third cut, you are also
    // loading it, and this number moves in the same change.
    expect(Object.keys(cut).sort()).toEqual(["mono", "sans"]);
    for (const c of Object.values(cut)) expect(Object.values(fonts)).toContain(c);
  });

  it("HARD — mono never goes above 600", () => {
    // Rule 03. A monospaced 700 closes its counters at exactly the sizes and the
    // distance this product is read at.
    const bad = TOKENS.filter((t) => text[t].cut === "mono" && text[t].weight > weight.semibold);
    expect(bad, `mono is capped at semibold:\n  ${bad.join("\n  ")}`).toEqual([]);
  });

  it("HARD — bold is display-only", () => {
    // Rule 02/20. 700 below `display` (26) is volume, not hierarchy.
    const bad = TOKENS.filter((t) => text[t].weight === weight.bold && fs[text[t].size] < fs.display);
    expect(bad, `700 is for 26dp and up:\n  ${bad.join("\n  ")}`).toEqual([]);
  });

  it("HARD — uppercase is mono only, and only at the two smallest rungs", () => {
    // Rule 14. Uppercase is a STRUCTURAL signal in this system; allowing it at
    // reading sizes is how an app grows shouting section titles.
    for (const t of TOKENS.filter((t) => text[t].upper)) {
      expect(text[t].cut, `${t} is uppercase`).toBe("mono");
      expect(fs[text[t].size], `${t} is uppercase`).toBeLessThanOrEqual(fs.micro);
    }
  });

  it("HARD — every measured value is tabular, and nothing else is", () => {
    // Rule 05. The mono cut IS the measurement cut; a mono style that forgot
    // `tabular` is a column that will not line up and a roll that will jitter.
    for (const t of TOKENS) {
      expect(text[t].tabular ?? false, `${t}`).toBe(text[t].cut === "mono" && !text[t].upper);
    }
  });

  it("HARD — the retired rungs are unreachable through a named style", () => {
    // `note` (15) and `heading` (20) were never chosen, they accumulated.
    // Anything migrated onto a named style leaves them behind automatically.
    const sizes = new Set(TOKENS.map((t) => text[t].size));
    expect([...sizes]).not.toContain("note");
    expect([...sizes]).not.toContain("heading");
  });

  it("HARD — one ladder: no style invents a size the scale does not have", () => {
    // There is deliberately no parallel numeric scale. A figure and the heading
    // beside it are the same rung in a different cut.
    const figureSizes = TOKENS.filter((t) => text[t].cut === "mono").map((t) => fs[text[t].size]);
    const textSizes = TOKENS.filter((t) => text[t].cut === "sans").map((t) => fs[text[t].size]);
    for (const f of figureSizes) expect(Object.values(fs)).toContain(f);
    for (const s of textSizes) expect(Object.values(fs)).toContain(s);
  });
});

describe("resolveText", () => {
  it("derives leading from the size, so Dynamic Type carries it", () => {
    const at1 = resolveText("body");
    const at2 = resolveText("body", 2);
    expect(at1).toMatchObject({ fontSize: fs.body, lineHeight: Math.round(fs.body * lh.normal) });
    // The failure this prevents: a doubled size against a fixed line box, which
    // is text colliding with itself before it clips.
    expect(at2.lineHeight).toBe(Math.round(fs.body * 2 * lh.normal));
    expect(at2.lineHeight / at2.fontSize).toBeCloseTo(at1.lineHeight / at1.fontSize, 1);
  });

  it("sets a standalone figure solid", () => {
    const m = resolveText("metric");
    expect(m.fontSize).toBe(fs.stat);
    expect(m.lineHeight).toBe(fs.stat); // FLUSH — no line box a figure cannot use
    expect(m.fontFamily).toBe(cut.mono);
    expect(m.tabular).toBe(true);
  });

  it("tracks figures proportionally and text absolutely", () => {
    // trackFigure is em-derived, so it scales; `tracking` is still dp.
    expect(resolveText("metric").letterSpacing).toBe(trackFigure(fs.stat));
    expect(resolveText("metric", 2).letterSpacing).toBe(trackFigure(fs.stat * 2));
    expect(resolveText("body").letterSpacing).toBe(tracking.normal);
  });

  it("a readout is one weight below a result", () => {
    // The system's one semantic weight distinction: the world reporting itself
    // vs the athlete's result. It is why a screen of numbers still has a subject.
    expect(resolveText("readout").fontWeight).toBeLessThan(resolveText("figure").fontWeight);
    expect(resolveText("readout").fontSize).toBe(resolveText("figure").fontSize);
  });
});

describe("unitFor", () => {
  it("a unit never competes with its figure", () => {
    // Rule 06 — differ in face, weight, size and ink, or `92.4kg` reads as one
    // seven-character token and the figure stops being scannable.
    for (const size of [fs.stat, fs.display, fs.headline, fs.bodyLg]) {
      const u = unitFor(size);
      expect(u.fontFamily).toBe(cut.sans);
      expect(u.fontFamily).not.toBe(cut.mono);
      expect(u.fontSize).toBeLessThan(size);
      expect(u.fontWeight).toBeLessThan(weight.semibold);
      expect(u.ink).toBe("secondary");
    }
  });

  it("holds the 11dp label floor and the 16dp ceiling", () => {
    // The clamp is a FLOOR, not a suggestion: 0.42 × fs.bodyLg is 5.88.
    expect(unitFor(fs.bodyLg).fontSize).toBe(fs.micro);
    // And a CEILING: 0.42 x fs.stat is 19, which is above `subtitle` — a unit
    // must never reach heading size, so the clamp binds at both ends of the
    // range and the ratio is a target rather than an identity.
    expect(Math.round(fs.stat * UNIT_RATIO)).toBeGreaterThan(fs.subtitle);
    expect(unitFor(fs.stat).fontSize).toBe(fs.subtitle);
    expect(unitFor(fs.display).fontSize).toBe(Math.round(fs.display * UNIT_RATIO));
    expect(unitFor(200).fontSize).toBe(fs.subtitle);
  });

  it("% ° ′ ″ bind tight; everything else takes 0.25em", () => {
    expect(unitFor(fs.stat, "%").gapEm).toBe(0);
    expect(unitFor(fs.stat, "°").gapEm).toBe(0);
    expect(unitFor(fs.stat, "kg").gapEm).toBe(0.25);
    expect(unitFor(fs.stat).gapEm).toBe(0.25);
  });
});

describe("figure formats", () => {
  it("a live clock never changes width; a finished one reads as prose", () => {
    expect(formatClock(6138, true)).toBe("01:42:18");
    expect(formatClock(6138)).toBe("1:42:18");
    expect(formatClock(3248)).toBe("54:08");
    expect(formatClock(3248, true)).toBe("54:08");
    // The defect this prevents: a live timer crossing the hour boundary and
    // shifting every digit beside it.
    expect(formatClock(3599, true)).toHaveLength(5);
    expect(formatClock(3600, true)).toBe("01:00:00");
    expect(formatClock(-5, true)).toBe("00:00");
  });

  it("the multiplication sign is U+00D7", () => {
    // `100 kg × 5` is the product's most-read string. `x` is a glyph from a
    // different alphabet doing an impression of an operator.
    expect(TIMES).toBe("×");
    expect(TIMES).not.toBe("x");
  });
});
