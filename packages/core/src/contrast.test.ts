import { describe, expect, it } from "vitest";
import { blendOver, contrastRatio, inkHold, inkOn, relativeLuminance, smoothstep, WCAG } from "./contrast";
import { colors } from "./theme/tokens";
import { FEEDBACK } from "./theme/feedback";
import { THEMES } from "./theme/palette";

/**
 * THE INK ON A FILLED CONTROL, held to the bar it exists to clear.
 *
 * `inkOn` was written because three of the app's most destructive buttons —
 * "Delete account", "Erase everything", "Leave plan" — each hand-picked
 * `color: "#fff"` for a Muskmelon fill, which measures 2.36:1. That is below
 * WCAG AA (4.5) and below even the 3:1 large-text floor, on the controls where
 * misreading the label costs the most. Nothing failed, because nothing was
 * looking: the ink was a literal at a call site, and a literal has no opinion.
 *
 * These tests are the opinion. Every fill the app can hand a filled control has
 * to have a brand ink that clears AA on it — and the ONE it picks has to be
 * that ink, not merely a passing one.
 */

const DARK = THEMES.dark;
/** The two inks the brand will put on a filled surface. Nothing else is legal —
 *  see `inkOn`'s own note on why this is a choice and not a generated colour. */
const INKS = [DARK.onAccent, DARK.chalk] as const;

/** Every fill a caller can legitimately hand `APill` (or any filled control):
 *  the four brand accents, and the two outcome fills. */
const FILLS: Record<string, string> = {
  lime: colors.lime,
  red: colors.red,
  amber: colors.amber,
  blue: colors.blue,
  chalk: DARK.chalk,
  "feedback.error": FEEDBACK.error.fill,
  "feedback.success": FEEDBACK.success.fill,
};

describe("smoothstep — the curve the quiet wash is shaped on", () => {
  it("is flat at both ends, symmetric, and clamps", () => {
    // A linear ramp drops from the first pixel and the eye finds the corner.
    // This leaves and arrives tangentially, which is what makes the wash read
    // as shade rather than as a shape.
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(1)).toBe(1);
    expect(smoothstep(0.5)).toBe(0.5);
    expect(smoothstep(-1)).toBe(0);
    expect(smoothstep(2)).toBe(1);
    expect(smoothstep(0.25) + smoothstep(0.75)).toBeCloseTo(1, 10);
    // Slow at the ends, fast through the middle.
    expect(smoothstep(0.6) - smoothstep(0.5)).toBeGreaterThan(smoothstep(0.1) - smoothstep(0));
  });
});

describe("blendOver + inkHold — the measured hold-back", () => {
  const INK = "#0c0d0c";
  const CHALK = "#f7f6f3";
  const LADDER = [0.54, 0.62, 0.68, 0.78] as const;

  it("composites an alpha the way the screen does", () => {
    expect(blendOver(CHALK, 1, INK)).toBe(CHALK);
    expect(blendOver(CHALK, 0, INK)).toBe(INK);
    // Halfway is halfway, per channel, rounded.
    expect(blendOver("#ffffff", 0.5, "#000000")).toBe("#808080");
  });

  it("clamps rather than throwing on an alpha outside the range", () => {
    expect(blendOver(CHALK, 2, INK)).toBe(CHALK);
    expect(blendOver(CHALK, -1, INK)).toBe(INK);
  });

  it("takes the strongest hold-back a dark ground can afford", () => {
    // The quiet band's top stop: amber at 0.20 over the page ground.
    const quiet = blendOver("#daa51d", 0.2, INK);
    const a = inkHold(CHALK, quiet, LADDER);
    expect(a).toBe(0.54);
    expect(contrastRatio(blendOver(CHALK, a, quiet), quiet)).toBeGreaterThanOrEqual(WCAG.AA);
  });

  it("gives a tight ground no hold-back at all rather than a failing one", () => {
    // Lyons Blue is the palette's tightest fill: its best ink only reaches
    // 4.60:1 at FULL strength, so no step on the ladder can clear AA.
    const blue = "#2f7893";
    expect(contrastRatio(CHALK, blue)).toBeLessThan(5);
    expect(inkHold(CHALK, blue, LADDER)).toBe(1);
  });

  it("holds DARK ink back less than light ink, because the maths is not symmetric", () => {
    // Wild Lime has 11.89:1 to spend at full strength, and still cannot afford
    // the ladder's first step: fading near-black ink toward a BRIGHT ground
    // closes the gap far faster than fading light ink toward a dark one. So a
    // filled band lands at 0.62 (4.59:1) where a quiet band lands at 0.54 —
    // the same rule, measured, giving two answers because the grounds differ
    // by an order of magnitude in luminance.
    expect(contrastRatio(INK, "#c3d363")).toBeGreaterThan(11);
    expect(inkHold(INK, "#c3d363", LADDER)).toBe(0.62);
    expect(inkHold(CHALK, blendOver("#daa51d", 0.2, INK), LADDER)).toBe(0.54);
  });

  it("never returns a step that fails the bar it was given", () => {
    for (const ground of ["#c3d363", "#2f7893", "#daa51d", "#ec935e", "#0c0d0c", "#212126"]) {
      const ink = inkOn(ground, [INK, CHALK]);
      const a = inkHold(ink, ground, LADDER);
      const got = contrastRatio(blendOver(ink, a, ground), ground);
      // Either it clears the bar, or it went to full strength because the
      // ground could not afford any step — and then it is the palette's
      // problem, not the call site's.
      expect(a === 1 || got >= WCAG.AA).toBe(true);
    }
  });
});

describe("inkOn", () => {
  it("picks the higher-contrast ink, not the first one", () => {
    // The two directions, so a reversed comparison cannot pass by luck: a LIGHT
    // fill takes the near-black ink, a DARK fill takes chalk.
    expect(inkOn(colors.lime, INKS)).toBe(DARK.onAccent);
    expect(inkOn(FEEDBACK.error.fill, INKS)).toBe(DARK.chalk);
    // Order of the candidates must not change the answer.
    expect(inkOn(colors.lime, [...INKS].reverse())).toBe(DARK.onAccent);
    expect(inkOn(FEEDBACK.error.fill, [...INKS].reverse())).toBe(DARK.chalk);
  });

  it("refuses an empty candidate set rather than returning undefined", () => {
    expect(() => inkOn(colors.lime, [])).toThrow();
  });

  it.each(Object.entries(FILLS))("%s: the chosen ink clears AA", (_name, fill) => {
    expect(contrastRatio(inkOn(fill, INKS), fill)).toBeGreaterThanOrEqual(WCAG.AA);
  });

  it.each(Object.entries(FILLS))("%s: the chosen ink is the BEST of the two", (_name, fill) => {
    const chosen = contrastRatio(inkOn(fill, INKS), fill);
    for (const ink of INKS) expect(chosen).toBeGreaterThanOrEqual(contrastRatio(ink, fill));
  });

  it("records what the hand-rolled destructive pills were actually doing", () => {
    // Not a regression guard — a receipt. If Muskmelon is ever retuned, this
    // number moves and the story in APill's ink note has to move with it.
    expect(contrastRatio("#ffffff", colors.red)).toBeLessThan(WCAG.AA_LARGE);
    expect(contrastRatio(DARK.onAccent, colors.red)).toBeGreaterThan(WCAG.AAA);
  });
});
