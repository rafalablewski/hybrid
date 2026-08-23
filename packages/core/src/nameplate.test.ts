import { describe, expect, it } from "vitest";
import {
  NAMEPLATE_LINE_DP,
  NAMEPLATE_RUNGS,
  nameplateRung,
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

  it("packs words that share a line, and only when they actually share one", () => {
    // "Deadlift" packs nothing after it, but "Romanian Deadlift" proves the
    // greedy fill runs. The case that USED to live here is now the case below:
    // "Back Squat" was asserted to stay on one line because ten characters at
    // 0.6em is 6.0 and the budget is 5.4 — no, wait, it was asserted because
    // the ten characters were CAPITALS and none of them were in the advance
    // table, so all ten measured 0.6. They do not. See the next test.
    const n = nameplateLines("Standing Press");
    expect(n.lines).toEqual(["Standing", "Press"]);
  });

  it("BACK SQUAT does not fit a line, and the old table said it did", () => {
    // Set in caps at Halbfett: B .644 A .721 C .671 K .671 ␣ .202 S .596
    // Q .733 U .696 A .721 T .628 = 6.283em, less 10 × .0406 of tracking =
    // 5.88 against a 5.4em line. Under the fallback constant every one of
    // those glyphs measured 0.600 and the sum came to 5.60 — inside the line
    // by a whisker, which is how a name that wraps on the phone was pinned as
    // a one-liner in a test.
    const n = nameplateLines("Back Squat");
    expect(n.lines).toEqual(["Back", "Squat"]);
    expect(n.compact).toBe(false);
    expect(textWidthEm("BACK SQUAT", NAMEPLATE_TRACK_EM)).toBeGreaterThan(NAMEPLATE_LINE_EM);
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
    // Two lines because BACK SQUAT overruns one (above), not three because the
    // gap between them was read as a word.
    expect(nameplateLines("Back    Squat").lines).toEqual(["Back", "Squat"]);
  });
});

describe("fitsNameplate", () => {
  it("passes the endurance disciplines in English", () => {
    expect(
      fitsNameplate(["Running", "Cycling", "Swimming", "Rowing", "Walking", "Tennis"]),
    ).toBe(true);
  });

  it("REPORTS that NEITHER Polish NOR German fits the two-up plate at full size", () => {
    // Polish was already known: "Wioślarstwo" and "Narciarstwo" overrun a 5.4em
    // line. GERMAN WAS NOT, and the reason it was not is the whole lesson —
    // the advance table carried no capitals, so `fitsNameplate` measured every
    // one of them at the 0.6em fallback and reported "Radfahren 5.03em, clears
    // it outright". Set in the real face those nine capitals are 6.11em, and
    // "Schwimmen" is 6.27. Both overrun.
    expect(fitsNameplate(["Bieganie", "Kolarstwo", "Pływanie", "Wioślarstwo", "Narciarstwo", "Chód"])).toBe(false);
    expect(fitsNameplate(["Laufen", "Radfahren", "Schwimmen", "Rudern", "Ski", "Gehen"])).toBe(false);
    // ENGLISH GENUINELY CLEARS IT, and now that is a measurement rather than a
    // coincidence of the constant: "Swimming" is the worst at 4.94em.
    expect(fitsNameplate(["Running", "Cycling", "Swimming", "Rowing", "Walking", "Tennis"])).toBe(true);
    expect(textWidthEm("SWIMMING", NAMEPLATE_TRACK_EM)).toBeLessThan(NAMEPLATE_LINE_EM);
    // None of the three CLIPS on the phone — aurora/nameplate.tsx sets
    // `adjustsFontSizeToFit` with a 0.8 floor, and the worst of these needs
    // 0.91 — but the rule must not call an overrun a fit, because the next
    // surface to ask may have no such fallback.
    expect(NAMEPLATE_LINE_EM / textWidthEm("SCHWIMMEN", NAMEPLATE_TRACK_EM)).toBeGreaterThan(0.8);
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
    // 60.0dp against 55.6. It read 53.8 when the capitals were still missing
    // from the advance table — a wrong number that happened to point the same
    // way. The gap narrowed when that was fixed and the conclusion did not:
    // the proportional ruler still says this note fits a line it overruns.
    expect(actual - proportional).toBeGreaterThan(4);
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

describe("nameplateRung — the rule that stopped Today having two hierarchies", () => {
  const DISCIPLINES = {
    en: ["Running", "Cycling", "Swimming", "Rowing", "Walking", "Tennis"],
    de: ["Laufen", "Radfahren", "Schwimmen", "Rudern", "Ski", "Gehen"],
    pl: ["Bieganie", "Kolarstwo", "Pływanie", "Wioślarstwo", "Narciarstwo", "Chód"],
  };
  const MOVEMENTS = [
    "Romanian Deadlift", "Standing Overhead Press", "Dumbbell Lateral Raise",
    "Barbell Bench Press", "Pull-Up", "Back Squat", "Bulgarian Split Squat",
    "Incline Dumbbell Press",
  ];

  it("gives the disciplines the WORDMARK, which is the treatment's own case", () => {
    const r = nameplateRung(DISCIPLINES.en);
    expect(r.size).toBe(fs.display);
    expect(r.caps).toBe(true);
    expect(r.lines).toBe(1);
  });

  it("gives the movement catalogue a SMALLER rung and sentence case", () => {
    // The defect this exists to kill: Exercises had the name at fs.body under a
    // figure at fs.display while Endurance, 200dp away, had the name at
    // fs.display over a figure at fs.bodyLg — an exact mirror, and neither was
    // derived from anything. Now both are: the name takes the largest rung its
    // own set can hold, and the figure is always fs.bodyLg on the bottom edge.
    const r = nameplateRung(MOVEMENTS);
    expect(r.size).toBe(fs.title);
    expect(r.caps).toBe(false);
    expect(r.lines).toBe(2);
    // ...and it is genuinely SMALLER than the disciplines get, which is the
    // point: the ratio differs because the NAMES differ.
    expect(r.size).toBeLessThan(nameplateRung(DISCIPLINES.en).size);
  });

  it("KEEPS THE WORDMARK IN EVERY LANGUAGE, by moving the size instead", () => {
    // The alternative shipped for one merge: fs.display with
    // `adjustsFontSizeToFit`, which renders a German plate at 91% of 28 — an
    // off-ladder size, and a grid where SCHWIMMEN is optically smaller than
    // TENNIS beside it. Stepping the whole set down a rung keeps every plate
    // on one screen the same size, which is the consistency that matters,
    // since nobody reads two languages at once.
    for (const [lang, names] of Object.entries(DISCIPLINES)) {
      const r = nameplateRung(names);
      expect(r.caps, lang).toBe(true);
      expect(r.lines, lang).toBe(1);
    }
    expect(nameplateRung(DISCIPLINES.en).size).toBeGreaterThan(nameplateRung(DISCIPLINES.de).size);
    expect(nameplateRung(DISCIPLINES.de).size).toBeGreaterThan(nameplateRung(DISCIPLINES.pl).size);
  });

  it("ties CAPS to the word count, not to the size", () => {
    // Tying it to the rung was the first cut, and it threw the treatment away
    // in two languages: Polish "Wioślarstwo" will not set at 28 but sets
    // happily in capitals at 20, and case has nothing to do with why.
    expect(nameplateRung(DISCIPLINES.pl).caps).toBe(true);
    expect(nameplateRung(DISCIPLINES.pl).size).toBeLessThan(fs.display);
    // One multi-word name in the set is enough to drop the whole set out of
    // capitals — a row where one card shouts and the rest do not is worse than
    // a row where none of them do.
    expect(nameplateRung([...DISCIPLINES.en, "Cross Country Skiing"]).caps).toBe(false);
  });

  it("aims at TWO lines, because three is what a plate tolerates not what it wants", () => {
    // At fs.display the movement set does set inside NAMEPLATE_MAX_LINES — as
    // three lines of 28dp capitals, which is precisely the wall of shouting
    // this module exists to prevent. The rung is the lever that avoids it.
    const three = nameplateRung(MOVEMENTS, { maxLines: 3 });
    expect(three.size).toBeGreaterThan(nameplateRung(MOVEMENTS).size);
    expect(nameplateRung(MOVEMENTS).lines).toBeLessThanOrEqual(2);
  });

  it("narrows the rung when the caller has a narrower card", () => {
    expect(nameplateRung(DISCIPLINES.en, { widthDp: 90 }).size)
      .toBeLessThan(nameplateRung(DISCIPLINES.en, { widthDp: 153 }).size);
  });

  it("never returns a rung outside the ladder, and never one below the floor", () => {
    const sets = [DISCIPLINES.en, DISCIPLINES.de, DISCIPLINES.pl, MOVEMENTS,
      ["Single Arm Dumbbell Preacher Curl With A Very Long Tail Indeed"], []];
    for (const set of sets) {
      const r = nameplateRung(set);
      expect(NAMEPLATE_RUNGS, JSON.stringify(set).slice(0, 40)).toContain(r.size);
    }
    // A name that will not set even at the floor gets the floor, not a
    // negative, not a crash — "use a different component" is fitsNameplate's
    // answer to give, not this one's.
    expect(nameplateRung(["Supercalifragilisticexpialidocious"], { widthDp: 40 }).size)
      .toBe(NAMEPLATE_RUNGS[NAMEPLATE_RUNGS.length - 1]);
  });
});
