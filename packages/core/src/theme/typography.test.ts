import { describe, it, expect } from "vitest";
import { fs, lh, leading, tracking, trackFigure, STEP, promote, type TypeRole } from "../scale";
import { fonts } from "./tokens";
import { formatClock } from "../duration";
import { cut, weight, text, resolveText, unitFor, measureFor, DESKTOP_PROMOTION, WEIGHT_STEM_EM, UNIT_RATIO, TIMES, type TextStyle, type TextToken } from "./typography";

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
      // the whole point of the optical curve. Anything else is a forked ladder.
      if (s.tracking !== undefined) expect(["text", "label", "caps", "figure"], `${t}.tracking`).toContain(s.tracking);
      expect(Object.values(weight), `${t}.weight`).toContain(s.weight);
    }
  });

  it("HARD — the cut set matches the faces the app actually loads", () => {
    // TWO cuts, because two faces are loaded — Söhne and Söhne Mono. ITC
    // Garamond Book was a third until Aug 2026 and its deletion moved this list
    // in the same change, which is the guard working in the outward direction.
    // Söhne Schmal (takeover titles at 34 and above) is still deliberately
    // absent until the face ships — see the note on `cut`. This
    // guard is not decoration: `condensed` was deleted from tokens.ts once for
    // existing as a name with no binary behind it, and the failure mode was
    // invisible (the phone drew one face, the admin panel another). If you are
    // adding a cut, you are also loading it, and this list moves in the same
    // change.
    expect(Object.keys(cut).sort()).toEqual(["mono", "sans"]);
    for (const c of Object.values(cut)) expect(Object.values(fonts)).toContain(c);
  });

  it("HARD — no style names a rung the ladder does not carry", () => {
    // This used to guard `fs.editorial` (33) — the serif's own rung, off the
    // ladder, and forbidden to any cut but `serif`, because a 33dp sans heading
    // would have sat two dp off `hero` for a reason nobody could name. The face
    // went in Aug 2026 and the rung went with it; what the guard protects now is
    // the property underneath it: every size a token names is a rung, so moving
    // a rung moves the app and nothing sits between two of them.
    const bad = TOKENS.filter((t) => !(text[t] as TextStyle).size || !(Object.keys(fs) as string[]).includes((text[t] as TextStyle).size));
    expect(bad, `every size must be a rung:\n  ${bad.join("\n  ")}`).toEqual([]);
  });

  it("HARD — mono never goes above 600", () => {
    // Rule 03. A monospaced 700 closes its counters at exactly the sizes and the
    // distance this product is read at.
    const bad = TOKENS.filter((t) => (text[t] as TextStyle).cut === "mono" && (text[t] as TextStyle).weight > weight.semibold);
    expect(bad, `mono is capped at semibold:\n  ${bad.join("\n  ")}`).toEqual([]);
  });

  it("HARD — the ladder has no 700 to reach for", () => {
    // There is no `weight.bold` any more. It survived the first cut of the
    // rebuild for one style — the Wrapped's cover titles — on the reasoning that
    // a LIT surface wants a heavier cut, and the premise was false:
    // HERO_TAKEOVER_INK is #0a0b09, darker than `ink`. The app has no lit
    // full-bleed surface, so the exception had nowhere to apply.
    expect(Object.values(weight)).toEqual([400, 500, 600]);
    expect((weight as Record<string, number>)["bold"]).toBeUndefined();
    const bad = TOKENS.filter((t) => (text[t] as TextStyle).weight > 600);
    expect(bad, `nothing above 600: ${bad.join(", ")}`).toEqual([]);
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
    // The old objects set no lineHeight, so the eyebrow took the mono face's own
    // metrics — 1.326em for Söhne Mono (hhea 1.037 + 0.289), i.e. 13.3dp at
    // fs.nano. `lh.snug` gives 13. The 0.3dp difference is sub-pixel on any real
    // screen, which is why declaring it is safe — and declaring it is what lets
    // Dynamic Type carry the leading up with the size.
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

  it("sets a standalone figure solid — to the FIGURE SET'S INK, not to 1.0", () => {
    const m = resolveText("metric");
    expect(m.fontSize).toBe(fs.stat);
    expect(m.fontFamily).toBe(cut.mono);
    expect(m.tabular).toBe(true);
    // `lh.flush` is 0.90, cut from the measured 0.804em span of the mono figure
    // set plus the headroom React Native's baseline placement needs. 1.0 was
    // the round number nearest the intent and still carried 0.196em of nothing —
    // 9dp at `fs.stat`, which is the band of empty under a row of stat tiles
    // that no padding change explains.
    expect(m.lineHeight).toBe(Math.round(fs.stat * lh.flush));
    expect(m.lineHeight).toBeLessThan(fs.stat);
    // …and it still clears the ink it has to hold.
    expect(m.lineHeight).toBeGreaterThan(fs.stat * 0.804);
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

/**
 * THE RULES THE Aug 2026 REBUILD ADDED. Each one is a defect that was found by
 * measuring the shipped binaries rather than by looking at a screen, which is
 * why each one needs a guard: none of them looks broken in isolation.
 */
describe("the weight ladder on a dark ground", () => {
  it("the ladder is a ladder in INK, which is the thing being reasoned about", () => {
    // Söhne draws all four cuts on one skeleton, so a weight is its stem and
    // nothing else. If that stopped being true the irradiation argument above
    // would need re-making rather than re-reading.
    const stems = [weight.regular, weight.medium, weight.semibold].map((w) => WEIGHT_STEM_EM[w]!);
    for (let i = 1; i < stems.length; i++) expect(stems[i]!).toBeGreaterThan(stems[i - 1]!);
    expect(WEIGHT_STEM_EM[weight.semibold]! / WEIGHT_STEM_EM[weight.regular]!).toBeCloseTo(1.56, 2);
  });

  it("gives the heading band a weight step, not just a size step", () => {
    // Four consecutive heading rungs at one weight is hierarchy by size alone —
    // a third of the available signal left unused.
    expect(resolveText("title").fontWeight).toBeGreaterThan(resolveText("subtitle").fontWeight);
    expect(resolveText("subtitle").fontWeight).toBeGreaterThan(resolveText("body").fontWeight);
  });
});

describe("the editorial voice", () => {
  it("HARD — the conclusion outranks the utility styles it was mistaken for", () => {
    // THE WHOLE POINT OF THE TOKEN, and it is the part that survived the face.
    // The two consumers (the week verdict's lead, the nutrition nudge) were set
    // in `subtitle` and `body` — a heading style and a help-text style — which
    // is what "reads as a caption for something else" meant. The serif carried
    // the rank from Aug 2026 until the face was deleted; SIZE carries it now, so
    // the one thing that must not drift back is the rung.
    expect(resolveText("editorial").fontSize).toBeGreaterThan(resolveText("subtitle").fontSize);
    expect(resolveText("editorial").fontSize).toBeGreaterThan(resolveText("body").fontSize);
  });

  it("HARD — it is PROSE, so it never takes a heading's weight", () => {
    // The other half of the distinction, and the reason a bigger `subtitle` is
    // not the same token. `title` and `subtitle` are set in medium; a sentence
    // that concludes something is regular, and the weight is what keeps the
    // headings around it legible as headings.
    expect(resolveText("editorial").fontWeight).toBe(weight.regular);
    expect(resolveText("editorial").fontWeight).toBeLessThan(resolveText("title").fontWeight);
  });

  it("no longer sets a conclusion at a pull quote's line box", () => {
    // The defect the serif's own leading was derived to fix: `fs.editorial` was
    // inflated 18.6% so ITC Garamond's x-height landed where Söhne's did, and a
    // leading RATIO multiplies that inflated em — so `snug` was really 1.53x the
    // APPARENT size, i.e. body leading on a display-size quote. On one face the
    // em and the apparent size are the same thing again, and `snug` is what a
    // one-to-two-line sentence takes.
    expect(resolveText("editorial").lineHeight).toBe(leading(fs.title, "snug"));
    expect(resolveText("editorial").lineHeight / resolveText("editorial").fontSize).toBeLessThan(1.5);
  });
});

describe("controls", () => {
  it("names the sizes APill already draws, so adopting it is a refactor", () => {
    // The first cut of these tokens was designed against the specification and
    // not against the app — `bodyLg` and `caption`, where APill had long since
    // settled on `subtitle` for a full-width control and `bodyLg` for a compact
    // one. Wiring that would have shrunk every button in the product by a rung.
    expect(resolveText("button").fontSize).toBe(fs.subtitle);
    expect(resolveText("buttonSm").fontSize).toBe(fs.bodyLg);
    expect(resolveText("button").fontWeight).toBe(weight.semibold);
    expect(resolveText("buttonSm").fontWeight).toBe(weight.semibold);
    // PRIMARY ink: a control meant to be pressed cannot be set in the colour
    // reserved for things that are merely true. (APill overrides it per variant
    // — a pill's ink is its variant's business — but the token's default is the
    // one a bare control gets.)
    expect(resolveText("button").ink).toBe("primary");
  });
});

describe("measure", () => {
  it("answers in characters, so the number is a reading decision", () => {
    // 66 characters, turned into a width by the face's own average advance.
    for (const t of ["body", "prose", "bodyLg"] as TextToken[]) {
      expect(measureFor(t)).toBe(measureFor(t, 66));
      expect(measureFor(t, 45)).toBeLessThan(measureFor(t, 75));
    }
    // A bigger rung needs a wider column to hold the same count — which is the
    // whole reason a hand-typed max-width goes wrong the moment a size moves.
    expect(measureFor("prose")).toBeLessThan(measureFor("headline"));
  });
});

describe("the desktop scale", () => {
  it("HARD — promoting by one step maps every rung ONTO the next rung", () => {
    // The claim that lets desktop and mobile share one ladder instead of
    // forking, which is the drift scale.ts exists to prevent. It holds as an
    // IDENTITY rather than an approximation, because the ladder is generated by
    // this very ratio — so it is worth asserting rung by rung.
    const LADDER: TypeRole[] = ["nano", "micro", "caption", "body", "bodyLg", "subtitle", "title", "headline"];
    for (let i = 0; i < LADDER.length - 1; i++) {
      expect(promote(LADDER[i]!, DESKTOP_PROMOTION), `${LADDER[i]} promoted`).toBe(fs[LADDER[i + 1]!]);
    }
    expect(DESKTOP_PROMOTION).toBe(1);
    // AND THE ARITHMETIC THAT LOOKS EQUIVALENT AND IS NOT — the bug this API
    // shape exists to prevent. Rounding a rung and then multiplying loses the
    // half dp the exact ladder carries, so `micro` promoted by multiplication
    // lands on 12, which is not a rung at all.
    expect(Math.round(fs.micro * STEP)).toBe(12);
    expect(promote("micro")).toBe(fs.caption);
    expect(Object.values(fs)).not.toContain(12);
  });

  it("carries leading and tracking up with the size, not just the size", () => {
    const m = resolveText("body");
    const d = resolveText("body", 1, DESKTOP_PROMOTION);
    expect(d.fontSize).toBe(fs.bodyLg);
    // Leading is a ratio, so it follows for free.
    expect(d.lineHeight / d.fontSize).toBeCloseTo(m.lineHeight / m.fontSize, 1);
    // Tracking is a function of the RENDERED size, so the promoted rung gets the
    // correction its new size deserves rather than carrying the old one up —
    // which is the whole reason the band table had to become a curve.
    expect(d.letterSpacing).toBe(tracking(fs.bodyLg));
  });
});
