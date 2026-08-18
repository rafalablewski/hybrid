import { describe, it, expect } from "vitest";
import { contrastRatio, relativeLuminance, deltaE2000, labOf, WCAG, DISTINCT_ROLE_DE } from "../contrast";
import { ROLE_COLOR, type SemanticRole } from "../semantic";
import { THEMES, type ThemeName } from "./palette";
import { FEEDBACK, type FeedbackKind } from "./feedback";
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
      ["ink2", t.ink2],
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
      it(`${name}: ${an} accent-text on ink2 ≥ AA`, () => {
        expect(contrastRatio(ac, t.ink2)).toBeGreaterThanOrEqual(WCAG.AA);
      });
    }

    // The primary action: text/icon ON the accent fill must clear AA. This is the
    // pairing the old light theme broke (white on lime = 1.34:1); guarding it here
    // stops any future accent edit from regressing the button legibility.
    it(`${name}: onAccent on accent fill ≥ AA`, () => {
      expect(contrastRatio(t.onAccent, t.accent)).toBeGreaterThanOrEqual(WCAG.AA);
    });

    // ONACCENT ON EVERY FILL THAT CARRIES IT. audit/12 §5.5 asked for this and it
    // could not simply be switched on: `blue` is the darkest fill in the set and
    // near-black ink on it measures 3.92 — AA-large, not AA. The honest guard is
    // therefore two claims rather than one loosened one:
    //
    //   (a) every fill a caller MIGHT put ink on clears AA, and
    //   (b) `blue` is not one of them — asserted at the call sites, in the mobile
    //       design-token rule, rather than assumed here.
    //
    // Loosening (a) to AA-large for everything would have been the easy move and
    // it would have licensed a blue button with unreadable ink. Naming the one
    // exception is what makes the rest of the rule mean something.
    const INK_BEARING = ["lime", "amber", "red"] as const;
    for (const an of INK_BEARING) {
      it(`${name}: onAccent on the ${an} fill ≥ AA`, () => {
        expect(contrastRatio(t.onAccent, colors[an])).toBeGreaterThanOrEqual(WCAG.AA);
      });
    }

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

    // A HAIRLINE IS ONLY A HAIRLINE IF YOU CAN SEE IT — and until the PANTONE
    // Black Beauty move, NOTHING in this suite said so.
    //
    // `line` draws the border of every card, the divider in every list, the
    // unlit ticks of the readiness ring and the track under every meter. It is
    // the most-drawn colour in the app after the two surfaces, and it was the
    // only one whose entire job is a RELATIONSHIP to something else — which is
    // exactly the kind of value a per-token test cannot catch drifting.
    //
    // What happened: `ink2` moved from #141614 (L* 7.0) to Black Beauty (L*
    // 12.9), and the old #242724 hairline (L* 15.2) landed **1.06:1** against
    // the card it was supposed to outline. Every card border in the product
    // would have quietly dissolved, and every existing test would have passed —
    // the same failure mode as `card` sitting ΔE 0.3 from `ink2`, rebuilt at the
    // border instead of the fill.
    //
    // WHY 1.15 AND NOT 3:1. This is deliberately NOT the 1.4.11 mark threshold
    // the accent fills above are held to. A hairline is not a mark carrying
    // meaning; it is the quietest possible statement that two regions are
    // different, and at 3:1 it stops being a hairline and becomes a stroke — the
    // heavy chrome this design language spent years removing. 1.15 is set just
    // under the 1.21 the palette actually ships, so it fails a collision and
    // passes a deliberate softening.
    const HAIRLINE_MIN = 1.15;
    for (const [sn, sc] of surfaces) {
      it(`${name}: line is visible against ${sn} (≥ ${HAIRLINE_MIN}:1)`, () => {
        expect(contrastRatio(t.line, sc)).toBeGreaterThanOrEqual(HAIRLINE_MIN);
      });
    }

    // AND THE CARD HAS TO BE A SURFACE, not the ground under another name. This
    // is the `card` #151715 lesson (ΔE 0.3 from ink2, deleted) stated as a rule
    // instead of a comment: two SURFACES that measure the same are one surface
    // with two names, and the app pays for the second one in every hand-rolled
    // copy that picks the wrong one. #141614 was itself only ΔE 2.49 / 1.07:1
    // from `ink` — it passed nothing, because nothing asked.
    it(`${name}: the card is distinguishable from the page`, () => {
      expect(contrastRatio(t.ink2, t.ink)).toBeGreaterThanOrEqual(HAIRLINE_MIN);
    });

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

/**
 * THE FEEDBACK LAYER — green succeeded, yellow warned, red failed.
 *
 * These are held to the SAME two bars as the accents, for the same reasons: a
 * message has to be readable on the card, and two outcomes that mean different
 * things have to be tellable apart. What is extra here is the third bar — a
 * feedback colour also has to be distinguishable from the ACCENTS, because a
 * failure chip and a training figure share plenty of screens.
 *
 * `warning` IS Fleur De Lis and `info` IS the Lyons Blue text tone. That is
 * deliberate reuse rather than duplication, so those two pairs are skipped by
 * value rather than by name — if a future edit accidentally forks them into two
 * near-identical yellows, the pair stops being skipped and this fails.
 */
describe("feedback colours", () => {
  const t = THEMES.dark;
  const KINDS = Object.keys(FEEDBACK) as FeedbackKind[];

  // THREE VALUES PER KIND, and each is guarded against the surface it meets.
  // `text` is read on the card; `ink` is read on its OWN fill, which is why the
  // dark Lava Falls fill can carry chalk while the other three carry near-black.
  for (const k of KINDS) {
    it(`${k} text clears AA on the card`, () => {
      expect(contrastRatio(FEEDBACK[k].text, t.ink2)).toBeGreaterThanOrEqual(WCAG.AA);
    });
    it(`${k} text clears AA on ink`, () => {
      expect(contrastRatio(FEEDBACK[k].text, t.ink)).toBeGreaterThanOrEqual(WCAG.AA);
    });
    it(`${k} ink clears AA on its own fill`, () => {
      expect(contrastRatio(FEEDBACK[k].ink, FEEDBACK[k].fill)).toBeGreaterThanOrEqual(WCAG.AA);
    });
  }

  // A FILL MAY BE DARK — Lava Falls is, deliberately — so fills are NOT held to
  // the 3:1-on-ink rule the accents are. An accent is a mark drawn ON the page;
  // a feedback fill is a panel that REPLACES a piece of it, and a panel is found
  // by its edge and its label, not by glowing. What must hold is that the label
  // on it is readable, which is the `ink` rule above.

  for (let i = 0; i < KINDS.length; i++) {
    for (let j = i + 1; j < KINDS.length; j++) {
      const [a, b] = [KINDS[i]!, KINDS[j]!];
      it(`${a} vs ${b} text ≥ ΔE ${DISTINCT_ROLE_DE}`, () => {
        expect(deltaE2000(FEEDBACK[a].text, FEEDBACK[b].text)).toBeGreaterThanOrEqual(DISTINCT_ROLE_DE);
      });
    }
  }

  // …and against every accent they can share a screen with. The two that ARE an
  // accent are skipped by VALUE, so a fork into a lookalike would be caught.
  for (const k of KINDS) {
    for (const [an, ac] of Object.entries({ ...t.accentText, ash: t.ash })) {
      if (FEEDBACK[k].text === ac) continue;
      it(`${k} vs accent ${an} ≥ ΔE ${DISTINCT_ROLE_DE}`, () => {
        expect(deltaE2000(FEEDBACK[k].text, ac)).toBeGreaterThanOrEqual(DISTINCT_ROLE_DE);
      });
    }
  }

  // The whole point of the layer: these are the CONVENTIONAL hues, and "green"
  // is a claim about a hue angle, not a vibe. Wild Lime is 112° (yellow-green)
  // and Muskmelon is 56° (orange) — which is why neither could do this job.
  // Measured on the FILL, which is the specified Pantone value; the text tone is
  // derived from it and holds the same angle by construction.
  const hueOf = (hex: string) => {
    const [, a, b] = labOf(hex);
    const d = (Math.atan2(b, a) * 180) / Math.PI;
    return d < 0 ? d + 360 : d;
  };
  it("success is green, warning is yellow, error is red — by hue angle", () => {
    expect(hueOf(FEEDBACK.success.fill)).toBeGreaterThan(130);
    expect(hueOf(FEEDBACK.success.fill)).toBeLessThan(180);
    expect(hueOf(FEEDBACK.warning.fill)).toBeGreaterThan(75);
    expect(hueOf(FEEDBACK.warning.fill)).toBeLessThan(100);
    expect(hueOf(FEEDBACK.error.fill)).toBeGreaterThan(15);
    expect(hueOf(FEEDBACK.error.fill)).toBeLessThan(45);
  });

  // The lift must not drift off the colour it is a lift OF. `error` is the only
  // kind where fill and text differ, and the claim is that the text is a HUE,
  // raised — not a different red that happens to be legible.
  //
  // IT IS A TWO-PANTONE CHANNEL NOW. The text is derived from POINSETTIA
  // 17-1654 TCX (#cb3441), not from Lava Falls, because a chip that is the best
  // deep error SURFACE in the set is not obliged to also be the best signal red
  // as type — and asking it to be produced two rounds of re-derivation.
  //
  // SO THIS TEST SURVIVED THE SPLIT UNCHANGED, and that is the point worth
  // recording rather than the assertion itself: Poinsettia sits at Lab hue 26.1°
  // and Lava Falls at 28.9°, 2.7° apart, so the lifted text still holds the
  // FILL's hue inside the same 6° it always had to. The second Pantone did not
  // fork the family; it moved along it. A future error source that failed this
  // would be a genuinely different red and would need its own argument.
  it("the error text tone holds the error fill's hue angle", () => {
    expect(Math.abs(hueOf(FEEDBACK.error.text) - hueOf(FEEDBACK.error.fill))).toBeLessThan(6);
  });

  // AND IT HOLDS THE SOURCE IT WAS ACTUALLY DERIVED FROM, tightly. The lift is a
  // lightness move on Poinsettia and nothing else, so the hue should barely
  // register a change at all — 1° is a generous allowance for a value that
  // measures 0.02° off. Without this the test above would pass for any red in a
  // 6° window, including one nobody derived.
  it("the error text tone is Poinsettia, lifted — hue held to 1°", () => {
    const POINSETTIA = "#cb3441"; // PANTONE 17-1654 TCX
    expect(Math.abs(hueOf(FEEDBACK.error.text) - hueOf(POINSETTIA))).toBeLessThan(1);
  });
});

