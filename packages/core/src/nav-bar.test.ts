import { describe, it, expect } from "vitest";
import { AURORA_NAV_TABS, AURORA_NAV_ACTIONS, AURORA_NAV_GEOMETRY, auroraNavAction, NAV_SURFACE_FOOD_PICKER, formatSessionElapsed } from "./nav-bar";

describe("aurora nav bar contract", () => {
  it("carries the three places in the capsule", () => {
    expect(AURORA_NAV_TABS).toHaveLength(3);
    expect(AURORA_NAV_TABS.map((t) => t.id)).toEqual(["today", "nutrition", "profile"]);
  });

  it("spends no slot on a feature that does not exist yet", () => {
    // More was a springboard of ~40 launcher tiles — a directory of screens,
    // which nobody's daily loop includes opening. It moved to the side menu
    // behind the Today header's avatar (side-menu.ts). The slot then went to
    // MESSAGES, whose screen honestly announced that direct messages are not
    // built — which spent a quarter of the app's scarcest surface on a room
    // with nothing in it. A tab is earned by having something behind it.
    const ids = AURORA_NAV_TABS.map((t) => t.id) as string[];
    expect(ids).not.toContain("more");
    expect(ids).not.toContain("messages");
  });

  it("spends the second slot on a daily loop, not on discovery", () => {
    // Explore was a discovery surface whose blocks were all previews of screens
    // that still live in the side menu; eating happens several times a day. The bar's
    // scarcest slot goes to the recurring loop.
    const ids = AURORA_NAV_TABS.map((t) => t.id) as string[];
    expect(ids).not.toContain("explore");
    expect(ids[1]).toBe("nutrition");
  });

  it("keeps the capsule to places — the verb lives in the detached action", () => {
    // Train is the app's one VERB and rides beside the capsule as the detached
    // circle (AURORA_NAV_ACTIONS), never as a fifth tab. The circle wears the
    // kit's own glyphs — the dumbbell, never a magnifier — which is the
    // deliberate trade against the iOS 26 search-role reading of that slot.
    const ids = AURORA_NAV_TABS.map((t) => t.id) as string[];
    expect(ids).not.toContain("train");
    expect(AURORA_NAV_ACTIONS.train.glyph).toBe("train");
    expect(AURORA_NAV_ACTIONS.post.glyph).toBe("list-add");
  });

  it("resolves the action per surface: Train by default, the surface's own verb where it differs", () => {
    expect(auroraNavAction("feed")).toBe("post");
    expect(auroraNavAction(NAV_SURFACE_FOOD_PICKER)).toBe("search");
    for (const surface of ["today", "nutrition", "profile", "train", "log", "performance", null, undefined]) {
      expect(auroraNavAction(surface), String(surface)).toBe("train");
    }
  });

  it("separates a circle that GOES from a circle that ACTS", () => {
    // The native trigger is a route, so a screen action has to be built the
    // other way round (a `disabled` trigger whose tabPress the screen handles).
    // Declaring the kind here is what stops the bar guessing per call site.
    expect(AURORA_NAV_ACTIONS.train.kind).toBe("route");
    expect(AURORA_NAV_ACTIONS.post.kind).toBe("route");
    expect(AURORA_NAV_ACTIONS.search.kind).toBe("screen");
  });

  it("keeps the picker's magnifier out of the cross-app-search slot", () => {
    // The recorded trade is that the SLOT is never spent on a search we do not
    // have. The picker's circle is that screen's verb, so it is resolved from a
    // surface — it can never be the app-wide default.
    expect(auroraNavAction(null)).not.toBe("search");
    expect(AURORA_NAV_ACTIONS.search.glyph).toBe("search");
  });

  it("keeps every action's label short enough for the circle to say it", () => {
    // The label sits under a 56dp circle and iOS truncates the overflow, so a
    // label that does not fit is a label the bar cannot deliver. "Train" set
    // the budget; nothing may quietly exceed it by much.
    for (const a of Object.values(AURORA_NAV_ACTIONS)) {
      expect(a.label.length, a.id).toBeLessThanOrEqual(8);
    }
  });

  it("leaves a visible glass margin around the selection lens", () => {
    // Concentricity: the lens must be strictly shorter than the capsule's
    // inner height, otherwise the bar pinches the pill instead of holding it.
    const { slotH, padV, miniSlotH, actionGap } = AURORA_NAV_GEOMETRY;
    expect(padV).toBeGreaterThan(0);
    expect(miniSlotH).toBeLessThan(slotH);
    // The action circle is detached — a real gap, or the split reads as a dent.
    expect(actionGap).toBeGreaterThan(0);
  });

  it("formats elapsed session time", () => {
    const t0 = new Date("2026-07-31T10:00:00.000Z");
    const at = (s: number) => t0.getTime() + s * 1000;
    expect(formatSessionElapsed(t0, at(0))).toBe("0:00");
    expect(formatSessionElapsed(t0, at(9))).toBe("0:09");
    expect(formatSessionElapsed(t0, at(64))).toBe("1:04");
    expect(formatSessionElapsed(t0, at(1451))).toBe("24:11");
    expect(formatSessionElapsed(t0.toISOString(), at(3600 + 24 * 60 + 11))).toBe("1:24:11");
  });

  it("never runs backwards or throws on a bad timestamp", () => {
    const t0 = new Date("2026-07-31T10:00:00.000Z");
    expect(formatSessionElapsed(t0, t0.getTime() - 5000)).toBe("0:00");
    expect(formatSessionElapsed("not-a-date", t0.getTime())).toBe("0:00");
  });
});
