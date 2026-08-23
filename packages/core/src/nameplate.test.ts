import { describe, expect, it } from "vitest";
import {
  NAMEPLATE_LINE_EM,
  NAMEPLATE_MAX_LINES,
  NAMEPLATE_TRACK_EM,
  fitsNameplate,
  nameplateLines,
} from "./nameplate";
import { textWidthEm } from "./session-wrapped";

/**
 * The nameplate's one load-bearing condition is that the noun is SHORT, so
 * these tests are mostly about the boundary: what still sets as a mark, what
 * has stopped being one, and — the part that matters — that a name which does
 * not fit says so instead of being quietly cut.
 */
describe("nameplateLines", () => {
  it("sets a single short word as one line, which is the treatment's own case", () => {
    for (const word of ["Running", "Cycling", "Rowing", "Tennis", "Carbs", "Fat"]) {
      const n = nameplateLines(word);
      expect(n.lines, word).toEqual([word]);
      expect(n.compact, word).toBe(true);
      expect(n.overflows, word).toBe(false);
    }
  });

  it("breaks a two-word name onto two lines and stops calling it compact", () => {
    const n = nameplateLines("Romanian Deadlift");
    expect(n.lines).toEqual(["Romanian", "Deadlift"]);
    expect(n.compact).toBe(false);
    expect(n.overflows).toBe(false);
  });

  it("packs words that share a line rather than spending a line per word", () => {
    // "Back Squat" is 10 characters — inside the line, so it stays one mark.
    const n = nameplateLines("Back Squat");
    expect(n.lines).toEqual(["Back Squat"]);
    expect(n.compact).toBe(true);
  });

  it("never breaks inside a word, and SAYS SO when the word alone overruns", () => {
    // "Kettlebell" measures 5.59em against a 5.4em line. The rule does not
    // hyphenate it, does not cut it, and does not pretend it fits: it hands the
    // whole word back with `overflows`, and the surface decides.
    const n = nameplateLines("Kettlebell");
    expect(n.lines).toEqual(["Kettlebell"]);
    expect(n.overflows).toBe(true);
    expect(textWidthEm("KETTLEBELL", NAMEPLATE_TRACK_EM)).toBeGreaterThan(NAMEPLATE_LINE_EM);
  });

  it("MEASURES rather than counts, which is what a character budget got wrong", () => {
    // The first cut of this rule budgeted ELEVEN CHARACTERS. Polish
    // "Wioślarstwo" is exactly eleven, so it reported FITS — while the word
    // measures 6.15em against a 5.4em line and would have been clipped on the
    // phone. A count cannot know that W and I are different widths.
    const pl = nameplateLines("Wioślarstwo");
    expect(pl.lines).toEqual(["Wioślarstwo"]);   // never cut
    expect(pl.overflows).toBe(true);              // ...and never called a fit
    expect("Wioślarstwo".length).toBe(11);        // the count that fooled it
  });

  it("reports overflow instead of truncating a name the plate cannot hold", () => {
    const n = nameplateLines("Single Arm Dumbbell Preacher Curl");
    expect(n.overflows).toBe(true);
    expect(n.lines.length).toBeLessThanOrEqual(NAMEPLATE_MAX_LINES);
    // THE NAME SURVIVES. Every word is still there — the plate is told it does
    // not fit, and no word is dropped on the way to telling it.
    expect(n.lines.join(" ")).toBe("Single Arm Dumbbell Preacher Curl");
  });

  it("keeps the whole name when a word on its own is longer than a line", () => {
    const n = nameplateLines("Supercalifragilistic Press");
    expect(n.lines.join(" ")).toBe("Supercalifragilistic Press");
    expect(n.overflows).toBe(true);
  });

  it("survives the empty and whitespace cases without inventing a line", () => {
    expect(nameplateLines("")).toEqual({ lines: [], compact: false, overflows: false });
    expect(nameplateLines("   ")).toEqual({ lines: [], compact: false, overflows: false });
  });

  it("collapses runs of whitespace rather than setting an empty line", () => {
    expect(nameplateLines("Back    Squat").lines).toEqual(["Back Squat"]);
  });
});

describe("fitsNameplate", () => {
  it("passes the endurance disciplines in English", () => {
    expect(
      fitsNameplate(["Running", "Cycling", "Swimming", "Rowing", "Walking", "Tennis"]),
    ).toBe(true);
  });

  it("REPORTS that Polish does not fit the two-up plate at full size", () => {
    // The finding the measurement bought, and it is a real one: "Wioślarstwo"
    // and "Narciarstwo" overrun a 5.4em line, so the Polish set is not a
    // full-size fit. The plate does not clip them — the component sets
    // `adjustsFontSizeToFit` with a floor, which is the paint-time guarantee —
    // but the RULE must not call this a fit, because the next surface asking
    // the question may have no such fallback.
    expect(fitsNameplate(["Bieganie", "Kolarstwo", "Pływanie", "Wioślarstwo", "Narciarstwo", "Chód"])).toBe(false);
    // German and English both clear it outright.
    expect(fitsNameplate(["Laufen", "Radfahren", "Schwimmen", "Rudern", "Ski", "Gehen"])).toBe(true);
  });

  it("fails the movement catalogue, which is why Today keeps the other shape", () => {
    expect(
      fitsNameplate([
        "Romanian Deadlift",
        "Standing Overhead Press",
        "Dumbbell Lateral Raise",
        "Barbell Bench Press",
      ]),
    ).toBe(false);
  });

  it("fails a set with one outlier — a rail is only as good as its worst name", () => {
    expect(fitsNameplate(["Running", "Cycling", "Single Arm Dumbbell Preacher Curl"])).toBe(false);
  });

  it("fails an empty set rather than reporting a vacuous pass", () => {
    expect(fitsNameplate([])).toBe(false);
  });

  it("takes a narrower line when the caller has less room", () => {
    expect(fitsNameplate(["Swimming"], { budgetEm: 3 })).toBe(false);
    expect(fitsNameplate(["Swimming"])).toBe(true);
  });
});
