import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join, relative } from "node:path";

/**
 * THE ONE-RING GUARD.
 *
 * The readiness ring is the product's signature object: the only figure in the
 * app that accounts for itself, drawn as one run of ticks per cause with the
 * engine guaranteeing that the parts sum to exactly 100
 * (engines/readiness-deficit.ts). An object that carries that claim is only as
 * good as its worst copy — and there were two copies.
 *
 * The Performance screen drew the real thing: the tick ring, the straightened
 * bar, the ledger, the provenance line, and its own private `rolePaint` /
 * `segPaint` / `LedgerRow`, roughly 120 lines of it inside an 865-line file.
 * Today — the screen every athlete opens every morning — drew a bare 44dp gauge
 * of the same number with no tick colours, no label and nothing behind a tap,
 * on one of that screen's four branches. Same day, same engine call, two
 * objects, and the one on the most-used screen was the one that could not
 * explain itself.
 *
 * So the ring lives in ONE component now, and this guard is what stops a third
 * copy appearing the next time a screen wants a readiness dial. It watches the
 * primitives a second copy would have to reach for: the ring's tick runs and
 * the alpha the kept arc is held back to. If you need the ring, import the
 * component; if the component is missing something, add it there.
 *
 * WHY THESE SYMBOLS. `readinessRingSegments` / `readinessRingTicks` /
 * `KEPT_ARC_ALPHA` are load-bearing in a way `readinessDeficit` is not: the
 * deficit is DATA (a screen may legitimately hold the day's split to hand it to
 * the component, and both hosts do), while these three are the DRAWING, and a
 * caller that reaches for them is by definition painting a ring. The kept run
 * wears the readiness band's own colour, which collides with a cause's in every
 * band but the top one — that is why the holding-back travels with the segment
 * instead of being derived at the call site, and why a call site deriving it is
 * exactly the bug worth failing a build over.
 */

const ROOT = resolve(__dirname, "../../..");
const MOBILE = resolve(ROOT, "apps/mobile");

/** The one file allowed to draw the ring, relative to apps/mobile. */
const THE_RING = "components/aurora/readiness-ring.tsx";

/** The drawing primitives. Reaching for one of these IS painting a ring. */
const DRAWING = ["readinessRingSegments", "readinessRingTicks", "KEPT_ARC_ALPHA"];

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) tsxFiles(p, out);
    else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

/** Source with comments stripped — the guard must match CODE, not the prose
 *  that documents what the code stopped doing. Line comments go FIRST: a `//`
 *  comment naming a path like `aurora/*.tsx` contains a `/*`, and stripping
 *  block comments ahead of it opens a phantom block that swallows real code. */
const code = (p: string) =>
  readFileSync(p, "utf8")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

describe("the one-ring guard — the signature object has exactly one implementation", () => {
  const files = tsxFiles(MOBILE).filter((p) => !p.endsWith(".test.ts") && !p.endsWith(".test.tsx"));

  it("finds the ring where it says it is", () => {
    // A guard whose subject has been renamed passes vacuously, which is worse
    // than no guard at all.
    expect(files.map((p) => relative(MOBILE, p))).toContain(THE_RING);
  });

  for (const symbol of DRAWING) {
    it(`draws with ${symbol} in one file only`, () => {
      const users = files
        .filter((p) => new RegExp(`\\b${symbol}\\b`).test(code(p)))
        .map((p) => relative(MOBILE, p));
      expect(users, `${symbol} belongs to ${THE_RING} — import the component, don't repaint it`).toEqual([THE_RING]);
    });
  }

  it("keeps the ledger row and the paint helpers out of the screens", () => {
    // The three private helpers the Performance screen kept beside its copy of
    // the ring. They are exported from the component now, so a screen that
    // wants one has somewhere honest to get it; what must not come back is a
    // second DEFINITION.
    const defs = [/function LedgerRow\b/, /const segPaint\s*=/, /const rolePaint\s*=/];
    for (const p of files) {
      const rel = relative(MOBILE, p);
      if (rel === THE_RING) continue;
      for (const def of defs) {
        expect(def.test(code(p)), `${rel} re-defines ${def.source}`).toBe(false);
      }
    }
  });

  it("gives the ring a door on every screen that draws it", () => {
    // The ring's whole claim is that it can be questioned. A host that renders
    // the card must therefore also mount the explanation it opens — otherwise
    // we are back to a figure with no derivation, which is the state Today was
    // in. Both hosts are checked by the same rule rather than by name, so a
    // third host inherits it.
    const hosts = files.filter((p) => /<ReadinessDayCard\b/.test(code(p)));
    expect(hosts.length, "nothing renders the day object").toBeGreaterThan(0);
    for (const p of hosts) {
      expect(/<ReadinessDaySheet\b/.test(code(p)), `${relative(MOBILE, p)} draws the ring but opens nothing`).toBe(true);
    }
  });
});
