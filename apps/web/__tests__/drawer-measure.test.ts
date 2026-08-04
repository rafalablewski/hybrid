import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// THE MEASURED DRAWER — the one trap a mobile disclosure can fall into
//
// A mobile drawer has no `0fr → 1fr` grid row to open on (that is how the web
// twin does it, globals.css `.motion-drawer`), so it MEASURES its panel and
// interpolates a height. That measurement is taken while the drawer is clipped
// — and a box clipped to EXACTLY 0 does not let an in-flow child overflow it:
// Yoga reads a zero available main size as an at-most-0 constraint and lays the
// child out at 0 as well. (Any height above zero overflows normally; 0 is the
// one value that clamps.)
//
// So a panel measured IN FLOW inside a closed drawer measures 0, the height it
// would open to is 0, and the drawer never moves — while the chevron and the
// label, which measure nothing, keep toggling over a card that never opens.
// That shipped twice: Volume's compact card on Performance, and the Activity
// card's figures on Today, each with its own copy of the same measured drawer.
//
// The fix is structural: the panel is taken OUT OF FLOW for every state that
// pins a height on the drawer, so it is sized against the drawer's WIDTH alone.
// This test holds that structure, and holds the drawer to ONE implementation —
// a third copy is how the first two came to disagree with each other.
// ---------------------------------------------------------------------------

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MOBILE_AURORA = join(APP_ROOT, "..", "..", "apps", "mobile", "components", "aurora");

const kit = readFileSync(join(MOBILE_AURORA, "kit.tsx"), "utf8");

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

  it("is the ONLY animated-height drawer on mobile", () => {
    // A hand-rolled copy is how the trap spreads: both broken drawers were
    // written from scratch, and both measured in flow. Anything that needs to
    // ease open uses ADrawer.
    const offenders = readdirSync(MOBILE_AURORA)
      .filter((f) => f.endsWith(".tsx") && f !== "kit.tsx")
      .filter((f) => /height:\s*[A-Za-z_$][\w$]*\.interpolate\(/.test(readFileSync(join(MOBILE_AURORA, f), "utf8")));
    expect(offenders).toEqual([]);
  });
});
