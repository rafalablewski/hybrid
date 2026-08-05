import { describe, it, expect } from "vitest";
import { HPI_BAND_KEY, hpiBand, hpiBandKey, computeHpi, type HpiBand } from "./hpi";
import { computeFatigue } from "./fatigue";
import { baselineString, LANGS, type Lang } from "../i18n";
import type { TrainingLog } from "./types";

/**
 * THE BAND IS THE ONE WORD THAT SAYS WHAT THE SCORE MEANS.
 *
 * Both clients printed `hpi.band` — an engine identifier — straight onto the
 * card, uppercased by CSS, so "COMPROMISED" appeared in English inside an
 * otherwise translated line on every locale. These tests make that
 * unrepeatable: every band the engine can produce has a key, and every key has
 * a real string in all three shipped languages.
 */

const ALL_BANDS: HpiBand[] = ["peak", "primed", "moderate", "compromised", "depleted"];
const LANG_KEYS = Object.keys(LANGS) as Lang[];

describe("HPI band → i18n key", () => {
  it("covers every band the engine can return", () => {
    for (const band of ALL_BANDS) expect(HPI_BAND_KEY[band]).toBeTruthy();
    expect(Object.keys(HPI_BAND_KEY).sort()).toEqual([...ALL_BANDS].sort());
  });

  it("resolves to a real string in every shipped language", () => {
    for (const band of ALL_BANDS) {
      for (const lang of LANG_KEYS) {
        expect(baselineString(lang, HPI_BAND_KEY[band]), `${band} missing in ${lang}`).toBeTruthy();
      }
    }
  });

  it("actually translates — PL and DE never echo the English word", () => {
    // The English for `peak` is legitimately "Peak", so comparing against the
    // ENGINE IDENTIFIER would fail on a correct translation. What can't be
    // right is Polish or German handing back the English word: that is the
    // untranslated-band bug wearing a key.
    for (const band of ALL_BANDS) {
      const en = baselineString("en", HPI_BAND_KEY[band]);
      for (const lang of LANG_KEYS.filter((l) => l !== "en")) {
        expect(baselineString(lang, HPI_BAND_KEY[band]), `${band} untranslated in ${lang}`).not.toBe(en);
      }
    }
  });

  it("gives every band a distinct word, per language", () => {
    for (const lang of LANG_KEYS) {
      const words = ALL_BANDS.map((b) => baselineString(lang, HPI_BAND_KEY[b]));
      expect(new Set(words).size, `duplicate band word in ${lang}`).toBe(ALL_BANDS.length);
    }
  });

  it("hpiBandKey resolves a band that arrived as a plain string", () => {
    for (const band of ALL_BANDS) expect(hpiBandKey(band)).toBe(HPI_BAND_KEY[band]);
  });

  it("falls through to the raw value rather than resolving to nothing", () => {
    expect(hpiBandKey("something-the-engine-never-returns")).toBe("something-the-engine-never-returns");
  });

  it("keys whatever band a real computation lands on", () => {
    const log: TrainingLog = [
      { daysAgo: 0, items: [{ move: "Back Squat", topRpe: 9, hardSets: 8 }] },
      { daysAgo: 1, items: [{ move: "Deadlift", topRpe: 9, hardSets: 6 }] },
    ];
    const hpi = computeHpi(computeFatigue(log));
    expect(hpi.band).toBe(hpiBand(hpi.score));
    expect(baselineString("pl", hpiBandKey(hpi.band))).toBeTruthy();
  });
});
