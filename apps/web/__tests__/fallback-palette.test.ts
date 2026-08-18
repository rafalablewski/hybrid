import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { colors, FEEDBACK, THEMES } from "@hybrid/core";

/**
 * THE HAND-COPIED PALETTES, HELD TO THE REAL ONE — the web half of a guard that
 * mobile has had since its own copy rotted.
 *
 * SIX FILES ON THIS SIDE SPELL THE PALETTE OUT AS LITERALS, and two of them have
 * to: `error.tsx` and `global-error.tsx` are crash boundaries, and
 * `global-error.tsx` replaces the whole document — `<html>` included — so the
 * stylesheet that defines `--color-ink` is exactly the thing that may not be
 * there when it renders. A fallback that needs the broken thing is not a
 * fallback. The landing and legal pages are the same shape for a duller reason:
 * they are standalone and were written before the tokens existed.
 *
 * THAT IS FINE. What is not fine is a copy nobody diffs, and audit/12 §5.3 found
 * exactly what that produces: `#2a2d2a` — the value `theme/tokens.ts` names by
 * name as the stale hairline that "made every chart hairline draw in a different
 * grey than every border" — still drawing the border on the web crash pages,
 * months after the identical bug was found and fixed in the MOBILE crash
 * fallback. The mobile one got `lib/error-boundary-palette.test.ts` at the time.
 * Its web twins got nothing, so the same copy rotted the same way, and the retint
 * that followed did not catch it either: that sweep followed the ACCENT hexes,
 * and a stale neutral is not an accent.
 *
 * SO THE RULE IS NOT "don't hardcode" — it is "every literal you hardcode has to
 * be a colour the palette currently holds". Hardcoding is the design; hardcoding
 * a RETIRED value is the bug, and it is the only thing this test looks for.
 *
 * Deliberately reads the sources as TEXT rather than importing them: these files
 * are Next.js route components with client directives and JSX, and a guard has no
 * business dragging that into a unit test to check six strings.
 */

/** Every file on this side that spells a palette value out as a literal. */
const HARDCODED = [
  "app/error.tsx",
  "app/global-error.tsx",
  "app/not-found.tsx",
  "app/page.tsx",
  "app/privacy/page.tsx",
  "app/terms/page.tsx",
];

/** Every colour the palette currently holds, lowercased. */
const PALETTE = new Set(
  [
    ...Object.values(colors),
    ...Object.values(THEMES.dark).flatMap((v): string[] => (typeof v === "string" ? [v] : Object.values(v))),
    ...Object.values(FEEDBACK).flatMap((t) => [t.fill, t.ink, t.text]),
  ].map((c) => c.toLowerCase()),
);

const HEX = /#[0-9a-fA-F]{6}\b/g;
const read = (rel: string) => readFileSync(join(__dirname, "..", rel), "utf8");

describe("the hand-copied palettes on the web side", () => {
  for (const rel of HARDCODED) {
    it(`${rel} uses only colours the palette currently holds`, () => {
      const found = [...new Set((read(rel).match(HEX) ?? []).map((h) => h.toLowerCase()))];
      const stale = found.filter((h) => !PALETTE.has(h));
      expect(
        stale,
        `${rel} carries ${stale.length} literal(s) that are not in the palette any more. ` +
          `Hardcoding is fine here — hardcoding a retired value is the bug this guards. ` +
          `Current palette: ${[...PALETTE].sort().join(" ")}`,
      ).toEqual([]);
    });
  }

  // The list itself has to stay honest: a NEW file that spells the palette out
  // and is not on the list above is a copy with nothing watching it, which is the
  // whole failure mode. This catches the next one at the moment it is written.
  it("no other page has quietly started hand-copying the palette", () => {
    const { readdirSync, statSync } = require("node:fs") as typeof import("node:fs");
    const root = join(__dirname, "..", "app");
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const entry of readdirSync(dir)) {
        if (entry === "node_modules" || entry === ".next" || entry === "api") continue;
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (/\.tsx?$/.test(p)) out.push(p);
      }
      return out;
    };
    const known = new Set(HARDCODED.map((r) => join(__dirname, "..", r)));
    const offenders = walk(root)
      .filter((p) => !known.has(p))
      .filter((p) => {
        const hexes = readFileSync(p, "utf8").match(HEX) ?? [];
        // A page that spells out a colour the palette DOES hold is the case that
        // matters: it is a copy, and copies drift. One that uses a colour the
        // palette never had is somebody's local artwork and not this rule's business.
        return hexes.some((h) => PALETTE.has(h.toLowerCase()));
      })
      .map((p) => p.slice(p.indexOf("/app/") + 1));

    expect(
      offenders,
      "these pages hand-copy a palette value and are not on HARDCODED, so nothing diffs them. " +
        "Add them to the list (and keep the copy) or read the token instead.",
    ).toEqual([]);
  });
});
