import { describe, it, expect } from "vitest";
import { DEFAULT_LOGGER_PREFS, normalizeLoggerPrefs, rpeRirSwap } from "./logger-prefs";

describe("logger prefs", () => {
  it("returns defaults for empty/garbage input", () => {
    expect(normalizeLoggerPrefs(undefined)).toEqual(DEFAULT_LOGGER_PREFS);
    expect(normalizeLoggerPrefs(null)).toEqual(DEFAULT_LOGGER_PREFS);
    expect(normalizeLoggerPrefs("nope")).toEqual(DEFAULT_LOGGER_PREFS);
  });

  it("merges a partial object onto the defaults", () => {
    const p = normalizeLoggerPrefs({ detailed: false, countIn: false });
    expect(p.detailed).toBe(false);
    expect(p.countIn).toBe(false);
    expect(p.keepAwake).toBe(DEFAULT_LOGGER_PREFS.keepAwake); // untouched
  });

  it("ignores wrong types and falls back", () => {
    const p = normalizeLoggerPrefs({ haptics: "yes", restSeconds: "lots" });
    expect(p.haptics).toBe(DEFAULT_LOGGER_PREFS.haptics);
    expect(p.restSeconds).toBe(DEFAULT_LOGGER_PREFS.restSeconds);
  });

  it("clamps restSeconds to an allowed choice", () => {
    expect(normalizeLoggerPrefs({ restSeconds: 120 }).restSeconds).toBe(120);
    expect(normalizeLoggerPrefs({ restSeconds: 47 }).restSeconds).toBe(DEFAULT_LOGGER_PREFS.restSeconds);
  });

  it("defaults countWarmupsInVolume to off and accepts an override", () => {
    expect(normalizeLoggerPrefs(undefined).countWarmupsInVolume).toBe(false);
    expect(normalizeLoggerPrefs({ countWarmupsInVolume: true }).countWarmupsInVolume).toBe(true);
  });

  it("validates defaultStart and defaults the new flow toggles", () => {
    expect(normalizeLoggerPrefs(undefined).defaultStart).toBe("empty");
    expect(normalizeLoggerPrefs({ defaultStart: "ai" }).defaultStart).toBe("ai");
    expect(normalizeLoggerPrefs({ defaultStart: "bogus" }).defaultStart).toBe("empty");
    expect(normalizeLoggerPrefs(undefined).autoAdvance).toBe(false);
    expect(normalizeLoggerPrefs(undefined).rpeAsRir).toBe(false);
  });

  it("rpeRirSwap converts RPE↔RIR symmetrically and passes through blanks", () => {
    expect(rpeRirSwap("8", false)).toBe("8"); // off = unchanged
    expect(rpeRirSwap("8", true)).toBe("2"); // RIR = 10 - RPE
    expect(rpeRirSwap("2", true)).toBe("8"); // symmetric
    expect(rpeRirSwap("", true)).toBe("");
  });
});
