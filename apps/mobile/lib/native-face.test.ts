import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

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
 *   1. Every `F` alias maps to the PostScript name of the .ttf that
 *      `@expo-google-fonts` actually ships — read out of the font's own `name`
 *      table here, so a package bump that renames a face fails the build
 *      instead of silently falling back.
 *
 *   2. No `font({ family })` in the SwiftUI kit passes a family through
 *      without `nativeFace()`.
 */

const ROOT = join(__dirname, "..");
const REPO = join(ROOT, "..", "..");

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

/** Where `@expo-google-fonts` puts the alias's file: <pkg>/<weight>/<alias>.ttf */
function fontFile(alias: string): string | null {
  const [family, weight] = alias.split("_");
  const pkg = family === "JetBrainsMono" ? "jetbrains-mono" : family.toLowerCase();
  for (const base of [join(REPO, "node_modules"), join(ROOT, "node_modules")]) {
    const p = join(base, "@expo-google-fonts", pkg, weight, `${alias}.ttf`);
    if (existsSync(p)) return p;
  }
  return null;
}

describe("native face map", () => {
  const F = aliases();
  const PS = postscript();

  it("covers every face the app loads", () => {
    expect(Object.keys(PS).sort()).toEqual(Object.keys(F).sort());
  });

  for (const [key, alias] of Object.entries(aliases())) {
    it(`F.${key} maps to the PostScript name in ${alias}.ttf`, () => {
      const file = fontFile(alias);
      // A missing package is a broken install, not a passing test.
      expect(file, `no .ttf found for ${alias}`).toBeTruthy();
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
