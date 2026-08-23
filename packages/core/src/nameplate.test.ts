import { describe, expect, it } from "vitest";
import {
  NAMEPLATE_LINE_DP,
  NAMEPLATE_LINE_EM,
  NAMEPLATE_MAX_LINES,
  NAMEPLATE_TRACK_EM,
  fitsNameplate,
  monoWidthDp,
  nameplateBaseFits,
  nameplateLines,
} from "./nameplate";
import { textWidthEm } from "./session-wrapped";
import { fs } from "./scale";

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

describe("the nameplate's base", () => {
  /** Every note the endurance grid can print, in all three languages. The
   *  count is two digits because eight weeks of daily training is two digits;
   *  one digit was the case that made the split row look survivable. */
  const NOTES = [
    "12 EFFORTS", "12 WYSIŁKI", "12 EINHEITEN",   // a timed sport's turn-up count
    "4:35 /100m", "2:20 /500m", "4:48 /km", "31 km/h",
  ];
  const FIGURES = ["14h 43min", "112h 30min", "4h 41min", "45min", "2h"];

  it("measures the MONO by length, which is the whole of Söhne Mono's metric", () => {
    // numHMetrics is 1 in SohneMono-Buch.otf: every glyph advances 0.600em.
    expect(monoWidthDp("12 EFFORTS", fs.nano)).toBeCloseTo(60, 5);
    expect(monoWidthDp("14h 43min", fs.bodyLg)).toBeCloseTo(86.4, 5);
  });

  it("REJECTS the proportional table for a mono string, which is the bug", () => {
    // `textWidthEm` carries Söhne's per-glyph SANS widths. Applied to the mono
    // note it under-read by 10% — and the whole margin was 2%.
    const proportional = textWidthEm("12 EFFORTS", 0) * fs.nano;
    const actual = monoWidthDp("12 EFFORTS", fs.nano);
    expect(proportional).toBeLessThan(actual);
    expect(actual - proportional).toBeGreaterThan(5); // 60.0 against 53.8dp
  });

  it("shows the SPLIT ROW could not hold them, which is why the base stacks", () => {
    // note + 8dp gap + figure on one 153dp line. This is the layout that
    // shipped, and it fails on the plate with the largest figure — the sport
    // an athlete looks at first.
    const gap = 8;
    const fig = monoWidthDp("14h 43min", fs.bodyLg);
    for (const note of ["12 EFFORTS", "12 WYSIŁKI", "12 EINHEITEN"]) {
      expect(monoWidthDp(note, fs.nano) + gap + fig, note).toBeGreaterThan(NAMEPLATE_LINE_DP);
    }
    // ...and the fact it REPLACED was over by a mile, which is the defect the
    // count was introduced to fix. Both were true at once.
    expect(monoWidthDp("LONGEST 1h 32min", fs.nano) + gap + fig).toBeGreaterThan(190);
  });

  it("fits every note against every figure once each has its own line", () => {
    for (const note of NOTES) {
      for (const figure of FIGURES) {
        expect(nameplateBaseFits(note, figure), `${note} / ${figure}`).toBe(true);
      }
    }
  });

  it("still says NO to a fact that overruns the line on its own", () => {
    expect(nameplateBaseFits("A".repeat(26), undefined)).toBe(false);   // 156dp
    expect(nameplateBaseFits("A".repeat(25), undefined)).toBe(true);    // 150dp
    expect(nameplateBaseFits(undefined, "1".repeat(16))).toBe(false);   // 153.6dp
  });

  it("treats an absent fact as fitting rather than as a failure", () => {
    expect(nameplateBaseFits(undefined, undefined)).toBe(true);
    expect(nameplateBaseFits(undefined, "14h 43min")).toBe(true);
  });

  it("takes a narrower line when the caller has less room", () => {
    expect(nameplateBaseFits("12 EINHEITEN", "14h 43min", { lineDp: 60 })).toBe(false);
  });
});
