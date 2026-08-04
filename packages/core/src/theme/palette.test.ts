import { describe, it, expect } from "vitest";
import { contrastRatio, relativeLuminance, deltaE2000, WCAG, DISTINCT_ROLE_DE } from "../contrast";
import { ROLE_COLOR, type SemanticRole } from "../semantic";
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

    // The primary action: text/icon ON the accent fill must clear AA. This is the
    // pairing the old light theme broke (white on lime = 1.34:1); guarding it here
    // stops any future accent edit from regressing the button legibility.
    it(`${name}: onAccent on accent fill ≥ AA`, () => {
      expect(contrastRatio(t.onAccent, t.accent)).toBeGreaterThanOrEqual(WCAG.AA);
    });
  }
});

/**
 * TELLING TWO MEANINGS APART — the half contrast can't test.
 *
 * Every accent above clears AA against the card, and the readiness ledger still
 * shipped a light theme where the tissue row (#a3442f vermilion) and the
 * wearable row (#875427 brown) were ΔE 13 apart: two warm marks at 8px that an
 * athlete had to tell apart to read the ring beside them. Contrast measures a
 * colour against its GROUND; nothing measured the swatches against EACH OTHER.
 *
 * These are the roles that appear together at full strength in one legend. The
 * readiness ring's kept arc is deliberately NOT here: it wears its band's hue —
 * which does collide, in every band but the top — and is separated by weight
 * instead (KEPT_ARC_ALPHA), which is the whole design of that ring.
 */
describe("state colours are distinguishable from each other, not just from the ground", () => {
  const COST_ROLES: SemanticRole[] = ["danger", "info", "caution"];

  for (const name of Object.keys(THEMES) as ThemeName[]) {
    const t = THEMES[name];
    const paint = (r: SemanticRole) => {
      const accent = ROLE_COLOR[r];
      return accent === "ash" ? t.ash : t.accentText[accent];
    };

    for (let i = 0; i < COST_ROLES.length; i++) {
      for (let j = i + 1; j < COST_ROLES.length; j++) {
        const [a, b] = [COST_ROLES[i]!, COST_ROLES[j]!];
        it(`${name}: ${a} vs ${b} ≥ ΔE ${DISTINCT_ROLE_DE}`, () => {
          expect(deltaE2000(paint(a), paint(b))).toBeGreaterThanOrEqual(DISTINCT_ROLE_DE);
        });
      }
    }
  }
});

describe("deltaE2000", () => {
  it("is 0 for identical colours and order-independent", () => {
    expect(deltaE2000("#123456", "#123456")).toBeCloseTo(0, 6);
    expect(deltaE2000("#a3442f", "#4f5c3a")).toBeCloseTo(deltaE2000("#4f5c3a", "#a3442f"), 6);
  });

  it("puts black and white at the far end of the scale", () => {
    expect(deltaE2000("#000000", "#ffffff")).toBeGreaterThan(95);
  });

  it("scores a near-match far below a role-distinct pair", () => {
    // Two hexes one step apart are a match; the guarded floor is far above it.
    expect(deltaE2000("#a3442f", "#a4442f")).toBeLessThan(1);
    expect(DISTINCT_ROLE_DE).toBeGreaterThan(10);
  });

  it("rejects malformed hex the same way the contrast helpers do", () => {
    expect(() => deltaE2000("nope", "#fff")).toThrow();
  });
});
