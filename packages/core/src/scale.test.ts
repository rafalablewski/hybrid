import { describe, expect, it } from "vitest";
import { fs, space, lh, leading, tracking, trackFigure, TRACK_FIGURE_EM, fitMonoFigure, MONO_ADVANCE_EM, type TypeRole, type SpaceToken } from "./scale";
import { ALPHA, fonts, fontImportUrl } from "./theme/tokens";

/**
 * THE SCALE'S OWN GUARD.
 *
 * The design audit's root finding was that the token system is well authored and
 * not enforced — nothing failed when a call site invented a value. Motion was the
 * one healthy axis precisely because motion.test.ts holds it to its own rules.
 * This is the same guard for type, spacing, leading and tracking: it can't stop a
 * screen writing `fontSize: 21`, but it does stop the SCALE itself from growing a
 * rung that breaks the ladder's promises.
 */

// Eleven rungs. `note` (15) and `heading` (20) were retired in Aug 2026 — see
// the note on `fs` for why neither was ever chosen.
const ORDER: TypeRole[] = [
  "nano", "micro", "caption", "body", "bodyLg",
  "subtitle", "title", "headline", "display", "hero", "stat",
];

const SPACE_ORDER: SpaceToken[] = [
  "none", "xxs", "xs", "sm", "ms", "md", "lg", "xl", "xxl", "xxxl", "huge",
];

describe("type scale", () => {
  it("names every rung exactly once", () => {
    expect(Object.keys(fs).sort()).toEqual([...ORDER].sort());
  });

  it("ascends strictly — no two rungs share a size", () => {
    const sizes = ORDER.map((r) => fs[r]);
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]!, `${ORDER[i]} must exceed ${ORDER[i - 1]}`).toBeGreaterThan(sizes[i - 1]!);
    }
  });

  it("never dips below the legibility floor", () => {
    // 10 is `nano`, and it is the floor on purpose: below it the app's dominant
    // eyebrow style (mono + uppercase + tracked) stops being readable at arm's
    // length. The audit found 98 text nodes at 8–9px; the ladder must not be the
    // thing that legitimises them.
    for (const role of ORDER) expect(fs[role], role).toBeGreaterThanOrEqual(10);
  });

  it("steps grow with size — a ladder is not a list", () => {
    // WHAT THIS IS NOT: a floor on how close two rungs may sit. I wrote that
    // rule first, and it was wrong three times in a row — nano->micro,
    // micro->caption and caption->body are all a single dp, because at 10dp a
    // 1dp step is +10% and reads as a level while at 34dp it is +3% and does
    // not. A dp floor is the wrong unit, and a RATIO floor would not have
    // justified the retirements either: 20->22 and 10->11 are both 1.10.
    //
    // The retirements were earned by DUPLICATED JOB, not by spacing. `note`
    // (15) and `bodyLg` (14) were both "the emphasised body line"; `heading`
    // (20) and `headline` (22) were both "the screen sub-heading". Two names
    // for one job is a defect a measurement cannot find, which is why that
    // argument lives in prose beside `fs` and not in an assertion here.
    //
    // WHAT IS TRUE AND WORTH GUARDING: the steps never shrink as the ladder
    // climbs. 1,1,1,1,2,2,4,4,8,12. That is the optical property a scale has to
    // hold — equal-looking increments need proportionally larger jumps — and a
    // ladder that stepped 4 then 2 would be visibly wrong in a way no single
    // rung looks wrong on its own.
    const sizes = ORDER.map((r) => fs[r]);
    const gaps = sizes.slice(1).map((v, i) => v - sizes[i]!);
    for (let i = 1; i < gaps.length; i++) {
      expect(gaps[i]!, `${ORDER[i]} -> ${ORDER[i + 1]} steps back down`).toBeGreaterThanOrEqual(gaps[i - 1]!);
    }
  });

  it("has retired `note` and `heading`, and cannot get them back by accident", () => {
    expect(Object.keys(fs)).not.toContain("note");
    expect(Object.keys(fs)).not.toContain("heading");
    expect(Object.values(fs)).not.toContain(15);
    expect(Object.values(fs)).not.toContain(20);
  });

  it("ends at `stat` — a figure larger than this is a design smell", () => {
    expect(Math.max(...Object.values(fs))).toBe(fs.stat);
  });
});

describe("spacing scale", () => {
  it("starts at zero and ascends strictly", () => {
    const sizes = SPACE_ORDER.map((r) => space[r]);
    expect(sizes[0]).toBe(0);
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]!, `${SPACE_ORDER[i]} must exceed ${SPACE_ORDER[i - 1]}`).toBeGreaterThan(sizes[i - 1]!);
    }
  });

  it("is entirely even — an odd gap can't sit on a half-pixel boundary", () => {
    for (const token of SPACE_ORDER) expect(space[token] % 2, token).toBe(0);
  });
});

describe("leading", () => {
  it("ascends from tight to relaxed", () => {
    expect(lh.tight).toBeLessThan(lh.snug);
    expect(lh.snug).toBeLessThan(lh.normal);
    expect(lh.normal).toBeLessThan(lh.relaxed);
  });

  it("is expressed as a RATIO, so a scaled size carries its line box with it", () => {
    // The Dynamic Type failure mode: an absolute lineHeight leaves the line box
    // where it was when the OS scales the glyphs. Doubling the size must double
    // the leading.
    expect(leading(fs.body)).toBe(Math.round(fs.body * lh.normal));
    expect(leading(fs.body * 2)).toBe(Math.round(fs.body * 2 * lh.normal));
  });

  it("always clears the font size — a line box can't be shorter than its glyphs", () => {
    for (const role of ORDER) {
      expect(leading(fs[role], "tight"), role).toBeGreaterThan(fs[role]);
    }
  });

  it("returns whole dp so text lands on the pixel grid", () => {
    expect(Number.isInteger(leading(15, "relaxed"))).toBe(true);
  });

  it("defaults to `normal`", () => {
    expect(leading(fs.body)).toBe(leading(fs.body, "normal"));
  });
});

describe("tracking", () => {
  it("takes air out of large type and adds it to caps", () => {
    // THE BANDS, and the direction of each: large type gets air taken OUT,
    // small copy gets a trace back IN, and uppercase always gets more.
    expect(tracking(fs.hero)).toBeLessThan(0);
    expect(tracking(fs.display)).toBeLessThan(0);
    expect(tracking(fs.body)).toBe(0);
    expect(tracking(fs.caption)).toBeGreaterThan(0);
    expect(tracking(fs.nano, "caps")).toBeGreaterThan(tracking(fs.nano, "label"));
  });

  it("trackFigure tightens proportionally, where the absolute rung cannot", () => {
    // The whole point: -0.5 is -0.017em at 30dp and -0.007em at 68dp, so one
    // absolute value cannot serve a 2.3x span. This one scales with the figure.
    // Equal em across the span, to within the 0.1dp rounding — which at 30dp
    // is worth ~0.002em, so `2` is the honest precision here, not `3`.
    expect(trackFigure(30) / 30).toBeCloseTo(trackFigure(68) / 68, 2);
    // And every figure in the band is tighter than the absolute rung would be.
    for (const size of [30, 40, 46, 56, 68]) {
      expect(trackFigure(size), `${size}dp`).toBeLessThan(tracking(fs.display));
    }
  });

  it("lands on what the biggest figures were already drawn at", () => {
    // fs.stat carried -1.6 by hand at three sites before this existed; the
    // constant was derived from that cluster, so it has to return it.
    expect(trackFigure(fs.stat)).toBe(-1.6);
    // Rounded to 0.1dp — RN takes fractional letterSpacing, and at this size
    // the tenth is visible.
    expect(trackFigure(46)).toBe(Math.round(46 * TRACK_FIGURE_EM * 10) / 10);
  });

  it("codifies the two eyebrow trackings already in use", () => {
    // 0.9 (216 sites) and 1.2 (137 sites) at the time of the audit. Changing
    // either is a deliberate restyle of every kicker in the app, not a tweak.
    // THE CONVERSION PROOF. These are the four dominant call-site shapes, and
    // every one resolves to the dp value that shipped before tracking became an
    // em — 340 of 461 sized sites render byte-identically. If a band is ever
    // retuned, this is the test that says what it costs.
    expect(tracking(fs.nano, "label")).toBe(0.9);   // 201 sites
    expect(tracking(fs.micro, "label")).toBe(0.9);  //  48 sites
    expect(tracking(fs.nano, "caps")).toBe(1.2);    //  72 sites
    expect(tracking(fs.display)).toBe(-0.5);        //  19 sites
    // And the largest move anywhere, which is a correction rather than a drift:
    // a 15dp lead was carrying the 34dp hero's tightening.
    expect(tracking(fs.bodyLg)).toBe(0);
  });
});

describe("ALPHA — the tint scale", () => {
  it("rises, and splits into a surface family and a border family", () => {
    expect(ALPHA.wash).toBeLessThan(ALPHA.fill);
    expect(ALPHA.fill).toBeLessThan(ALPHA.solid);
    expect(ALPHA.solid).toBeLessThan(ALPHA.edge);
    expect(ALPHA.edge).toBeLessThan(ALPHA.line);
    expect(ALPHA.line).toBeLessThan(ALPHA.rim);
  });

  it("keeps the SURFACE rungs close and lets the BORDER rungs breathe", () => {
    // The two families tolerate different precision. A surface is a large area
    // where a 4% shift is subtle but visible; a border is ONE PIXEL wide, where
    // it is not. So the surface steps must stay tighter than the border steps —
    // that asymmetry IS the scale, and flattening it would break the migration's
    // guarantee that nothing moved by more than 0.04.
    const surface = ALPHA.solid - ALPHA.wash;
    const border = ALPHA.rim - ALPHA.edge;
    expect(surface).toBeLessThan(border);
    expect(ALPHA.fill - ALPHA.wash).toBeLessThanOrEqual(0.05);
    expect(ALPHA.solid - ALPHA.fill).toBeLessThanOrEqual(0.05);
  });

  it("stops where the axis stops being a scale", () => {
    // Nothing above ~0.45 has a rung, deliberately: the measured histogram runs
    // CONTINUOUS from 0 to 1 because gradient ramps need arbitrary intermediate
    // stops and scrims are tuned against the content behind them. A token set
    // covering 71% of its axis honestly beats one covering 100% by pretending.
    for (const v of Object.values(ALPHA)) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThanOrEqual(0.45);
    }
  });
});

/**
 * THE FACES — two, and the guard is here because the third one died quietly.
 *
 * `fonts.condensed` (Archivo Narrow) was declared in the brand tokens and
 * specified in the build brief for two years, and the mobile app — the product —
 * never loaded it: four Archivo weights and two JetBrains Mono weights in
 * `useFonts`, no `@expo-google-fonts/archivo-narrow` anywhere. Nothing failed,
 * because a declared-but-unloaded family is not an error on either platform: RN
 * falls back to the system face and CSS falls through to the next name in the
 * stack. So the identity read as three faces in the tokens and shipped as two,
 * and the web admin's chips drew in a face the phone's admin console could not.
 *
 * These assertions exist so re-declaring the face is a deliberate act with a
 * loading step attached, rather than a line in a token file that looks true.
 */
describe("the type faces", () => {
  it("declares exactly the faces the app loads", () => {
    expect(Object.keys(fonts).sort()).toEqual(["display", "mono"]);
  });

  it("asks the font service for nothing it does not declare", () => {
    // A webfont in the @import that no token names is a download for nothing,
    // and it is how Archivo Narrow stayed alive on web after the mobile app had
    // already decided against it.
    const families = [...fontImportUrl.matchAll(/family=([^&:]+)/g)].map((m) => m[1]!.replace(/\+/g, " "));
    expect(families.sort()).toEqual(Object.values(fonts).slice().sort());
  });
});

/**
 * FITTING A FIGURE, RATHER THAN GUESSING AT ONE.
 *
 * The activity card shipped four figures in four quarter-width columns and two
 * of them broke mid-word on a phone. Nothing was wrong with the code that a
 * reviewer could see; what was missing was the multiplication that says whether
 * a mono figure fits before a size is committed to. These pin that arithmetic,
 * including the two answers that are easy to get backwards: an UNMEASURED
 * container gets the caller's first choice (not the floor, which would render
 * every figure small for a frame and then jump), and a figure past the floor
 * gets the floor (the caller owns what happens past it).
 */
describe("fitMonoFigure", () => {
  const ladder = [26, 22, 20] as const;
  /** What a string of `n` glyphs costs at `size`, by the same arithmetic. */
  const cost = (n: number, size: number) => n * size * MONO_ADVANCE_EM;

  /** A receipt cell's type width on a 390dp screen: the card's 326dp inner
   *  width, halved, less the cell's own 8dp inset. */
  const CELL = 155;

  it("takes the largest rung that fits", () => {
    expect(fitMonoFigure("15.3 t", CELL, ladder)).toBe(26);
    expect(cost(6, 26)).toBeLessThanOrEqual(CELL);
    // A nine-glyph span still clears the top rung, which is the point of asking
    // rather than assuming: the pessimistic guess would have shrunk it.
    expect(fitMonoFigure("10h 15min", CELL, ladder)).toBe(26);
  });

  it("steps down exactly when the next rung stops fitting", () => {
    // Eleven glyphs — a year-to-date span — is where 26 goes over and 22 does not.
    expect(cost(11, 26)).toBeGreaterThan(CELL);
    expect(cost(11, 22)).toBeLessThanOrEqual(CELL);
    expect(fitMonoFigure("1240h 55min", CELL, ladder)).toBe(22);
  });

  it("lands on the floor rather than off the ladder", () => {
    expect(fitMonoFigure("10240h 55min", CELL, ladder)).toBe(20);
  });

  it("answers the caller's first choice while the container is unmeasured", () => {
    for (const w of [0, -1, Number.NaN]) expect(fitMonoFigure("15.3 t", w, ladder)).toBe(26);
  });

  it("asks the question at the athlete's own text size", () => {
    // The same figure that fits at 1x need not fit at 1.4x, and a layout that
    // asks only about 1x is a layout that breaks for the people who most need
    // it not to.
    expect(fitMonoFigure("6h 52min", CELL, ladder)).toBe(26);
    expect(fitMonoFigure("6h 52min", CELL, ladder, 1.4)).toBe(22);
  });

  it("keeps the PLAIN figure inside the cell at the largest scale it allows", () => {
    // The other three cells do not step — they are fixed at fs.headline — so the
    // grid only holds if that rung clears the cell at the multiplier the text
    // is capped to. This is the assertion the four-column row never had.
    expect(cost("6h 52min".length, 20) * 1.4).toBeLessThanOrEqual(CELL);
    expect(cost("1240h 55min".length, 20) * 1.15).toBeLessThanOrEqual(CELL);
  });

  it("is monotonic in width — more room never yields a smaller figure", () => {
    let last = 0;
    for (let w = 40; w <= 400; w += 4) {
      const got = fitMonoFigure("6h 52min", w, ladder);
      expect(got).toBeGreaterThanOrEqual(last);
      last = got;
    }
  });
});
