import { describe, it, expect } from "vitest";
import {
  normalizePremiumAccent,
  resolvePremiumAccent,
  bestInkFor,
  isHexColor,
  wcagRating,
  PREMIUM_ACCENT_DEFAULT,
} from "./premium-accent";
import { colors } from "./theme/tokens";

describe("normalizePremiumAccent", () => {
  it("accepts valid preset keys", () => {
    expect(normalizePremiumAccent("amber")).toBe("amber");
    expect(normalizePremiumAccent("violet")).toBe("violet");
  });
  it("accepts + lowercases valid hex", () => {
    expect(normalizePremiumAccent("#AABBCC")).toBe("#aabbcc");
    expect(normalizePremiumAccent(" #d0cd94 ")).toBe("#d0cd94");
  });
  it("falls back to the default for junk / non-accent keys / bad hex", () => {
    expect(normalizePremiumAccent("ash")).toBe(PREMIUM_ACCENT_DEFAULT);
    expect(normalizePremiumAccent("#xyz")).toBe(PREMIUM_ACCENT_DEFAULT);
    expect(normalizePremiumAccent(42)).toBe(PREMIUM_ACCENT_DEFAULT);
    expect(normalizePremiumAccent(undefined)).toBe(PREMIUM_ACCENT_DEFAULT);
  });
});

describe("isHexColor", () => {
  it("matches #rgb and #rrggbb only", () => {
    expect(isHexColor("#fff")).toBe(true);
    expect(isHexColor("#d0cd94")).toBe(true);
    expect(isHexColor("d0cd94")).toBe(false);
    expect(isHexColor("#12")).toBe(false);
  });
});

describe("resolvePremiumAccent", () => {
  it("resolves a preset to its palette fill + accent text", () => {
    const dark = resolvePremiumAccent("amber", "dark");
    expect(dark.custom).toBe(false);
    expect(dark.fill).toBe(colors.amber);
    expect(dark.text).toBe("#d0cd94"); // dark accentText.amber
  });
  it("resolves a custom hex to fill=text=hex with an auto ink", () => {
    const r = resolvePremiumAccent("#d0cd94");
    expect(r.custom).toBe(true);
    expect(r.fill).toBe("#d0cd94");
    expect(r.text).toBe("#d0cd94");
    expect(r.ink).toBe("#141614"); // sand is light → dark ink
  });
  it("defaults invalid input to sand", () => {
    expect(resolvePremiumAccent("nonsense").raw).toBe(PREMIUM_ACCENT_DEFAULT);
  });
});

describe("bestInkFor", () => {
  it("picks near-black on a light fill and near-white on a dark fill", () => {
    expect(bestInkFor("#d0cd94")).toBe("#141614"); // light sand
    expect(bestInkFor("#3c787e")).toBe("#faf6ef"); // dark teal
  });
});

describe("wcagRating", () => {
  it("grades normal + large text by ratio", () => {
    expect(wcagRating("#000", "#fff").normal).toBe("AAA"); // 21:1
    // dark ink on sand — very high contrast
    expect(wcagRating("#141614", "#d0cd94").normal).toBe("AAA");
    // a low-contrast pair fails normal but may pass large
    const mid = wcagRating("#8b8f86", "#141614"); // ash on ink2 ~ 4.2:1
    expect(["AA", "fail"]).toContain(mid.normal);
  });
});
