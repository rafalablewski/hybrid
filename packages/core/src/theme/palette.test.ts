import { describe, it, expect } from "vitest";
import { contrastRatio, relativeLuminance, WCAG } from "../contrast";
import { THEMES, type ThemeName } from "./palette";

describe("contrastRatio", () => {
  it("is 21 for black on white and 1 for identical colours", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#123456", "#123456")).toBeCloseTo(1, 5);
  });
  it("is order-independent and supports shorthand hex", () => {
    expect(contrastRatio("#fff", "#000")).toBeCloseTo(contrastRatio("#000", "#fff"), 5);
  });
  it("rejects malformed hex", () => {
    expect(() => relativeLuminance("nope")).toThrow();
  });
});

// Guards the app's accessibility: every text/background pairing in BOTH themes
// must stay at WCAG AA. If a token edit drops a pair below 4.5:1, CI fails here.
describe("theme palettes meet WCAG AA", () => {
  const themes = Object.keys(THEMES) as ThemeName[];

  for (const name of themes) {
    const t = THEMES[name];
    const texts: [string, string][] = [
      ["chalk", t.chalk],
      ["ash", t.ash],
    ];
    const surfaces: [string, string][] = [
      ["card", t.card],
      ["ink", t.ink],
    ];

    for (const [tn, tc] of texts) {
      for (const [sn, sc] of surfaces) {
        it(`${name}: ${tn} on ${sn} ≥ AA`, () => {
          expect(contrastRatio(tc, sc)).toBeGreaterThanOrEqual(WCAG.AA);
        });
      }
    }

    for (const [an, ac] of Object.entries(t.accentText)) {
      it(`${name}: ${an} accent-text on card ≥ AA`, () => {
        expect(contrastRatio(ac, t.card)).toBeGreaterThanOrEqual(WCAG.AA);
      });
    }
  }
});
