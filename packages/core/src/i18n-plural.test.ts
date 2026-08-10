import { describe, expect, it } from "vitest";
import { exerciseCountKey, makeT, pluralForm } from "./i18n";

describe("pluralForm", () => {
  it("English and German only ever answer one or many", () => {
    for (const lang of ["en", "de"] as const) {
      expect(pluralForm(1, lang)).toBe("one");
      expect(pluralForm(0, lang)).toBe("many");
      expect(pluralForm(2, lang)).toBe("many");
      expect(pluralForm(22, lang)).toBe("many");
    }
  });

  it("Polish takes the few form for 2–4", () => {
    expect(pluralForm(1, "pl")).toBe("one");
    expect(pluralForm(2, "pl")).toBe("few");
    expect(pluralForm(4, "pl")).toBe("few");
    expect(pluralForm(5, "pl")).toBe("many");
  });

  // The trap: the teens end in 2–4 but take the many form, and it comes back
  // round again at 22–24. "22 ćwiczeń" is wrong where "22 ćwiczenia" is right.
  it("Polish keeps the teens on many and returns to few at 22", () => {
    expect(pluralForm(12, "pl")).toBe("many");
    expect(pluralForm(13, "pl")).toBe("many");
    expect(pluralForm(14, "pl")).toBe("many");
    expect(pluralForm(22, "pl")).toBe("few");
    expect(pluralForm(24, "pl")).toBe("few");
    expect(pluralForm(25, "pl")).toBe("many");
    expect(pluralForm(112, "pl")).toBe("many");
    expect(pluralForm(122, "pl")).toBe("few");
  });
});

describe("exerciseCountKey", () => {
  // The bug this exists to kill: the logger said "1 exercises".
  it("never says one exercises", () => {
    expect(makeT("en")(exerciseCountKey(1, "en"))).toBe("exercise");
    expect(makeT("en")(exerciseCountKey(2, "en"))).toBe("exercises");
  });

  it("declines the Polish noun through all three forms", () => {
    const t = makeT("pl");
    expect(t(exerciseCountKey(1, "pl"))).toBe("ćwiczenie");
    expect(t(exerciseCountKey(3, "pl"))).toBe("ćwiczenia");
    expect(t(exerciseCountKey(7, "pl"))).toBe("ćwiczeń");
  });

  it("resolves in German", () => {
    const t = makeT("de");
    expect(t(exerciseCountKey(1, "de"))).toBe("Übung");
    expect(t(exerciseCountKey(6, "de"))).toBe("Übungen");
  });

  // Every key the helper can produce must exist in every shipped language, or
  // a count would render the raw key.
  it("every form resolves in every language", () => {
    for (const lang of ["en", "pl", "de"] as const) {
      const t = makeT(lang);
      for (const n of [1, 2, 5, 12, 22]) {
        const key = exerciseCountKey(n, lang);
        expect(t(key), `${lang} ${n} → ${key}`).not.toBe(key);
      }
    }
  });
});
