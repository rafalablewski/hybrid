import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SOHNE, SOHNE_MONO, ITC_GARAMOND, SERIF_SIZE_RATIO, FIGURE_INK_EM, SOHNE_ADVANCE_EM, ADVANCE_FALLBACK_EM, inkSpan, capMatchAt, FACE_LIMITS, type FaceMetrics } from "./face-metrics";
import { fs, lh, TYPE_REF } from "../scale";

/**
 * THE METRICS ARE RE-READ FROM THE BINARIES, NOT TRUSTED.
 *
 * `face-metrics.ts` is the one file allowed to state a font measurement, and
 * every optical constant in the system resolves through it. That makes it
 * exactly the kind of file that rots invisibly: swap a font, and the numbers go
 * on describing the font you used to have. There is precedent — the serif
 * x-height sat at 0.445 in scale.ts against a binary that measures 0.4409, and
 * nothing noticed, because a pairing that is 1% off does not look broken, it
 * looks slightly cheap.
 *
 * ── TWO WAYS IN, BECAUSE THE TWO FORMATS ANSWER DIFFERENTLY ────────────────
 *
 * The Söhne cuts are CFF (.otf), whose outlines this file will not attempt to
 * parse — but their OS/2 `sxHeight` and `sCapHeight` are CORRECT (checked
 * against the outlines with fontTools when the values were taken), so the table
 * is a faithful source for them.
 *
 * ITC Garamond is TrueType (.ttf), so its per-glyph bounding boxes are in the
 * `glyf` records and can be read exactly — which is fortunate, because its OS/2
 * fields are WRONG. It reports an x-height of 0.220em, which is not a possible
 * x-height for any face, and is precisely half the real one. That is asserted
 * below rather than merely mentioned: the broken field is the reason the whole
 * file is outline-derived, and if a future release of the binary fixes it, this
 * test should be what tells us.
 */

const FONTS = join(__dirname, "..", "..", "..", "..", "apps", "mobile", "assets", "fonts");

interface Tables {
  buf: Buffer;
  off: Record<string, number>;
  upem: number;
}

function open(file: string): Tables {
  const buf = readFileSync(join(FONTS, file));
  const n = buf.readUInt16BE(4);
  const off: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const rec = 12 + 16 * i;
    off[buf.toString("latin1", rec, rec + 4)] = buf.readUInt32BE(rec + 8);
  }
  const head = off["head"];
  if (head === undefined) throw new Error(`${file}: no head table`);
  return { buf, off, upem: buf.readUInt16BE(head + 18) };
}

/** OS/2 is a fixed layout; these two live at 86 and 88 and exist from v2 on. */
const os2 = (t: Tables) => {
  const o = t.off["OS/2"]!;
  return {
    version: t.buf.readUInt16BE(o),
    weightClass: t.buf.readUInt16BE(o + 4),
    xHeight: t.buf.readInt16BE(o + 86) / t.upem,
    capHeight: t.buf.readInt16BE(o + 88) / t.upem,
  };
};

const hhea = (t: Tables) => {
  const o = t.off["hhea"]!;
  return {
    ascent: t.buf.readInt16BE(o + 4) / t.upem,
    descent: t.buf.readInt16BE(o + 6) / t.upem,
    lineGap: t.buf.readInt16BE(o + 8) / t.upem,
    advanceWidthMax: t.buf.readUInt16BE(o + 10) / t.upem,
  };
};

/** Unicode → glyph id, cmap format 4 (the only subtable these files carry). */
function glyphId(t: Tables, ch: string): number {
  const cmap = t.off["cmap"]!;
  const n = t.buf.readUInt16BE(cmap + 2);
  let sub = -1;
  for (let i = 0; i < n; i++) {
    const rec = cmap + 4 + 8 * i;
    const platform = t.buf.readUInt16BE(rec);
    const encoding = t.buf.readUInt16BE(rec + 2);
    const o = cmap + t.buf.readUInt32BE(rec + 4);
    if (t.buf.readUInt16BE(o) === 4 && (platform === 3 || platform === 0) && encoding !== 5) sub = o;
  }
  if (sub < 0) throw new Error("no format-4 cmap");
  const code = ch.codePointAt(0)!;
  const segX2 = t.buf.readUInt16BE(sub + 6);
  const ends = sub + 14;
  const starts = ends + segX2 + 2;
  const deltas = starts + segX2;
  const ranges = deltas + segX2;
  for (let s = 0; s < segX2 / 2; s++) {
    if (t.buf.readUInt16BE(ends + s * 2) < code) continue;
    if (t.buf.readUInt16BE(starts + s * 2) > code) return 0;
    const rangeOffset = t.buf.readUInt16BE(ranges + s * 2);
    const delta = t.buf.readInt16BE(deltas + s * 2);
    if (rangeOffset === 0) return (code + delta) & 0xffff;
    const at = ranges + s * 2 + rangeOffset + (code - t.buf.readUInt16BE(starts + s * 2)) * 2;
    const g = t.buf.readUInt16BE(at);
    return g === 0 ? 0 : (g + delta) & 0xffff;
  }
  return 0;
}

/**
 * A glyph's bounding box, straight out of its `glyf` record — TrueType stores
 * xMin/yMin/xMax/yMax in the glyph header, so no outline interpretation is
 * needed. Returns null for an empty glyph (space).
 */
function bbox(t: Tables, ch: string): { yMin: number; yMax: number; xMin: number; xMax: number } | null {
  const gid = glyphId(t, ch);
  const long = t.buf.readInt16BE(t.off["head"]! + 50) === 1;
  const loca = t.off["loca"]!;
  const start = long ? t.buf.readUInt32BE(loca + gid * 4) : t.buf.readUInt16BE(loca + gid * 2) * 2;
  const end = long ? t.buf.readUInt32BE(loca + (gid + 1) * 4) : t.buf.readUInt16BE(loca + (gid + 1) * 2) * 2;
  if (end <= start) return null;
  const g = t.off["glyf"]! + start;
  return {
    xMin: t.buf.readInt16BE(g + 2) / t.upem,
    yMin: t.buf.readInt16BE(g + 4) / t.upem,
    xMax: t.buf.readInt16BE(g + 6) / t.upem,
    yMax: t.buf.readInt16BE(g + 8) / t.upem,
  };
}

const SANS_CUTS: Array<[string, FaceMetrics, number]> = [
  ["buch", SOHNE.buch, 400],
  ["kraftig", SOHNE.kraftig, 500],
  ["halbfett", SOHNE.halbfett, 600],
];
const MONO_CUTS: Array<[string, FaceMetrics, number]> = [
  ["buch", SOHNE_MONO.buch, 400],
  ["kraftig", SOHNE_MONO.kraftig, 500],
  ["halbfett", SOHNE_MONO.halbfett, 600],
];

describe("the sans, against the shipped binaries", () => {
  for (const [cut, m, weightClass] of [...SANS_CUTS, ...MONO_CUTS]) {
    it(`${m.file} measures what face-metrics says it does`, () => {
      const t = open(m.file);
      expect(t.upem, "unitsPerEm").toBe(m.unitsPerEm);
      const o = os2(t);
      expect(o.version, "OS/2 must be v2+ for sxHeight to exist").toBeGreaterThanOrEqual(2);
      expect(o.xHeight, `${cut} x-height`).toBeCloseTo(m.xHeight, 4);
      expect(o.capHeight, `${cut} cap-height`).toBeCloseTo(m.capHeight, 4);
      // The weight class is what the FACE claims about itself, and the type
      // system's weight roles are mapped onto it — a binary swapped for a
      // different cut under the same filename would land silently otherwise.
      expect(o.weightClass, `${cut} usWeightClass`).toBe(weightClass);
    });
  }

  it("draws every weight on ONE skeleton — only the stem moves", () => {
    // The property the weight ladder in typography.ts is reasoned about with:
    // Söhne's cuts share an x-height to within 0.004em and a cap-height
    // exactly, so a weight change is a change of stem and nothing else. If a
    // future cut broke that, the ladder's "a heavier weight is the same letter
    // with more ink" argument would stop holding.
    const xs = SANS_CUTS.map(([, m]) => m.xHeight);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(0.005);
    expect(new Set(SANS_CUTS.map(([, m]) => m.capHeight)).size).toBe(1);
    // ...and the stems ascend, which is what makes them a ladder at all.
    const stems = SANS_CUTS.map(([, m]) => m.stem);
    for (let i = 1; i < stems.length; i++) expect(stems[i]!).toBeGreaterThan(stems[i - 1]!);
  });

  it("advances every mono glyph at exactly 0.600em", () => {
    // For a monospaced face the maximum advance IS the advance, so this reads
    // the whole face rather than sampling it. `fitMonoFigure` is a
    // multiplication over this number; if it is wrong, the biggest figure on
    // the app's biggest card silently picks the wrong rung.
    for (const [, m] of MONO_CUTS) {
      expect(hhea(open(m.file)).advanceWidthMax, m.file).toBeCloseTo(m.advanceN, 4);
      expect(m.advanceN).toBe(0.6);
    }
  });

  it("carries a line box far taller than its ink, which is why `flush` exists", () => {
    // Söhne's natural line box is 1.326em (hhea 1.037 + 0.289) against real ink
    // of 0.898em. That 0.428em of built-in slack is invisible in a paragraph and
    // very visible under a row of stat tiles — it is the band of nothing `flush`
    // was cut to remove, and the reason the cut cannot go all the way down to
    // the ink (see FLUSH_HEADROOM_EM in scale.ts).
    const h = hhea(open(SOHNE.buch.file));
    expect(h.ascent - h.descent + h.lineGap).toBeCloseTo(1.326, 3);
    expect(inkSpan(SOHNE.buch)).toBeCloseTo(0.898, 3);
    expect(lh.flush).toBeLessThan(h.ascent - h.descent);
  });
});

describe("the serif, against the shipped binary", () => {
  const t = () => open(ITC_GARAMOND.book.file);

  it("measures its x-height and cap-height from the OUTLINES", () => {
    const f = t();
    expect(f.upem).toBe(ITC_GARAMOND.book.unitsPerEm);
    expect(bbox(f, "x")!.yMax).toBeCloseTo(ITC_GARAMOND.book.xHeight, 4);
    expect(bbox(f, "H")!.yMax).toBeCloseTo(ITC_GARAMOND.book.capHeight, 4);
    expect(bbox(f, "l")!.yMax).toBeCloseTo(ITC_GARAMOND.book.ascender, 4);
    expect(bbox(f, "p")!.yMin).toBeCloseTo(ITC_GARAMOND.book.descender, 4);
  });

  it("HARD — its OS/2 x-height is WRONG, which is why nothing may read it", () => {
    // 0.2202em. Not a possible x-height for any face, and exactly half the real
    // one — so a system trusting the table would set the serif at DOUBLE the
    // intended size and the bug would look like a design decision. This is the
    // single reason face-metrics.ts is outline-derived rather than table-derived,
    // and the assertion exists so that reason cannot quietly stop being true.
    const o = os2(t());
    expect(o.xHeight).toBeCloseTo(0.2202, 4);
    expect(o.xHeight).not.toBeCloseTo(ITC_GARAMOND.book.xHeight, 2);
    expect(o.xHeight * 2).toBeCloseTo(ITC_GARAMOND.book.xHeight, 3);
  });

  it("HARD — cannot set Polish, and the type system knows it", () => {
    // `cut.serif` is English-only. That rule predates this file; here is the
    // measurement behind it. A missing glyph is not a fallback, it is a hole in
    // a sentence set at 33dp.
    for (const ch of "ąęśżźćń") expect(glyphId(t(), ch), `serif is missing ${ch}`).toBe(0);
    // ...and it DOES carry these, which is why the rule is about the language
    // and not about the alphabet.
    for (const ch of "Łłóé") expect(glyphId(t(), ch), `serif should have ${ch}`).not.toBe(0);
    expect(FACE_LIMITS.serifMissingPolish).toBe(true);
  });

  it("HARD — its figures descend, so they can never join a mono column", () => {
    // HYBRID FIGURES, not lining ones, and the mix is the problem: across 0-9
    // the set spans +0.742 to -0.102, because some figures sit on the baseline
    // and others drop below it. So the serif's numerals are not even a
    // consistent height AMONG THEMSELVES, let alone against a mono column — and
    // the whole span is taller than the `flush` box was cut to hold. The serif
    // is barred from figures on typographic grounds anyway; this is the metric
    // reason the bar is not negotiable.
    const f = t();
    const digits = [..."0123456789"].map((d) => bbox(f, d)!);
    const top = Math.max(...digits.map((d) => d.yMax));
    const bottom = Math.min(...digits.map((d) => d.yMin));
    expect(bottom, "some figure must descend").toBeLessThan(-0.05);
    expect(Math.max(...digits.map((d) => d.yMin)), "and others must not").toBeGreaterThan(-0.03);
    expect(top - bottom).toBeGreaterThan(FIGURE_INK_EM);
    expect(FACE_LIMITS.serifFiguresDescend).toBe(true);
  });
});

describe("what the binaries cannot do, stated as constraints", () => {
  it("HARD — the sans ships NO OpenType features, so `tnum` is not the mechanism", () => {
    // The claim that broke when the face changed: the system used to document a
    // tabular numeral set it could switch on. These files have no GSUB table at
    // all, so `font-variant-numeric: tabular-nums` activates nothing. Column
    // alignment rests on the MONO CUT's uniform advance and on nothing else,
    // which is why typography.ts requires every measured value to be `mono`.
    for (const [, m] of SANS_CUTS) {
      const t = open(m.file);
      expect(t.off["GSUB"] === undefined || t.buf.readUInt32BE(t.off["GSUB"]!) === 0x00010000, m.file).toBe(true);
    }
    expect(FACE_LIMITS.sansHasNoOpenTypeFeatures).toBe(true);
    expect(FACE_LIMITS.sansDigitsAreProportional).toBe(true);
  });

  it("HARD — the sans cannot set German; `ß` is absent from every cut", () => {
    // A constraint on the `vocabulary-pl-de` capability, not a curiosity. The
    // shipped cuts are 121-glyph trial files extended by reference/sohne-extend.py,
    // and the extension added punctuation and diacritics, not letters.
    for (const [, m] of SANS_CUTS) expect(glyphId(open(m.file), "ß"), `${m.file} has ß`).toBe(0);
    // Polish, by contrast, the sans CAN set — which is why only the serif is
    // language-gated.
    for (const ch of "ąęśżźćńł") expect(glyphId(open(SOHNE.buch.file), ch), `sans is missing ${ch}`).not.toBe(0);
    expect(FACE_LIMITS.sansMissingEszett).toBe(true);
  });
});

describe("what the scale derives from all this", () => {
  it("the serif size ratio is the two x-heights and nothing else", () => {
    expect(SERIF_SIZE_RATIO).toBeCloseTo(SOHNE.buch.xHeight / ITC_GARAMOND.book.xHeight, 5);
    expect(fs.editorial).toBe(Math.round(fs.display * SERIF_SIZE_RATIO));
  });

  it("the pair agrees on caps as well as on x-height", () => {
    const { sans, serif } = capMatchAt(fs.display, fs.editorial);
    expect(Math.abs(sans - serif)).toBeLessThan(1);
  });

  it("the editorial leading comes off the serif's own ink span", () => {
    expect(lh.editorial).toBeCloseTo((inkSpan(ITC_GARAMOND.book) * 4) / 3, 2);
    // The defect it fixes: at `snug` the editorial voice was set at 1.53x its
    // APPARENT size — body leading on a display-size pull quote — because a
    // ratio multiplies an em that the x-height compensation had already
    // inflated by 18.6%.
    const apparent = fs.editorial / SERIF_SIZE_RATIO;
    expect((fs.editorial * lh.snug) / apparent).toBeGreaterThan(1.5);
    expect((fs.editorial * lh.editorial) / apparent).toBeLessThan(1.5);
  });

  it("the reference size is the size the sans is fitted for", () => {
    // The one number the ladder and the tracking curve share. It is not a rung
    // that happens to be round; it is the origin of both axes.
    expect(TYPE_REF).toBe(16);
    expect(fs.bodyLg).toBe(TYPE_REF);
  });
});

describe("the proportional advance table", () => {
  /** Advance of a character, in em, straight out of `hmtx`. */
  const advance = (t: ReturnType<typeof open>, ch: string) => {
    const gid = glyphId(t, ch);
    if (gid === 0) return null;
    const hhea = t.off["hhea"]!;
    const numH = t.buf.readUInt16BE(hhea + 34);
    const hmtx = t.off["hmtx"]!;
    const i = Math.min(gid, numH - 1);
    return t.buf.readUInt16BE(hmtx + i * 4) / t.upem;
  };

  it("HARD — every listed width is the shipped binary's", () => {
    // The defect this exists for was NOT a stale comment. `session-wrapped.ts`
    // sized the Wrapped's hero and stat figures from a table measured on the
    // PREVIOUS display face, and went on doing it through the font swap — a
    // space 78% too wide, an `m` 14% too narrow, one constant for ten digits
    // that span 59%. Nothing failed, the figures just shrank more than they had
    // to. A table of measurements needs a test or it is a rumour.
    const t = open(SOHNE.halbfett.file);
    for (const [ch, em] of Object.entries(SOHNE_ADVANCE_EM)) {
      const real = advance(t, ch);
      expect(real, `${JSON.stringify(ch)} is not in the face`).not.toBeNull();
      expect(real!, `advance of ${JSON.stringify(ch)}`).toBeCloseTo(em, 3);
    }
  });

  it("HARD — it is Halbfett's, because that is what F.black draws", () => {
    // The Wrapped's figures use `F.black`, which resolves to Halbfett since the
    // weight ladder was capped at 600. If the alias ever moves, this table moves
    // with it — a lighter cut's advances differ by enough to matter at 96px.
    expect(advance(open(SOHNE.halbfett.file), "m")).toBeCloseTo(SOHNE_ADVANCE_EM["m"]!, 3);
    expect(advance(open(SOHNE.kraftig.file), "m")).not.toBeCloseTo(SOHNE_ADVANCE_EM["m"]!, 3);
  });

  it("HARD — `~` really is absent, so the fallback is load-bearing", () => {
    // The Wrapped prefixes an estimate with a tilde. The extended trial cuts do
    // not draw one, so it renders in the platform fallback and is fitted at
    // ADVANCE_FALLBACK_EM. Listed as a known hole rather than found as a
    // wrapped tile on somebody's phone.
    expect(glyphId(open(SOHNE.halbfett.file), "~")).toBe(0);
    expect(SOHNE_ADVANCE_EM["~"]).toBeUndefined();
    expect(ADVANCE_FALLBACK_EM).toBe(0.6);
  });

  it("carries every digit, because one digit constant cannot serve ten", () => {
    for (const d of "0123456789") expect(SOHNE_ADVANCE_EM[d], d).toBeDefined();
    const digits = [..."0123456789"].map((d) => SOHNE_ADVANCE_EM[d]!);
    expect(Math.max(...digits) / Math.min(...digits)).toBeGreaterThan(1.5);
  });
});
