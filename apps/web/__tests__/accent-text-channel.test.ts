import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * THE ACCENT CHANNEL, ENFORCED.
 *
 * Every brand accent exists twice: a FILL (`--color-red`), tuned to sit under
 * something, and a TEXT tone (`--red-text`), tuned to be legible on the card.
 * `lib/ui.tsx` maps between them — but only for the RAW HEX constants
 * (`txt(RED)`). The Aurora screens use a different idiom, `C("red")` →
 * `var(--color-red)`, which that mapping never saw, so 78 call sites quietly
 * painted glyphs in the fill.
 *
 * What that cost, measured against the card: `blue` #3c787e is 3.59:1 —
 * and the type scale here runs 10–14px, so WCAG's large-text exemption (3:1)
 * covers none of it.
 *
 * A reviewer cannot hold that distinction in their head across 32 files, so it
 * is a test instead: no `color:` may resolve to an accent FILL. Backgrounds,
 * borders, bar segments and body-map areas still take `C(...)`/`roleVar` — this
 * only ever looks at the `color` property.
 */

const ACCENTS = ["lime", "blue", "violet", "amber", "red"] as const;

/** `color: C("red")` — a glyph painted in a fill. Never legitimate. */
const FILL_AS_TEXT = new RegExp(`color:\\s*C\\("(${ACCENTS.join("|")})"\\)`, "g");
/** The same mistake written out longhand. */
const VAR_AS_TEXT = new RegExp(`color:\\s*"?var\\(--color-(${ACCENTS.join("|")})\\)`, "g");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const ROOT = join(__dirname, "..");
const FILES = [join(ROOT, "components"), join(ROOT, "app"), join(ROOT, "lib")].flatMap((d) => walk(d));

describe("accent colours are drawn in the TEXT channel, never the fill", () => {
  it("finds source to check (guards against a silently empty sweep)", () => {
    expect(FILES.length).toBeGreaterThan(50);
  });

  for (const [name, re] of [["C(\"accent\")", FILL_AS_TEXT], ["var(--color-accent)", VAR_AS_TEXT]] as const) {
    it(`no \`color:\` resolves to an accent fill via ${name}`, () => {
      const hits: string[] = [];
      for (const f of FILES) {
        const src = readFileSync(f, "utf8");
        for (const line of src.split("\n")) {
          // The rule is documented in lib/ui.tsx, which necessarily quotes the
          // very pattern it forbids.
          if (line.trimStart().startsWith("*") || line.trimStart().startsWith("//")) continue;
          const m = line.match(new RegExp(re.source));
          if (m) hits.push(`${f.slice(ROOT.length + 1)}: ${line.trim().slice(0, 100)}`);
        }
      }
      expect(hits, `use accentText("…") / roleText(role) for glyphs:\n${hits.join("\n")}`).toEqual([]);
    });
  }
});
