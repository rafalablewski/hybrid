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

  it("gives the reading a door on every screen that states it", () => {
    // The ring's whole claim is that it can be questioned. A host that states
    // the day's reading must therefore also mount the explanation it opens —
    // otherwise we are back to a figure with no derivation, which is the state
    // Today was in. The HOST CHANGED in Aug 2026 (the day card became the day
    // band) and the rule did not: it binds whatever draws the reading to the
    // sheet, by shape rather than by name, so the next host inherits it.
    const hosts = files.filter((p) => /<AuroraDayBand\b/.test(code(p)));
    expect(hosts.length, "nothing states the day's reading").toBeGreaterThan(0);
    for (const p of hosts) {
      expect(/<ReadinessDaySheet\b/.test(code(p)), `${relative(MOBILE, p)} states the reading but opens nothing`).toBe(true);
    }
  });

  it("keeps the day band edgeless, and its ink out of the cool greys", () => {
    // TWO RULES THAT WILL BE "FIXED" BACK BY SOMEONE ACTING IN GOOD FAITH, which
    // is exactly what this file is for.
    //
    // NO BORDER. A quiet band ramps to a fully transparent last stop and a
    // filled one resolves inside its foot; both END by arriving at the page
    // ground. It shipped instead as a flat wash with a 1px rule across the
    // bottom, which composited to a warm line at roughly three times the
    // ground's luminance, run edge to edge under the tallest object on the
    // screen. A hairline separates two surfaces that BOTH continue — here the
    // surface stops, so the rule had nothing on its far side to belong to. A
    // band that dissolves can look unfinished to someone who has not read
    // day-fold.ts, and the first instinct is to draw the line back.
    //
    // AND NO `ash`. The numeral used to be drawn in it: a COOL grey on a WARM
    // ground at low chroma, which is what actually made the band read as dirty.
    // Every line takes the band's own ink held back by inkHold() now, so a
    // second tone is a second bug — and `ash` is the app's default reach for a
    // secondary, which is precisely why it needs a guard rather than a comment.
    const band = files.find((p) => relative(MOBILE, p).split("\\").join("/") === "components/aurora/day-band.tsx");
    expect(band, "the day band moved — point this rule at it").toBeTruthy();
    const src = code(band!);
    expect(/border[A-Za-z]*Width/.test(src), "the band ends at the ground, never at a rule").toBe(false);
    expect(/\bC\.ash\b/.test(src), "the band has one ink, held back — not a second grey").toBe(false);
  });

  it("keeps the straightened bar inside the explanation, and nowhere else", () => {
    // THE BAR IS PROOF, AND PROOF NEEDS ITS LEDGER. On the old card face it sat
    // under a hairline with "Kept 64 / Spent 36" beneath its ends: one number
    // stated twice, beside runs that nothing on that surface named. It belongs
    // directly above the ledger that names every run in it — which is to say,
    // in the sheet. A face that draws it again is re-making the argument the
    // band exists to replace.
    const allowed = new Set(["components/aurora/readiness-ring.tsx", "components/aurora/readiness-day-sheet.tsx"]);
    const drawers = files
      .filter((p) => /<ReadinessBar\b/.test(code(p)))
      .map((p) => relative(MOBILE, p).split("\\").join("/"));
    expect(drawers.filter((r) => !allowed.has(r)), "the bar belongs in the sheet, above its ledger").toEqual([]);
  });
});
