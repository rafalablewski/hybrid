import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { colors, FEEDBACK, THEMES } from "@hybrid/core";

/**
 * THE MIRROR, DIFFED — the guard `palette.ts` says out loud that it does not have.
 *
 * Its header reads: "MIRRORED by apps/web/app/globals.css (the `:root` defaults).
 * Keep the two in lockstep — the contrast test guards the ratios, but it can only
 * see THIS file." That last clause is an admission, and it had been true for as
 * long as both files existed. CSS cannot import a TypeScript object, so every
 * palette value lives twice, and the second copy was checked by nobody.
 *
 * IT IS THE #2a2d2a FAILURE, ONE LEVEL UP. audit/12 §5.3 found a retired hairline
 * still drawing on the web crash pages — one copy of a colour that rotted because
 * nothing diffed it. fallback-palette.test.ts now covers the six pages that copy
 * values INTO components; this covers the stylesheet that copies them into CSS,
 * which is the bigger copy and the one every admin screen reads.
 *
 * The precedent is already here: motion-tokens, screen-gutter and drawer-measure
 * all read globals.css and diff it against core. Colour was the axis that never
 * got one, which is why it is also the axis that drifted.
 *
 * BOTH DIRECTIONS, and the second is the one that catches a fork:
 *   → every var below must equal its core value, and
 *   → every `--color-*` the stylesheet declares must be a colour core still has,
 *     so a var cannot outlive the token it mirrors (which is exactly what
 *     `--color-violet` and `--color-gold` would have done).
 *
 * COMMENT-BLIND, and the first run is why. The scan matched `--color-gold` inside
 * the very comment that explains that token was retired ("There is no
 * --color-violet and no --color-gold: both were near-duplicates…") — prose that
 * happens to put a colon after a name reads as a declaration. Stripping comments
 * first is the same discipline the mobile ratchets already use: a value quoted in
 * an explanation is not a value anybody renders.
 */
const css = readFileSync(join(__dirname, "..", "app", "globals.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

/** `--name: value;` as declared anywhere in the stylesheet. */
function declared(name: string): string | null {
  const m = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(css);
  return m ? m[1]!.trim().toLowerCase() : null;
}

/** Every `--color-*` the stylesheet declares. */
function declaredColorVars(): string[] {
  return [...css.matchAll(/--color-([a-z0-9-]+)\s*:/g)].map((m) => m[1]!);
}

const t = THEMES.dark;

/** var → the core value it is a copy of. */
const MIRROR: Record<string, string> = {
  "--color-ink": colors.ink,
  "--color-ink2": colors.ink2,
  "--color-line": colors.line,
  "--color-chalk": colors.chalk,
  "--color-ash": colors.ash,
  "--color-lime": colors.lime,
  "--color-blue": colors.blue,
  "--color-amber": colors.amber,
  "--color-red": colors.red,
  "--lime-text": t.accentText.lime,
  "--blue-text": t.accentText.blue,
  "--amber-text": t.accentText.amber,
  "--red-text": t.accentText.red,
  "--on-accent": t.onAccent,
  "--feedback-success": FEEDBACK.success,
  "--feedback-warning": FEEDBACK.warning,
  "--feedback-error": FEEDBACK.error,
  "--feedback-info": FEEDBACK.info,
};

describe("globals.css mirrors the core palette", () => {
  for (const [name, want] of Object.entries(MIRROR)) {
    it(`${name} is ${want}`, () => {
      const got = declared(name);
      expect(got, `${name} is not declared in globals.css at all`).not.toBeNull();
      expect(got, `${name} has drifted from core — edit the token, then mirror it here`).toBe(
        want.toLowerCase(),
      );
    });
  }

  it("declares no --color-* that core no longer has", () => {
    const known = new Set(Object.keys(colors));
    const orphans = declaredColorVars().filter((n) => !known.has(n));
    expect(
      orphans,
      "these CSS vars mirror a token that no longer exists. A var that outlives its " +
        "token is how the stylesheet keeps painting a retired colour — delete them.",
    ).toEqual([]);
  });

  it("mirrors every accent core has, so a new one cannot be web-invisible", () => {
    const mirrored = new Set(declaredColorVars());
    const missing = Object.keys(colors).filter((k) => !mirrored.has(k));
    expect(
      missing,
      "core holds these tokens and globals.css does not mirror them, so the admin " +
        "panel cannot draw them. Add the var (and this test will hold it).",
    ).toEqual([]);
  });

  /**
   * The glow is the accent as a BARE `r, g, b` triple, because it drops into
   * `rgba(var(--glass-glow-rgb), …)`. A hand-converted copy of a hex is the most
   * rottable form a colour can take — it does not even look like the value it
   * mirrors — so it is derived and compared here rather than trusted.
   */
  it("--glass-glow-rgb is the accent, converted", () => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(colors.lime.slice(i, i + 2), 16));
    const got = declared("--glass-glow-rgb")?.replace(/\s+/g, "");
    expect(got, "the glass glow has drifted from the accent").toBe(`${r},${g},${b}`);
  });
});
