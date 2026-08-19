import { describe, expect, it } from "vitest";
import { contrastRatio, inkOn, WCAG } from "./contrast";
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
