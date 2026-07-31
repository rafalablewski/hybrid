import { describe, it, expect } from "vitest";
import { AURORA_NAV_TABS, AURORA_NAV_GEOMETRY, formatSessionElapsed } from "./nav-bar";

describe("aurora nav bar contract", () => {
  it("carries five destinations, within Apple's iPhone ceiling", () => {
    expect(AURORA_NAV_TABS).toHaveLength(5);
    expect(AURORA_NAV_TABS.map((t) => t.id)).toEqual(["today", "explore", "train", "more", "profile"]);
  });

  it("keeps Train as a tab, not a detached action", () => {
    // The separated circle beside an iOS 26 tab bar is the SEARCH role; a
    // training CTA parked there reads as search. Train is a destination (the
    // launcher), so it belongs in the capsule with the other tabs.
    const train = AURORA_NAV_TABS.find((t) => t.id === "train");
    expect(train).toBeDefined();
    expect(train!.glyph).toBe("train");
  });

  it("leaves a visible glass margin around the selection lens", () => {
    // Concentricity: the lens must be strictly shorter than the capsule's
    // inner height, otherwise the bar pinches the pill instead of holding it.
    const { slotH, padV, miniSlotH } = AURORA_NAV_GEOMETRY;
    expect(padV).toBeGreaterThan(0);
    expect(miniSlotH).toBeLessThan(slotH);
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
