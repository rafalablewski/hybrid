import { describe, it, expect } from "vitest";
import { contrastRatio, relativeLuminance, deltaE2000, WCAG, DISTINCT_ROLE_DE } from "../contrast";
import { ROLE_COLOR, type SemanticRole } from "../semantic";
import { THEMES, type ThemeName } from "./palette";
import { colors } from "./tokens";

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

    // EVERY FILL HAS TO BE VISIBLE AS A MARK. An accent is not only type: it is a
    // bar, a chart stroke, a dot, a ring segment, a border — and WCAG 1.4.11 puts
    // those at 3:1 against their ground, a bar the AA text rule never checks.
    //
    // This is the guard that decides how far Lyons Blue gets lifted. The Pantone
    // value #015871 measures 2.44 against `ink`: correct on the white chip it was
    // specified on, invisible as a 2px stroke here. `colors.blue` therefore holds
    // the lifted rendering, and this test is why it cannot drift back down.
    for (const [an, ac] of Object.entries(colors)) {
      if (!["lime", "blue", "amber", "red"].includes(an)) continue;
      it(`${name}: ${an} fill ≥ 3:1 on ink (usable as a mark)`, () => {
        expect(contrastRatio(ac, t.ink)).toBeGreaterThanOrEqual(WCAG.AA_LARGE);
      });
    }

    // THE PALETTE IS FOUR ACCENTS. Not five, and not four-plus-a-gold. Both extra
    // keys existed and both were near-duplicates of a colour already in the set
    // (steel blue ΔE 14.0 from lifted Lyons Blue; rating gold ΔE 8.6 from Fleur
    // De Lis). A fifth has to clear the loop above, which is the real bar.
    it(`${name}: no fifth accent creeps back in`, () => {
      expect(Object.keys(colors).filter((k) => /violet|gold/i.test(k))).toEqual([]);
      expect(Object.keys(t.accentText).sort()).toEqual(["amber", "blue", "lime", "red"]);
    });

    // THE PALETTE CARRIES NO COMPOSITED WASHES. `maroon` / `maroonLit` were
    // here for the activity card's fallen column and left with it — three
    // guards went with them. A background is a named SURFACE or a withAlpha()
    // tint of a foreground colour; a hand-composited third kind has to be
    // re-derived the moment the surface under it changes, which is the drift
    // this asserts against.
    it(`${name}: no composited wash tokens creep back into the palette`, () => {
      expect(Object.keys(colors).filter((k) => /wash|maroon/i.test(k))).toEqual([]);
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
 * The readiness ring's kept arc is deliberately NOT covered: it wears its band's
 * hue — which does collide, in every band but the top — and is separated by
 * weight instead (KEPT_ARC_ALPHA), which is the whole design of that ring.
 *
 * EVERY PAIR, NOT A CHOSEN THREE. This used to test `danger` / `info` /
 * `caution` only, and the gap was not academic: the pair it did not cover was
 * `go` vs `caution`, which is the readiness band step, the middle two rungs of
 * the load ramp, the conditioning wave, the calorie ring's under/over and every
 * trend arrow — the most frequent adjacency in the product. Under the old
 * chartreuse-and-sand it measured ΔE 17.4, below this file's own floor, and
 * nothing failed. The Pantone four clear 18 on all ten pairs, so the guard can
 * finally be what it always claimed to be.
 */
describe("state colours are distinguishable from each other, not just from the ground", () => {
  const ROLES: SemanticRole[] = ["go", "info", "caution", "danger", "neutral"];

  for (const name of Object.keys(THEMES) as ThemeName[]) {
    const t = THEMES[name];
    const paint = (r: SemanticRole) => {
      const accent = ROLE_COLOR[r];
      return accent === "ash" ? t.ash : t.accentText[accent];
    };

    for (let i = 0; i < ROLES.length; i++) {
      for (let j = i + 1; j < ROLES.length; j++) {
        const [a, b] = [ROLES[i]!, ROLES[j]!];
        // `premium` and `caution` deliberately share `amber`, so a role-pair
        // loop must run over DISTINCT paints, not over every role name.
        if (ROLE_COLOR[a] === ROLE_COLOR[b]) continue;
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
