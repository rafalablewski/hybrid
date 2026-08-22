import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MONO_ADVANCE_EM } from "@hybrid/core";

/**
 * THE NATIVE FACE GUARD.
 *
 * `F` holds expo-font ALIASES ("Archivo_700Bold"). React Native resolves them
 * because expo-font swizzles `UIFont.fontNames(forFamilyName:)`; SwiftUI does
 * not take that path — `@expo/ui`'s `font({ family })` ends in
 * `Font.custom(family, size:)`, straight into Core Text, which knows the face
 * only by the PostScript name in the binary ("Archivo-Bold").
 *
 * The failure mode is the reason this file exists: `Font.custom` with a name
 * nothing resolves does not throw and does not warn — it draws San Francisco.
 * So a native leaf handed `F.bold` renders the SYSTEM font beside Archivo on
 * the same row, the prop looks correct in the diff, and the only evidence is a
 * screenshot. That is exactly how the nutrition head's "Breakfast ⌄" kept
 * coming back off-face after being "fixed".
 *
 * Two rules, both hard:
 *
 *   1. Every `F` alias maps to the PostScript name of the .otf the app actually
 *      BUNDLES — read out of the font's own `name` table here, so replacing a
 *      binary (the evaluation cuts for the retail ones, say) fails the build
 *      instead of silently falling back.
 *
 *   2. No `font({ family })` in the SwiftUI kit passes a family through
 *      without `nativeFace()`.
 */

const ROOT = join(__dirname, "..");

/** `F` and its map, read as TEXT — this project runs in plain node, and
 *  lib/ui.tsx imports react-native. */
const UI = readFileSync(join(ROOT, "lib", "ui.tsx"), "utf8");

/** The `F` block: key → alias. */
function aliases(): Record<string, string> {
  const block = UI.match(/export const F = \{([\s\S]*?)\} as const;/);
  if (!block) throw new Error("apps/mobile/lib/ui.tsx: `F` block not found");
  const out: Record<string, string> = {};
  for (const [, k, v] of block[1].matchAll(/(\w+):\s*"([^"]+)"/g)) out[k] = v;
  return out;
}

/** The `F_POSTSCRIPT` block: alias key (`F.bold`) → PostScript name. */
function postscript(): Record<string, string> {
  const block = UI.match(/export const F_POSTSCRIPT[\s\S]*?\{([\s\S]*?)\n\};/);
  if (!block) throw new Error("apps/mobile/lib/ui.tsx: `F_POSTSCRIPT` block not found");
  const out: Record<string, string> = {};
  for (const [, k, v] of block[1].matchAll(/\[F\.(\w+)\]:\s*"([^"]+)"/g)) out[k] = v;
  return out;
}

/**
 * The PostScript name (`name` table, ID 6) of a TrueType file — the name
 * `CTFontManagerRegisterFontsForURL` registers the face under, and therefore
 * the one string `Font.custom` can resolve.
 */
function postScriptNameOf(file: string): string {
  const d = readFileSync(file);
  const tables = d.readUInt16BE(4);
  for (let i = 0; i < tables; i++) {
    const rec = 12 + 16 * i;
    if (d.toString("latin1", rec, rec + 4) !== "name") continue;
    const off = d.readUInt32BE(rec + 8);
    const count = d.readUInt16BE(off + 2);
    const strings = off + d.readUInt16BE(off + 4);
    for (let j = 0; j < count; j++) {
      const r = off + 6 + 12 * j;
      const platform = d.readUInt16BE(r);
      const nameId = d.readUInt16BE(r + 6);
      if (nameId !== 6) continue;
      const len = d.readUInt16BE(r + 8);
      const at = strings + d.readUInt16BE(r + 10);
      const raw = Buffer.from(d.subarray(at, at + len));
      // Platform 3 (Windows) stores UTF-16 BIG-endian; node only decodes LE.
      return platform === 3 ? raw.swap16().toString("utf16le") : raw.toString("latin1");
    }
  }
  throw new Error(`${file}: no PostScript name`);
}

/**
 * The bundled binary for an alias. Söhne is licensed, so it is not an npm
 * package — the .otf files live in `assets/fonts` and `_layout.tsx` requires
 * them directly, which is also what makes this guard stronger than it was:
 * it now reads the very bytes the app ships rather than a package's copy.
 *
 * `Sohne_600Halbfett` -> assets/fonts/Sohne-Halbfett.otf
 */
function fontFile(alias: string): string | null {
  const [family, weightAndCut] = alias.split("_");
  const cut = weightAndCut.replace(/^\d+/, "");
  const p = join(ROOT, "assets", "fonts", `${family}-${cut}.otf`);
  return existsSync(p) ? p : null;
}

/** `head.unitsPerEm` and `hhea.advanceWidthMax` — for a monospaced face the max
 *  advance IS the advance, which is the whole property being asserted. */
function monoAdvanceEm(file: string): number {
  const d = readFileSync(file);
  const tables = d.readUInt16BE(4);
  let upem = 0;
  let maxAdv = 0;
  for (let i = 0; i < tables; i++) {
    const rec = 12 + 16 * i;
    const tag = d.toString("latin1", rec, rec + 4);
    const off = d.readUInt32BE(rec + 8);
    if (tag === "head") upem = d.readUInt16BE(off + 18);
    if (tag === "hhea") maxAdv = d.readUInt16BE(off + 10);
  }
  if (!upem || !maxAdv) throw new Error(`${file}: no head/hhea`);
  return maxAdv / upem;
}

describe("the mono advance the layout arithmetic depends on", () => {
  // STEP 7 OF THE FACE MIGRATION, AS A GUARD RATHER THAN A ONE-OFF CHECK.
  //
  // `fitMonoFigure` (core scale.ts) sizes Today's hero figure by the one
  // multiplication a monospaced face makes possible — characters x size x
  // MONO_ADVANCE_EM — so that constant is not a style, it is an assertion about
  // the binary. If it and the shipped face ever disagree, the biggest figure on
  // the app's biggest card silently picks the wrong rung and either ellipsises
  // or leaves a third of its cell empty.
  //
  // The migration plan predicted Söhne Mono would be narrower than JetBrains
  // Mono and that everything computing a width from a character count would
  // need recalculating. MEASURED, THEY ARE IDENTICAL: both are exactly 0.600 em
  // on a 1000 upem. So the constant did not move — and the reason to write this
  // down as a test rather than a sentence is that the prediction was wrong in
  // the safe direction, and the next face may not be.
  for (const cut of ["SohneMono-Buch", "SohneMono-Kraftig", "SohneMono-Halbfett"]) {
    it(`${cut} advances exactly MONO_ADVANCE_EM`, () => {
      const file = join(ROOT, "assets", "fonts", `${cut}.otf`);
      expect(existsSync(file), `${cut}.otf is not bundled`).toBe(true);
      expect(monoAdvanceEm(file)).toBeCloseTo(MONO_ADVANCE_EM, 4);
    });
  }
});

describe("native face map", () => {
  const F = aliases();
  const PS = postscript();

  it("covers every face the app loads", () => {
    expect(Object.keys(PS).sort()).toEqual(Object.keys(F).sort());
  });

  for (const [key, alias] of Object.entries(aliases())) {
    it(`F.${key} maps to the PostScript name in ${alias}.ttf`, () => {
      const file = fontFile(alias);
      // A missing binary is a broken bundle, not a passing test.
      expect(file, `no .otf bundled for ${alias}`).toBeTruthy();
      expect(PS[key]).toBe(postScriptNameOf(file!));
    });
  }

  it("the alias is never the PostScript name (the bug this map fixes)", () => {
    // If these ever coincide the map is a no-op and the guard below is the
    // only thing left holding the rule up — worth knowing.
    for (const [key, alias] of Object.entries(F)) expect(PS[key]).not.toBe(alias);
  });
});

describe("the SwiftUI kit passes no raw alias to Core Text", () => {
  const swift = readFileSync(join(ROOT, "components", "aurora", "swiftui.tsx"), "utf8");

  const sites = swift
    .split("\n")
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => /font\(\{[^}]*family:/.test(line));

  it("still finds the call sites at all", () => {
    // A guard that matches nothing passes forever. If the modifier is spelled
    // some other way one day, this fails first and says so.
    expect(sites.length).toBeGreaterThan(0);
  });

  it("every font({ family }) goes through nativeFace()", () => {
    const bad = sites.filter(({ line }) => !/family:\s*nativeFace\(/.test(line));
    expect(bad.map((b) => `swiftui.tsx:${b.n} ${b.line.trim()}`)).toEqual([]);
  });
});
