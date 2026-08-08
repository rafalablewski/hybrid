import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * THE DOCK RAIL, ENFORCED.
 *
 * Two screens dock a strip of chips beneath the collapsed hero, and the strip
 * was authored FOUR times — History web (a hand-rolled <button>), History mobile
 * (the kit's in-content AChip), Plans web and Plans mobile (both hand-rolled).
 * Twelve properties were decided independently in each: the selected fill (a
 * SOLID lime pill with dark text on web against mobile's 16% tint), the face
 * (mono 12 against Archivo bold 13), the hit target (~29 / 44 / ~33 / ~33
 * against the 44 the kit itself declares), the rest fill, the tracking, a
 * 400 -> 700 weight swap that reflowed the row mid-tap, both paddings, and the
 * bar's own material.
 *
 * The material row was the tell, and it was STRUCTURAL: mobile's cover scaffold
 * takes a `rail` slot and web's did not, so web Plans hand-rolled its own
 * `position: sticky` bar beside the hero — which is where ink 86% / blur 14 /
 * z 29 came from against the scaffold's ink 88% / blur 18 / z 20.
 *
 * `DockRail` / `DockChip` is now the one way a screen may dock a rail, and this
 * is the test that keeps it that way. A reviewer cannot hold twelve values in
 * their head across six files on two clients, so four things are mechanical:
 *
 *   1. every rail in the set renders through the primitive;
 *   2. the retired vocabulary cannot come back — no hand-rolled sticky bar
 *      beside a cover, no solid accent fill, no weight swap on select;
 *   3. neither client can restate a number core already owns;
 *   4. an `anchor` chip is never handed a `selected`, because a jump chip that
 *      lights up is claiming a selection it does not have.
 *
 * Web and mobile are checked TOGETHER, from the web suite, for the same reason
 * card-foot.test.ts is: the failure this guards against is precisely the two
 * clients drifting apart, and a per-client test would never catch it.
 */

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");

const web = (f: string) => join(APP_ROOT, "components", "aurora", f);
const mob = (f: string) => join(REPO_ROOT, "apps", "mobile", "components", "aurora", f);

/** The four rails this spec covers, on both clients. */
const RAILS = [
  ["web  history", web("history-views.tsx")],
  ["web  plans", web("plans.tsx")],
  ["mob  history", mob("history-views.tsx")],
  ["mob  plans", mob("plans.tsx")],
] as const;

/** Where the primitive itself lives — exempt from the "no raw numbers" scans. */
const PRIMITIVES = [
  ["web", web("dock-rail.tsx")],
  ["mob", mob("kit.tsx")],
] as const;

/** The scaffolds that own a `rail` slot. */
const SCAFFOLDS = [
  ["web  hero", web("hero.tsx")],
  ["web  cover", web("cover-hero.tsx")],
  ["mob  hero", mob("hero.tsx")],
  ["mob  cover", join(REPO_ROOT, "apps", "mobile", "components", "plan-hero.tsx")],
] as const;

const src = (p: string) => readFileSync(p, "utf8");

describe("every docked rail goes through the DockRail primitive", () => {
  for (const [name, path] of RAILS) {
    it(`${name} renders its rail with <DockRail`, () => {
      expect(src(path)).toContain("<DockRail");
    });

    it(`${name} renders its chips with <DockChip`, () => {
      expect(src(path)).toContain("<DockChip");
    });
  }

  /**
   * Every chip states its role explicitly. There is deliberately no default:
   * "does pressing this select something or move me somewhere" is the one
   * question the rail exists to answer, and a default would let a call site
   * answer it by omission.
   */
  for (const [name, path] of RAILS) {
    it(`${name} states a role on every chip`, () => {
      const chips = src(path).match(/<DockChip[\s\S]*?\/>/g) ?? [];
      expect(chips.length).toBeGreaterThan(0);
      for (const chip of chips) expect(chip).toMatch(/role="(mode|anchor)"/);
    });
  }

  /**
   * An anchor is never selected. `dockChipOn` already refuses to light one up,
   * so this cannot cause a visual regression — it catches the author who
   * believed it could, which is the reading error that produces a rail whose
   * chips look stateful and are not.
   */
  for (const [name, path] of RAILS) {
    it(`${name} never passes selected to an anchor`, () => {
      const anchors = (src(path).match(/<DockChip[\s\S]*?\/>/g) ?? []).filter((c) => c.includes('role="anchor"'));
      for (const chip of anchors) expect(chip).not.toContain("selected");
    });
  }
});

describe("the retired rail vocabulary cannot come back", () => {
  /**
   * The web Plans rail was a hand-rolled `position: sticky` bar sitting BESIDE
   * the cover, because the web cover scaffold had no rail slot. It has one now,
   * so a second sticky bar on a screen that already docks a rail is the old bug
   * growing back.
   */
  it("web plans docks its rail in the scaffold, not beside it", () => {
    const s = src(web("plans.tsx"));
    expect(s).toMatch(/rail=\{/);
    // The one remaining sticky in this file is PlanWeekRail, the waveform week
    // picker — deliberately out of scope (its bars encode weekly volume, which
    // is data, not chrome). Anything beyond that is a hand-rolled bar.
    expect((s.match(/position:\s*"sticky"/g) ?? []).length).toBeLessThanOrEqual(1);
  });

  /**
   * The solid accent pill. Web's selected chip filled with `--color-lime` and
   * set its label to `--on-accent`: the loudest object on a screen whose cards
   * are each one quiet figure. The tint says "on" with the same three signals
   * at a fraction of the volume.
   */
  for (const [name, path] of PRIMITIVES) {
    it(`${name} chip tints rather than filling solid`, () => {
      const s = src(path);
      expect(s).toContain("DOCK_RAIL.tint");
      expect(s).not.toContain("on-accent");
    });
  }

  /**
   * The weight swap. Selecting used to take web's chip from 400 to 700, which
   * widened it and reflowed every chip after it under the finger.
   */
  it("web chip holds one font weight across states", () => {
    const s = src(web("dock-rail.tsx"));
    expect(s).not.toMatch(/fontWeight:\s*on\s*\?/);
  });

  /**
   * The rail slots are full-bleed and UNPADDED — the rail owns its gutter. The
   * web hero slot used to pad its child and History then negative-margined
   * straight back out again: the same gutter applied twice in opposite
   * directions, which is how two rails ended up measuring differently.
   *
   * So the rail COMPONENTS carry no geometry at all: each is a `<DockRail>` and
   * nothing else. (Note this checks the switcher/category functions only —
   * Plans' GoalShelf and History's week strip are content rails and bleed on
   * their own account, correctly.)
   */
  for (const [name, path] of RAILS) {
    it(`${name} rail component sets no geometry of its own`, () => {
      const s = src(path);
      const start = Math.max(s.indexOf("export function ViewSwitcher"), s.indexOf("function CategoryRail"));
      expect(start, `${name} has no rail component`).toBeGreaterThan(-1);
      // Up to the next top-level close brace — the component body, nothing more.
      const body = s.slice(start, s.indexOf("\n}", start));
      for (const banned of ["margin", "padding", "gap:", "fontSize", "borderRadius", "backgroundColor", "background:"]) {
        expect(body, `${name} rail sets ${banned}`).not.toContain(banned);
      }
    });
  }
});

describe("neither client restates a number core owns", () => {
  for (const [name, path] of PRIMITIVES) {
    it(`${name} reads its geometry from DOCK_RAIL`, () => {
      const s = src(path);
      for (const token of ["DOCK_RAIL.gap", "DOCK_RAIL.padY", "DOCK_RAIL.chip.hit", "DOCK_RAIL.chip.padX", "DOCK_RAIL.chip.size", "DOCK_RAIL.chip.tracking", "DOCK_RAIL.chip.radius"]) {
        expect(s, `${name} is missing ${token}`).toContain(token);
      }
    });

    it(`${name} decides "is it on" in core, not locally`, () => {
      expect(src(path)).toContain("dockChipOn(");
    });
  }

  /**
   * The jump offset a category chip has to clear is the rail's own height, and
   * the rail's height is now fully determined by the contract. Web used to
   * carry a hand-typed 49px fallback beside a runtime measurement.
   */
  it("web plans derives the rail height rather than typing it", () => {
    const s = src(web("plans.tsx"));
    expect(s).toContain("DOCK_RAIL.chip.hit");
    expect(s).not.toMatch(/const RAIL_H = \d+;/);
  });
});

describe("the scaffolds' rail slots agree", () => {
  /**
   * Four slots, one material. The whole divergence started because one of the
   * four (web's cover) did not exist and Plans built its own.
   */
  for (const [name, path] of SCAFFOLDS) {
    it(`${name} offers a rail slot`, () => {
      expect(src(path)).toMatch(/rail\?:\s*ReactNode/);
    });
  }

  it("both web slots draw the same bar material", () => {
    const material = /color-mix\(in srgb, var\(--color-ink\) 88%, transparent\)/;
    const blur = /blur\(18px\)/;
    for (const f of ["hero.tsx", "cover-hero.tsx"] as const) {
      const s = src(web(f));
      expect(s, `${f} ink`).toMatch(material);
      expect(s, `${f} blur`).toMatch(blur);
    }
    // The 86% / blur 14 the hand-rolled Plans bar drew is gone for good.
    expect(src(web("plans.tsx"))).not.toContain("blur(14px)");
  });

  it("neither web slot pads the child that has to bleed past it", () => {
    for (const f of ["hero.tsx", "cover-hero.tsx"] as const) {
      const s = src(web(f));
      const open = s.indexOf("{rail && (");
      expect(open, `${f} has no rail slot`).toBeGreaterThan(-1);
      // The slot's own div, not the dock's underneath it.
      const slot = s.slice(open, s.indexOf(">{rail}</div>", open));
      expect(slot, `${f} rail slot`).toContain("margin: \"0 calc(-1 * var(--page-pad-x");
      expect(slot, `${f} rail slot`).not.toContain("padding");
    }
  });
});
