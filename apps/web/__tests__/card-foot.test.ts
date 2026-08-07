import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * THE CARD FOOTER, ENFORCED.
 *
 * Three cards used to end three different ways, and sixteen properties were
 * being decided independently in each — face, size, weight, case, tracking,
 * colour, glyph, glyph motion, gap, offsets, the open-state label, panel
 * motion, the tap target, the haptic and, worst, what a press even DOES.
 * Tissue unfolded, Volume unfolded, and Your Level pushed an entire screen.
 * The accent was the loudest of them: lime meant "leaves the card" on one card
 * and "unfolds in place" on the next, so it told a reader nothing at all.
 *
 * `CardFoot` is now the one way a card may end, and this is the test that keeps
 * it that way. A reviewer cannot hold sixteen values in their head across six
 * files on two clients, so three things are mechanical instead:
 *
 *   1. every card in the set renders its footer through the primitive;
 *   2. no footer takes the accent, on either client — with one link kind and
 *      nothing that navigates, there is nothing left for lime to mean;
 *   3. the retired vocabulary cannot come back: no open-state label swap, no
 *      text-triangle glyph, and no navigation prop on the Level card.
 *
 * Web and mobile are checked TOGETHER, from the web suite, because the failure
 * this guards against is precisely the two clients drifting apart: the same
 * Tissue rail drew an 8px text triangle that swapped ▼/▲ on web and a 12dp
 * vector chevron that rotated on mobile — two different affordances for one
 * control, which is what a per-client test would never catch.
 */

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");

const web = (f: string) => join(APP_ROOT, "components", "aurora", f);
const mob = (f: string) => join(REPO_ROOT, "apps", "mobile", "components", "aurora", f);

/** The cards whose footers this spec covers, on both clients. */
const CARDS = [
  ["web  tissue-card", web("tissue-card.tsx")],
  ["web  level-card", web("level-card.tsx")],
  ["web  volume", web("volume.tsx")],
  ["mob  tissue-card", mob("tissue-card.tsx")],
  ["mob  level-card", mob("level-card.tsx")],
  ["mob  volume", mob("volume.tsx")],
] as const;

const src = (p: string) => readFileSync(p, "utf8");

describe("card footers go through the CardFoot primitive", () => {
  for (const [name, path] of CARDS) {
    it(`${name} renders its footer with <CardFoot`, () => {
      expect(src(path)).toContain("<CardFoot");
    });
  }

  /**
   * A hand-rolled rule at the bottom of a card is how all six of these started.
   * The cards still draw plenty of legitimate internal dividers, so this looks
   * only for the exact geometry the old footers shared — a top rule opened with
   * `marginTop: 16` and closed with `paddingTop: 13`/`14`, in either order.
   * Tissue's protocol row is the one allowed match: it is a status row in the
   * card BODY, and it points at Today because a daily protocol cannot unfold
   * into an analytics card.
   */
  const RULE_FIRST = /marginTop:\s*16,\s*paddingTop:\s*1[34],\s*border(Top|TopWidth)/g;
  const PAD_LAST = /marginTop:\s*16,\s*border(Top|TopWidth)[^}]*paddingTop:\s*1[34]/g;

  for (const [name, path] of CARDS) {
    it(`${name} hand-rolls no footer rule beyond the protocol row`, () => {
      const s = src(path);
      const hits = [...s.matchAll(RULE_FIRST), ...s.matchAll(PAD_LAST)];
      // Only the two Tissue cards may match, and only once each.
      const allowed = name.endsWith("tissue-card") ? 1 : 0;
      expect(hits.length, `${name}: ${hits.map((h) => h[0]).join(" | ")}`).toBeLessThanOrEqual(allowed);
    });
  }
});

describe("nothing in a footer takes the accent", () => {
  /**
   * Read from the primitives themselves rather than the callers: a caller
   * CANNOT pass a colour any more, so the only place an accent could re-enter
   * a footer is inside `CardFoot`/`ActionPill`. Both are ash and chalk only.
   */
  /** An accent APPLIED, in either client's idiom — not the word in a comment,
   *  since both primitives explain at length why the accent left. */
  const ACCENT_APPLIED = [
    /C\("(lime|blue|violet|amber|red)"\)/,          // web  — var(--color-x)
    /var\(--(lime|blue|violet|amber|red)-text\)/,   // web  — the text channel
    /accentText\(/,                                 // web  — the mapper
    /\bC\.(lime|blue|violet|amber|red)\b/,          // mob  — palette member
    /\btxt\(/,                                      // mob  — the mapper
  ];

  it("web CardFoot applies no accent", () => {
    const s = src(web("card-foot.tsx"));
    for (const re of ACCENT_APPLIED) expect(s, String(re)).not.toMatch(re);
  });

  it("mobile CardFoot applies no accent", () => {
    const kit = src(mob("kit.tsx"));
    const start = kit.indexOf("function FootChevron(");
    expect(start, "CardFoot not found in the mobile kit").toBeGreaterThan(-1);
    // From the chevron to the end of the file: CardFoot and ActionPill.
    for (const re of ACCENT_APPLIED) expect(kit.slice(start), String(re)).not.toMatch(re);
  });

  it("the primitive exposes no colour, glyph or kind knob", () => {
    const kit = src(mob("kit.tsx"));
    for (const s of [src(web("card-foot.tsx")), kit.slice(kit.indexOf("function FootChevron("))]) {
      expect(s).not.toMatch(/\bkind\s*[?:]/);
      expect(s).not.toMatch(/\bcolor\s*\?\s*:/);
      expect(s).not.toMatch(/\bglyph\s*[?:]/);
    }
  });
});

describe("the retired vocabulary stays retired", () => {
  it("no card labels its own open state — the chevron reports it", () => {
    // "Hide tissues" / "Hide" flipped the label on open, so the control read as
    // a different object in each state. The rotation is the only state now.
    for (const [name, path] of CARDS) {
      expect(src(path), name).not.toContain("hideTissues");
      expect(src(path), name).not.toContain("hideDetail");
    }
  });

  it("the Level card no longer navigates out of itself", () => {
    for (const p of [web("level-card.tsx"), mob("level-card.tsx")]) {
      expect(src(p)).not.toContain("onOpenWorking");
    }
    // …and no screen still tries to hand it one.
    expect(src(web("performance.tsx"))).not.toContain("onOpenWorking");
    expect(src(mob("performance.tsx"))).not.toContain("onOpenWorking");
  });

  it("no footer draws a text triangle", () => {
    for (const [name, path] of CARDS) {
      const s = src(path);
      expect(s, name).not.toContain("▼");
      expect(s, name).not.toContain("▲");
    }
  });

  it("`All tissues` is gone — the panel is a breakdown, not an inventory", () => {
    const i18n = src(join(REPO_ROOT, "packages", "core", "src", "i18n-web", "home.ts"));
    expect(i18n).not.toContain("w.injury.allTissues");
    expect(i18n).toContain("w.injury.byTissue");
    // The calibration prints instead of hiding behind a disclosure.
    expect(i18n).not.toContain("w.injury.howCalculated");
    expect(i18n).toContain("w.injury.riskModel");
  });
});

describe("the injury sheet stays reachable", () => {
  /**
   * Filing an injury moved out of the rail and into the panel. The panel is
   * only rendered when there is training to break down — so without a second
   * entry point an athlete who is hurt BEFORE they have logged anything (a case
   * the card's own source calls out) would have no way in at all.
   */
  for (const [name, path] of [["web", web("tissue-card.tsx")], ["mob", mob("tissue-card.tsx")]] as const) {
    it(`${name} tissue-card offers the body and the pill with no data`, () => {
      const s = src(path);
      // Two RiskBody figures: one in the empty state, one in the panel.
      expect(s.match(/<RiskBody/g)?.length, "RiskBody should render in BOTH the empty state and the panel").toBe(2);
      // Two pills, for the same reason.
      expect(s.match(/<ActionPill/g)?.length, "ActionPill should render in BOTH the empty state and the panel").toBe(2);
    });
  }
});
