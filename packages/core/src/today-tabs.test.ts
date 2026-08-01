import { describe, expect, it } from "vitest";
import {
  PERFORMANCE_VIEWS,
  TODAY_TABS,
  normalizePerformanceView,
  normalizeTodayTab,
} from "./today-tabs";
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

describe("PERFORMANCE_VIEWS", () => {
  it("carries the three analytical screens the tab folds in", () => {
    expect(PERFORMANCE_VIEWS.map((x) => x.id)).toEqual(["performance", "volume", "trends"]);
  });

  it("falls back to the command centre", () => {
    expect(normalizePerformanceView("volume")).toBe("volume");
    expect(normalizePerformanceView("statistics")).toBe("performance");
    expect(normalizePerformanceView(null)).toBe("performance");
  });

  it("labels every view with a real translation key", () => {
    for (const v of PERFORMANCE_VIEWS) expect(baselineString("en", v.labelKey)).toBeTruthy();
  });
});
