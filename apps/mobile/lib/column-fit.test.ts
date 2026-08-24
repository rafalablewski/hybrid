import { describe, expect, it } from "vitest";
import {
  CAPS_AIR_EM,
  MONO_ADVANCE_EM,
  baselineString,
  fs,
  opticalTrackEm,
  textWidthEm,
  type Lang,
} from "@hybrid/core";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EVERY FIXED-WIDTH TEXT COLUMN IN THE APP, AGAINST WHAT IT CAN ACTUALLY HOLD
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ── WHY THIS FILE EXISTS ──────────────────────────────────────────────────
 *
 * A `Text` with `numberOfLines={1}` and a fixed `width` does not fail when the
 * string is too long. It draws an ellipsis and carries on, and the ellipsis is
 * the only evidence. That makes it the one class of layout bug that:
 *
 *   - `tsc` cannot see, because the width and the string are both valid;
 *   - the render tests cannot see, because JSDOM does not truncate anything —
 *     `scrollWidth` in a test environment with no real font is fiction;
 *   - a screenshot in ENGLISH cannot see, because English is the shortest of
 *     the three languages this app ships;
 *   - and code review cannot see, because the width sits in a style object
 *     forty lines from the string it is meant to hold.
 *
 * So they accumulate. An audit of the shipped Today screen found FIVE columns
 * that had been cutting their own contents since the day they were written,
 * each with a confident comment attached:
 *
 *                     was    needs   now
 *     ARRIVAL_W       62dp    84dp    92    "`120.5 × 12` is the widest real
 *                                            pair" — it is, and it is 84dp
 *     ORIGIN_W        52      60      66
 *     DELTA_W         58      71      78    cut "+12 reps" and EVERY Polish
 *                                            rep delta ("+1 powt." is 62dp)
 *     tissue area     62      87      92    cut "Hamstrings" in ENGLISH, and
 *                                            four of seven areas in PL and DE
 *     rung label      78      79      86    cut German "Halbmarathon", by 1.2dp
 *
 * The third column is the second PLUS ONE CHARACTER. A column sized to exactly
 * its worst string has no tolerance — the arrival's widest pair is 84.0dp in
 * an 84dp box — and one character is the smallest unit its content is made of,
 * so in mono it is slack you can state as a number rather than feel for.
 *
 * The arrival column is the instructive one. It was too narrow for "100 × 10"
 * — not the extreme case, the ORDINARY one — so the ledger had been cutting
 * the figure it exists to show, on most rows, forever.
 *
 * ── HOW IT CHECKS ─────────────────────────────────────────────────────────
 *
 * By arithmetic, because arithmetic is the only thing that can. Söhne Mono has
 * ONE advance (`numHMetrics` is 1, every glyph 0.600em), so a mono string's
 * width is its LENGTH. The sans needs the per-glyph table in
 * `theme/face-metrics.ts`, which is re-read from the binary by its own test.
 *
 * Strings come from the SHIPPED DICTIONARY wherever the column holds
 * localizable copy — `baselineString(lang, key)` — so a translator lengthening
 * a word fails this file rather than shipping an ellipsis. Where a column holds
 * a GENERATED string (a set as `120.5 × 12`, a delta as `+2.5 kg`) the
 * generator's worst case is written out, with the reasoning, because there is
 * nothing to look up.
 *
 * ── ADDING A COLUMN ───────────────────────────────────────────────────────
 *
 * A new fixed-width single-line `Text` belongs in `COLUMNS` below. That is the
 * whole ask: the entry is four lines and it means the column can never quietly
 * start truncating. A column that is genuinely allowed to ellipsise — a
 * user-typed session title, a food name from a database — does NOT belong
 * here, because for those the ellipsis is the design. The distinction is
 * whether the app CHOSE the string: if the app chose it, the app can be
 * expected to fit it.
 */

const LANGS: Lang[] = ["en", "pl", "de"];

/** A mono string's width is its length. That is the whole metric. */
const mono = (s: string, size: number): number => s.length * size * MONO_ADVANCE_EM;

/** The sans needs the per-glyph table. `role` picks the tracking the slot is
 *  drawn with — a tracked eyebrow is measurably wider than untracked text. */
const sans = (s: string, size: number, role: "text" | "label" | "caps" = "text"): number =>
  textWidthEm(
    s,
    (role === "caps" ? CAPS_AIR_EM.caps : role === "label" ? CAPS_AIR_EM.label : 0) +
      opticalTrackEm(size),
  ) * size;

interface Column {
  /** file:symbol, so a failure names the line to open. */
  where: string;
  /** The reserved width, in dp, exactly as the component writes it. */
  width: number;
  size: number;
  cut: "mono" | "sans";
  role?: "text" | "label" | "caps";
  /** i18n keys the column renders. Checked in all three languages. */
  keys?: string[];
  /** Generated strings the column renders — the generator's worst cases. */
  literals?: string[];
}

const COLUMNS: Column[] = [
  // ── Tissue table (aurora/tissue-card.tsx) ───────────────────────────────
  {
    where: "tissue-card.tsx AREA_W",
    width: 92,
    size: fs.caption,
    cut: "sans",
    keys: [
      "w.injury.area.quads", "w.injury.area.glutes", "w.injury.area.posterior",
      "w.injury.area.back", "w.injury.area.chest", "w.injury.area.shoulders",
      "w.injury.area.triceps",
    ],
  },
  {
    where: "tissue-card.tsx risk",
    width: 26,
    size: fs.micro,
    cut: "mono",
    literals: ["100"],                       // the scale is 0..100
  },
  {
    where: "tissue-card.tsx probability",
    width: 44,
    size: fs.micro,
    cut: "mono",
    literals: ["100.0%"],                    // `probPct.toFixed(1)` + "%"
  },
  {
    where: "tissue-card.tsx ACWR",
    width: 38,
    size: fs.micro,
    cut: "mono",
    literals: ["4.00", "—"],                 // the formula's ceiling, and no baseline
  },

  // ── Sport page record ladder (aurora/sport-page.tsx) ────────────────────
  //
  // `rungLabel` is either a NAMED rung from the dictionary or `${value} ${unit}`.
  {
    where: "sport-page.tsx rung label",
    width: 86,
    size: fs.micro,
    cut: "mono",
    role: "caps",
    keys: ["w.train.sportPage.half", "w.train.sportPage.marathon"],
    literals: ["21.1 km", "42.2 km", "1000 m", "13.1 mi", "26.2 mi"],
  },
];

describe("fixed-width text columns hold what they are given", () => {
  for (const col of COLUMNS) {
    const measure = (s: string) =>
      col.cut === "mono" ? mono(s, col.size) : sans(s, col.size, col.role ?? "text");

    it(`${col.where} — ${col.width}dp`, () => {
      const checked: string[] = [];
      for (const key of col.keys ?? []) {
        for (const lang of LANGS) {
          const s = baselineString(lang, key);
          // A key that resolves to nothing is a different bug, and
          // i18n-keys.test.ts owns it — do not fail twice for one fault.
          if (!s) continue;
          checked.push(s);
          expect(measure(s), `${col.where} · ${lang} · ${key} · "${s}"`).toBeLessThanOrEqual(col.width);
        }
      }
      for (const s of col.literals ?? []) {
        checked.push(s);
        expect(measure(s), `${col.where} · "${s}"`).toBeLessThanOrEqual(col.width);
      }
      // A column with nothing to check is an entry that has rotted — a renamed
      // key, a deleted literal — and would pass forever while checking nothing.
      expect(checked.length, `${col.where} checks nothing`).toBeGreaterThan(0);
    });
  }

  it("KNOWS THE OLD WIDTHS FAILED, so every one of these can still fail", () => {
    // Each of these is the width the column carried before this sweep, against
    // a string it was actually being given. If a future change makes these
    // pass, the measuring is broken rather than the app being fixed.
    expect(mono("120.5 × 12", fs.body)).toBeGreaterThan(62);       // ARRIVAL_W was 62
    expect(mono("100 × 10", fs.body)).toBeGreaterThan(62);         // ...on the ORDINARY case
    expect(mono("120.5 × 12", fs.nano)).toBeGreaterThan(52);       // ORIGIN_W was 52
    expect(mono("+1 powt.", fs.caption)).toBeGreaterThan(58);      // DELTA_W was 58
    expect(sans("Hamstrings", fs.caption)).toBeGreaterThan(62);    // AREA_W was 62, in ENGLISH
    expect(sans("Dwugłowe uda", fs.caption)).toBeGreaterThan(62);
    expect(mono("Halbmarathon", fs.micro)).toBeGreaterThan(78);    // the rung was 78
  });

  it("keeps the TICKER ARROWS out of a fixed column, because we cannot size them", () => {
    // ▲ and ▼ exist in NONE of the shipped cuts — checked with cmap lookups
    // against Sohne-Halbfett, SohneMono-Buch and SohneMono-Halbfett. They
    // render in the platform's symbol fallback at a width this repo cannot
    // know, so no fixed-width column may contain one. `TickerDelta` draws them
    // in a FLEXING slot (the exercise card's base row, the exercise page's
    // hero), which is the only safe place for a glyph of unknown width.
    const arrows = ["▲", "▼"];
    for (const col of COLUMNS) {
      for (const s of col.literals ?? []) {
        for (const a of arrows) {
          expect(s.includes(a), `${col.where} reserves a fixed width for "${a}"`).toBe(false);
        }
      }
    }
    // The card's base row holds the widest delta beside the widest figure with
    // room to spare even if the arrow renders at a full em rather than 0.6.
    const line = 179 - 2 - 24;                       // the card's content line
    const figure = mono("1,240", fs.bodyLg) + 4 + mono("lb", fs.nano);
    const delta = fs.micro /* the arrow at 1em */ + mono(" 100.0%", fs.micro);
    expect(figure + 8 + delta).toBeLessThan(line);
  });

  it("measures the MONO by length, which is the whole of Söhne Mono's metric", () => {
    // Stated here as well as in nameplate.test.ts because this file's every
    // assertion rests on it: SohneMono-Buch.otf has numHMetrics = 1.
    expect(MONO_ADVANCE_EM).toBe(0.6);
    expect(mono("ABCDEFGHIJ", 10)).toBe(mono("..........", 10));
  });
});
