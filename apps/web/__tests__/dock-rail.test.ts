import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * THE DOCK RAIL, ENFORCED.
 *
 * Two screens dock a strip of chips beneath the collapsed hero, and the strip
 * was authored FOUR times across the two clients — hand-rolled buttons, the
 * kit's in-content AChip, and two more hand-rolled copies. Twelve properties
 * were decided independently in each: the selected fill (a SOLID lime pill
 * with dark text against a 16% tint), the face (mono 12 against display bold
 * 13), the hit target (~29 / 44 / ~33 / ~33 against the 44 the kit itself
 * declares), the rest fill, the tracking, a 400 -> 700 weight swap that
 * reflowed the row mid-tap, both paddings, and the bar's own material.
 *
 * `DockRail` / `DockChip` is now the one way a screen may dock a rail, and this
 * is the test that keeps it that way. A reviewer cannot hold twelve values in
 * their head across the set, so four things are mechanical:
 *
 *   1. every rail in the set renders through the primitive;
 *   2. the retired vocabulary cannot come back — no solid accent fill, no
 *      weight swap on select;
 *   3. the client cannot restate a number core already owns;
 *   4. an `anchor` chip is never handed a `selected`, because a jump chip that
 *      lights up is claiming a selection it does not have.
 *
 * (This guard covered both clients until the web client was retired — web now
 * ships only the admin panel, so the mobile rails are the whole set.)
 */

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");

const mob = (f: string) => join(REPO_ROOT, "apps", "mobile", "components", "aurora", f);

/** The rails this spec covers. */
const RAILS = [
  ["mob  history", mob("history-views.tsx")],
  ["mob  plans", mob("plans.tsx")],
] as const;

/** Where the primitive itself lives — exempt from the "no raw numbers" scans. */
const PRIMITIVES = [["mob", mob("kit.tsx")]] as const;

/** The scaffolds that own a `rail` slot. */
const SCAFFOLDS = [
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
   * The solid accent pill. The old selected chip filled with the accent and
   * set its label to the on-accent colour: the loudest object on a screen
   * whose cards are each one quiet figure. The tint says "on" with the same
   * three signals at a fraction of the volume.
   */
  for (const [name, path] of PRIMITIVES) {
    it(`${name} chip tints rather than filling solid`, () => {
      const s = src(path);
      expect(s).toContain("DOCK_RAIL.tint");
      expect(s).not.toContain("on-accent");
    });
  }

  /**
   * The rail slots are full-bleed and UNPADDED — the rail owns its gutter.
   * So the rail COMPONENTS carry no geometry at all: each is a `<DockRail>`
   * and nothing else. (Note this checks the switcher/category functions only —
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

describe("the client never restates a number core owns", () => {
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
});

describe("the scaffolds' rail slots agree", () => {
  /**
   * One material for every slot. The whole divergence started because one
   * scaffold had no rail slot and a screen built its own bar beside the cover.
   */
  for (const [name, path] of SCAFFOLDS) {
    it(`${name} offers a rail slot`, () => {
      expect(src(path)).toMatch(/rail\?:\s*ReactNode/);
    });
  }
});
