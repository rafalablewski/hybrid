import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// THE MEASURED DRAWER — the one trap a mobile disclosure can fall into
//
// A mobile drawer has no `0fr → 1fr` grid row to open on (that is how the web
// twin does it, globals.css `.motion-drawer`), so it MEASURES its panel and
// interpolates a height. That measurement is taken while the drawer is clipped
// — and a box clipped to EXACTLY 0 does not let an in-flow child overflow it:
// Yoga reads a zero available main size as an at-most-0 constraint and lays the
// child out at 0 as well. (Any height ABOVE zero overflows normally; 0 is the
// one value that clamps, which is why it reads as correct.)
//
// So a panel measured IN FLOW inside a drawer pinned to 0 measures 0, the height
// it would open to is 0, and the drawer never moves — while the chevron and the
// label, which measure nothing, keep toggling over a card that never opens.
// That shipped twice: Volume's compact card on Performance, and the Activity
// card's figures on Today, each with its own copy of the same measured drawer.
//
// There are exactly two ways to be safe, and a measured collapse must pick one:
//   • take the panel OUT OF FLOW while the drawer carries a height (ADrawer), or
//   • never pin the drawer to 0 while the measurement is still 0 (fall back to
//     `auto`, which is what percent-program's Collapse does).
// Neither can be proven by a regex, so this test does what parity.test.ts does
// with nav gaps: it finds EVERY measured collapse on mobile and makes each one
// name, in writing, which of the two it relies on. A new hand-rolled copy fails
// until someone has had to answer the question.
// ---------------------------------------------------------------------------

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MOBILE = join(APP_ROOT, "..", "..", "apps", "mobile");
const AURORA = join(MOBILE, "components", "aurora");

const kit = readFileSync(join(AURORA, "kit.tsx"), "utf8");

/**
 * Every mobile file that measures a height with onLayout AND drives a height
 * from an Animated value, with the reason it does not fall into the trap.
 * Adding a file here is the point: you cannot ship a measured collapse without
 * stating which of the two escapes it takes.
 */
const MEASURED: Record<string, string> = {
  "components/aurora/kit.tsx":
    "ADrawer — the shared drawer. Its panel is positioned ABSOLUTELY for every state that pins a height, so it measures its true height even fully closed.",
  "components/percent-program.tsx":
    "Collapse — the program accordion. Takes the other escape: while open and still unmeasured its height falls back to `undefined` (auto), so the box is never pinned to 0 with an unmeasured panel. TODO fold into ADrawer (capability drawer-collapse-merge).",
  "components/aurora/sheet.tsx":
    "The sheet measures its header and its content INSIDE a panel pinned to the full `large` height — a positive box, never one clipped to 0. The measurement decides where the panel RESTS (its translateY), not whether it has room to lay out, so an unmeasured sheet is off-screen rather than collapsed.",
  // components/aurora/hero.tsx was here. HeroScreen no longer measures
  // anything: its sub-rail's dock point is DERIVED from the hero's geometry
  // (core's heroRailPin), and the height it used to read was already dead. The
  // registry-may-not-rot assertion below is what caught the stale entry.
  "components/plan-hero.tsx":
    "Same as hero.tsx — the plan screen's rail height for the collapse offset, measured in an auto-height parent.",
  "components/aurora/rolling-number.tsx":
    "RollingNumber's digit column measures its own height to slide a face by exactly one glyph. It pins NO height at all: the incoming face is in flow and defines the box (the outgoing one is absolutely positioned over it), so the measured box is the glyph's real height and never a clipped 0. An unmeasured first frame translates by 0 — the digit simply appears — rather than collapsing.",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe("mobile ADrawer — the measured disclosure", () => {
  it("is the kit's, exported once", () => {
    expect(kit).toMatch(/export function ADrawer\(/);
  });

  it("measures its panel OUT OF FLOW whenever the drawer carries a height", () => {
    // The panel that onLayout reads must be positioned absolutely in exactly
    // the states that pin an explicit height — otherwise a closed drawer
    // measures 0 and can never open.
    expect(kit).toMatch(/const DRAWER_PANEL_CLIPPED[^=]*=\s*\{\s*position:\s*"absolute"/);

    const drawer = kit.slice(kit.indexOf("export function ADrawer("));
    // `flowing` is the single flag: the drawer takes its height FROM the panel
    // (auto, panel in flow) or pins one of its own (panel out of flow).
    expect(drawer).toMatch(/const flowing =/);
    expect(drawer).toMatch(/style=\{flowing \? null : DRAWER_PANEL_CLIPPED\}/);
    // …and it is that same panel that is measured.
    const panel = drawer.slice(drawer.indexOf("DRAWER_PANEL_CLIPPED}"));
    expect(panel).toMatch(/onLayout=\{\(e\) => setPanelH\(/);
  });

  it("every measured collapse on mobile has stated how it escapes the trap", () => {
    // Deliberately broad: it flags anything that measures a height and animates
    // one, not just something shaped like today's drawers — a copy written with
    // the interpolation assigned to a variable first is exactly how the last one
    // would have slipped past a narrower pattern.
    const found = walk(MOBILE)
      .filter((f) => {
        const s = readFileSync(f, "utf8");
        return /layout\.height/.test(s) && /\.interpolate\(/.test(s);
      })
      .map((f) => relative(MOBILE, f).split(/[\\/]/).join("/"));

    expect(found.filter((f) => !(f in MEASURED))).toEqual([]);
    // …and the registry may not rot: every entry must still be a real one.
    expect(Object.keys(MEASURED).filter((f) => !found.includes(f))).toEqual([]);
  });
});
