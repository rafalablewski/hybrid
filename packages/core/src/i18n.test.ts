import { describe, it, expect } from "vitest";
import { makeT, makeTWithOverrides, allTranslationKeys, baselineString } from "./i18n";

describe("makeTWithOverrides", () => {
  it("is identical to makeT when no overrides are given", () => {
    const a = makeT("pl");
    const b = makeTWithOverrides("pl", undefined);
    for (const k of ["nav.today", "common.cancel", "does.not.exist"]) {
      expect(b(k)).toBe(a(k));
    }
  });

  it("lets an override win over the shipped string in the active language", () => {
    const t = makeTWithOverrides("en", { en: { "nav.today": "Home" } });
    expect(t("nav.today")).toBe("Home");
  });

  it("falls back through shipped active-lang → override en → shipped en → key", () => {
    // no pl override for this key, but a pl shipped value exists → shipped pl wins
    const t = makeTWithOverrides("pl", { en: { "common.cancel": "OVERRIDE-EN" } });
    expect(t("nav.today")).toBe(baselineString("pl", "nav.today"));
    // an unknown key with only an en override → en override
    const t2 = makeTWithOverrides("pl", { en: { "brand.new.key": "Hello" } });
    expect(t2("brand.new.key")).toBe("Hello");
    // an unknown key with nothing → the key itself
    expect(t2("totally.unknown")).toBe("totally.unknown");
  });

  it("exposes a stable, deduped, sorted key list including known keys", () => {
    const keys = allTranslationKeys();
    expect(keys).toContain("nav.today");
    expect(keys.length).toBe(new Set(keys).size);
    expect([...keys]).toEqual([...keys].sort());
  });
});
