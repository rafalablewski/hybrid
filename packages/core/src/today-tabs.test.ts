import { describe, expect, it } from "vitest";
import { TODAY_TABS, normalizeTodayTab } from "./today-tabs";
import { HUB_GLYPHS } from "./theme/icons";
import { baselineString } from "./i18n";

describe("TODAY_TABS", () => {
  it("is dashboard, performance, feed — in that order", () => {
    expect(TODAY_TABS.map((x) => x.id)).toEqual(["dashboard", "performance", "feed"]);
  });

  it("opens on the daily loop for anything unrecognised", () => {
    expect(normalizeTodayTab("performance")).toBe("performance");
    expect(normalizeTodayTab("feed")).toBe("feed");
    expect(normalizeTodayTab("cockpit")).toBe("dashboard");
    expect(normalizeTodayTab(null)).toBe("dashboard");
    expect(normalizeTodayTab(undefined)).toBe("dashboard");
  });

  it("labels every tab with a real translation key", () => {
    // The pills render the glyph, so the label IS the accessible name — an
    // unresolved key here would leave a tab with no name at all, not just an
    // untranslated one.
    for (const tab of TODAY_TABS) expect(baselineString("en", tab.labelKey)).toBeTruthy();
  });

  it("gives every tab a drawable glyph", () => {
    for (const tab of TODAY_TABS) {
      const paths = HUB_GLYPHS[tab.glyph];
      expect(paths, `${tab.id} has no glyph paths`).toBeTruthy();
      expect(paths.length).toBeGreaterThan(0);
      for (const d of paths) expect(d).toMatch(/^M/);
    }
  });

  it("uses a distinct glyph per tab", () => {
    expect(new Set(TODAY_TABS.map((x) => x.glyph)).size).toBe(TODAY_TABS.length);
  });
});
