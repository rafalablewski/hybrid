import { describe, it, expect } from "vitest";
import { fs, lh, tracking, trackFigure } from "../scale";
import { fonts } from "./tokens";
import { formatClock } from "../duration";
import { cut, weight, text, resolveText, unitFor, UNIT_RATIO, TIMES, type TextStyle, type TextToken } from "./typography";

const TOKENS = Object.keys(text) as TextToken[];

describe("the named type styles", () => {
  it("HARD — every style resolves through the shared primitives, never a raw number", () => {
    // The whole point of the file: a style holds ROLE NAMES. If a size ever
    // stops being an `fs` key or a leading stops being an `lh` ratio, the
    // ladder has been forked and a change to a rung no longer moves the app.
    for (const t of TOKENS) {
      const s: TextStyle = text[t];
      expect(Object.keys(fs), `${t}.size`).toContain(s.size);
      expect(Object.keys(lh), `${t}.leading`).toContain(s.leading);
      // A style either names one of the two uppercase voices, names the figure
      // tightening, or names nothing — in which case the SIZE decides, which is
      // the whole point of the band table. Anything else is a forked ladder.
      if (s.tracking !== undefined) expect(["text", "label", "caps", "figure", "serif"], `${t}.tracking`).toContain(s.tracking);
      expect(Object.values(weight), `${t}.weight`).toContain(s.weight);
    }
  });

  it("HARD — the cut set matches the faces the app actually loads", () => {
    // THREE cuts, because three faces are loaded — Söhne, Söhne Mono and ITC
    // Garamond Book. Söhne Schmal (takeover titles at 34 and above) is still
    // deliberately absent until the face ships — see the note on `cut`. This
    // guard is not decoration: `condensed` was deleted from tokens.ts once for
    // existing as a name with no binary behind it, and the failure mode was
    // invisible (the phone drew one face, the admin panel another). If you are
    // adding a cut, you are also loading it, and this list moves in the same
    // change.
    expect(Object.keys(cut).sort()).toEqual(["mono", "sans", "serif"]);
    for (const c of Object.values(cut)) expect(Object.values(fonts)).toContain(c);
  });

  it("HARD — the editorial rung belongs to the serif and nothing else", () => {
    // `fs.editorial` (30) exists ONLY because ITC Garamond needs 1.176x Söhne to
    // land on the same x-height. A sans or mono style taking it would be a 30dp
    // rung sitting two dp off `display` for a reason nobody could name, which is
    // exactly how `heading.1` accumulated before it was deleted.
    const bad = TOKENS.filter((t) => (text[t] as TextStyle).size === "editorial" && (text[t] as TextStyle).cut !== "serif");
    expect(bad, `fs.editorial is serif-only:\n  ${bad.join("\n  ")}`).toEqual([]);
    // …and the serif never reaches for a rung below the 24dp floor.
    const thin = TOKENS.filter((t) => (text[t] as TextStyle).cut === "serif" && fs[(text[t] as TextStyle).size] < 24);
    expect(thin, `the serif floor is 24dp:\n  ${thin.join("\n  ")}`).toEqual([]);
  });

  it("HARD — mono never goes above 600", () => {
    // Rule 03. A monospaced 700 closes its counters at exactly the sizes and the
    // distance this product is read at.
    const bad = TOKENS.filter((t) => (text[t] as TextStyle).cut === "mono" && (text[t] as TextStyle).weight > weight.semibold);
    expect(bad, `mono is capped at semibold:\n  ${bad.join("\n  ")}`).toEqual([]);
  });

  it("HARD — bold is display-only", () => {
    // Rule 02/20. 700 below `display` (26) is volume, not hierarchy.
    const bad = TOKENS.filter((t) => (text[t] as TextStyle).weight === weight.bold && fs[(text[t] as TextStyle).size] < fs.display);
    expect(bad, `700 is for 26dp and up:\n  ${bad.join("\n  ")}`).toEqual([]);
  });

  it("HARD — uppercase is mono only, and only at the two smallest rungs", () => {
    // Rule 14. Uppercase is a STRUCTURAL signal in this system; allowing it at
    // reading sizes is how an app grows shouting section titles.
    for (const t of TOKENS.filter((t) => (text[t] as TextStyle).upper)) {
      expect((text[t] as TextStyle).cut, `${t} is uppercase`).toBe("mono");
      expect(fs[(text[t] as TextStyle).size], `${t} is uppercase`).toBeLessThanOrEqual(fs.micro);
    }
  });

  it("HARD — every measured value is tabular, and nothing else is", () => {
    // Rule 05. The mono cut IS the measurement cut; a mono style that forgot
    // `tabular` is a column that will not line up and a roll that will jitter.
    for (const t of TOKENS) {
      const st: TextStyle = text[t];
      expect(st.tabular ?? false, `${t}`).toBe(st.cut === "mono" && !st.upper);
    }
  });

  it("HARD — the retired rungs are unreachable through a named style", () => {
    // `note` (15) and `heading` (20) were never chosen, they accumulated.
    // Anything migrated onto a named style leaves them behind automatically.
    const sizes = new Set(TOKENS.map((t) => (text[t] as TextStyle).size));
    expect([...sizes]).not.toContain("note");
    expect([...sizes]).not.toContain("heading");
  });

  it("HARD — one ladder: no style invents a size the scale does not have", () => {
    // There is deliberately no parallel numeric scale. A figure and the heading
    // beside it are the same rung in a different cut.
    const figureSizes = TOKENS.filter((t) => (text[t] as TextStyle).cut === "mono").map((t) => fs[(text[t] as TextStyle).size]);
    const textSizes = TOKENS.filter((t) => (text[t] as TextStyle).cut === "sans").map((t) => fs[(text[t] as TextStyle).size]);
    for (const f of figureSizes) expect(Object.values(fs)).toContain(f);
    for (const s of textSizes) expect(Object.values(fs)).toContain(s);
  });
});

describe("the eyebrow pair, resolved", () => {
  // THE MIGRATION'S CLAIM, WRITTEN DOWN. 153 inline eyebrows moved onto these
  // two tokens, and the claim was that they render as what shipped. The first
  // attempt collapsed both trackings onto `overline` and silently moved 108 of
  // them by 0.3dp, which is visible on a tracked string — so the numbers are
  // asserted here rather than asserted in a commit message.
  it("kicker is the standard eyebrow, exactly as it shipped", () => {
    expect(resolveText("kicker")).toMatchObject({
      fontFamily: cut.mono,
      fontWeight: weight.medium,
      fontSize: fs.nano,
      letterSpacing: 0.9,
      ink: "secondary",
      upper: true,
    });
  });

  it("overline is the architectural one, and it is wider", () => {
    expect(resolveText("overline").letterSpacing).toBe(1.2);
    expect(resolveText("overline").letterSpacing).toBeGreaterThan(resolveText("kicker").letterSpacing);
    expect(resolveText("overline").fontSize).toBe(resolveText("kicker").fontSize);
  });

  it("declares the line box the inline shapes were leaving to the platform", () => {
    // The old objects set no lineHeight, so the eyebrow took JetBrains Mono's
    // own metrics: (ascent - descent + lineGap) / upem = 1.320em, i.e. 13.2dp
    // at fs.nano. `lh.snug` gives 13. The 0.2dp difference is sub-pixel on any
    // real screen, which is why declaring it is safe — and declaring it is what
    // lets Dynamic Type carry the leading up with the size.
    expect(resolveText("kicker").lineHeight).toBe(13);
    expect(resolveText("kicker", 2).lineHeight).toBe(26);
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
    expect(m.lineHeight).toBe(fs.stat); // lh.flush — no line box a figure cannot use
    expect(m.fontFamily).toBe(cut.mono);
    expect(m.tabular).toBe(true);
  });

  it("tracks figures proportionally and text absolutely", () => {
    // trackFigure is em-derived, so it scales; `tracking` is still dp.
    expect(resolveText("metric").letterSpacing).toBe(trackFigure(fs.stat));
    expect(resolveText("metric", 2).letterSpacing).toBe(trackFigure(fs.stat * 2));
    expect(resolveText("body").letterSpacing).toBe(tracking(fs.body));
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
