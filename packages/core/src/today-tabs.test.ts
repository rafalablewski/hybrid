import { describe, expect, it } from "vitest";
import {
  PERFORMANCE_VIEWS,
  TODAY_TABS,
  normalizePerformanceView,
  normalizeTodayTab,
} from "./today-tabs";
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
    for (const tab of TODAY_TABS) expect(baselineString("en", tab.labelKey)).toBeTruthy();
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
