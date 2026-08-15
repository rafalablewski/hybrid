import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { colors } from "@hybrid/core";

/**
 * THE CRASH FALLBACK'S COLOURS, HELD TO THE PALETTE — without importing it.
 *
 * `components/error-boundary.tsx` is deliberately provider-free: "no theme,
 * i18n, session or app font: any of those may be the thing that failed, and a
 * fallback that needs the broken thing is not a fallback." That is right, and
 * it is why the file hardcodes its ink, chalk, ash, line and lime instead of
 * reading `useTheme()`.
 *
 * It is also why the file is EXEMPT from the design-token rules — and an
 * exemption with nothing watching it is how both of its neutrals went stale
 * without anyone noticing:
 *
 *   LINE was #2a2d2a. tokens.ts names that exact value as the stale one that
 *     "made every chart hairline draw in a different grey than every border".
 *
 *   CHALK was #eae3d4 — the GROUND colour of "Clay & Sage on Oat", a light
 *     theme that was superseded by Kyoto Hour and then deleted whole in Aug
 *     2026 — used here as TEXT on a near-black screen. A warm cream where the
 *     app's chalk is a cool off-white.
 *
 * So the screen a user only ever sees when everything else has broken was the
 * one screen still painted in a retired theme.
 *
 * THIS TEST IS THE MISSING HALF OF THE EXEMPTION. The file keeps its literals —
 * that is the whole design — but the literals have to be the CURRENT ones, and
 * a copy nobody diffs is a copy that rots. Reading the source as TEXT rather
 * than importing it keeps the boundary's own import graph untouched: the guard
 * takes the dependency so the fallback does not have to.
 */

const SRC = readFileSync(join(__dirname, "..", "components", "error-boundary.tsx"), "utf8");

/** `const NAME = "#rrggbb";` as declared in the fallback. */
function literal(name: string): string | null {
  const m = new RegExp(`const ${name}\\s*=\\s*"(#[0-9a-fA-F]{3,8})"`).exec(SRC);
  return m ? m[1].toLowerCase() : null;
}

describe("the crash fallback's hardcoded palette", () => {
  it("copies the CURRENT palette, token for token", () => {
    const expected: Record<string, string> = {
      INK: colors.ink,
      INK2: colors.ink2,
      LINE: colors.line,
      CHALK: colors.chalk,
      ASH: colors.ash,
      LIME: colors.lime,
    };
    for (const [name, want] of Object.entries(expected)) {
      expect(literal(name), `${name} in error-boundary.tsx`).toBe(want.toLowerCase());
    }
  });

  it("still imports no theme — the copy is the point", () => {
    // If this ever fails, the fix is NOT to relax it: read the file's header.
    // A fallback that needs the thing that broke is not a fallback.
    expect(SRC).not.toMatch(/from\s+"[^"]*lib\/theme"/);
    expect(SRC).not.toMatch(/\buseTheme\b/);
  });

  it("names every colour it draws, so none can be added unguarded", () => {
    // A raw hex anywhere but the declaration block would be a seventh colour
    // this test does not know about — which is exactly how the two stale ones
    // survived. Only the `const NAME = "#…"` lines may carry a literal.
    const rogue = SRC.split("\n")
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => /["'`]#[0-9a-fA-F]{3,8}["'`]/.test(line))
      .filter(({ line }) => !/^const [A-Z0-9_]+ = "#[0-9a-fA-F]{3,8}";/.test(line.trim()))
      .filter(({ line }) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .map(({ n }) => `error-boundary.tsx:${n}`);
    expect(rogue).toEqual([]);
  });
});
