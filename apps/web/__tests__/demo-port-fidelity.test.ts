import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { strengthSetSummary, displayLoad, rpeRirSwap, type WeightUnit } from "@hybrid/core";

// ---------------------------------------------------------------------------
// THE DEMO-PORT GUARD
//
// design/rpe-fix-walkthrough.html is an interactive walkthrough of the live
// logger's RPE fix: a working set-logging simulation with a BEFORE/AFTER build
// switch, so the reader can bank a set on each build and watch the effort
// either survive the collapse or evaporate. To do that in a standalone page it
// re-implements four functions in plain JS — displayLoad, rpeRirSwap, the
// shared strengthSetSummary, and the private load × reps line the ledger row
// used to build for itself.
//
// The page tells the reader those are faithful ports of the real source. That
// sentence is the entire value of the demo: a simulation that quietly disagrees
// with the code is worse than no simulation, because it is convincing. And a
// hand-copied port rots the first time anyone touches the original.
//
// So this reads the demo's OWN JavaScript out of the file — everything between
// its PORT:START / PORT:END markers — evaluates it, and sweeps it against
// @hybrid/core across every lift, load, rep count, unit and style the page can
// render. Nothing is duplicated here; if the two ever disagree, one of them is
// wrong and this says which case.
//
// If the demo is ever deleted, delete this with it.
// ---------------------------------------------------------------------------

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const DEMO = join(REPO, "design", "rpe-fix-walkthrough.html");

type Set = { load: string; reps: string };
type Port = {
  displayLoad: (kg: string, u: string) => string;
  rpeRirSwap: (v: string, asRir: boolean) => string;
  strengthSetSummary: (name: string, s: Set, opts?: { style?: string; units?: string }) => string;
  oldRowSummary: (name: string, s: Set, units: string) => string;
  LIFTS: Record<string, { mode: string; measure: string }>;
  RPE_SCALE: { rpe: number; rir: string }[];
};

/** The demo's ports, lifted out of the page and made callable. */
function loadPort(): Port {
  const html = readFileSync(DEMO, "utf8");
  const m = html.match(/\/\* PORT:START \*\/([\s\S]*?)\/\* PORT:END \*\//);
  if (!m) throw new Error(`${DEMO}: PORT:START / PORT:END markers not found — did the demo's script change shape?`);
  const exports = "return { displayLoad, rpeRirSwap, strengthSetSummary, oldRowSummary, LIFTS, RPE_SCALE };";
  return new Function(`"use strict";${m[1]}\n${exports}`)() as Port;
}

const port = loadPort();

// Every axis the page can put on screen: its six lifts (one per load mode and
// measure), loads spanning blank / zero / whole / half-kg, the rep counts its
// seeds use, and both units.
const LOADS = ["", "0", "7.5", "20", "32", "100", "102.5"];
const REPS = ["", "1", "5", "8", "12", "40", "45"];
const UNITS: WeightUnit[] = ["kg", "lb"];

describe("design/rpe-fix-walkthrough.html — the ports are the real thing", () => {
  it("exports the four functions and the six-lift table it claims to", () => {
    expect(typeof port.strengthSetSummary).toBe("function");
    expect(typeof port.oldRowSummary).toBe("function");
    expect(Object.keys(port.LIFTS).length).toBe(6);
    // One lift per load mode, so the demo's picker actually covers the space.
    expect(new Set(Object.values(port.LIFTS).map((l) => l.mode)))
      .toEqual(new Set(["external", "assisted", "bodyweight-plus", "bodyweight"]));
    expect(new Set(Object.values(port.LIFTS).map((l) => l.measure)))
      .toEqual(new Set(["reps", "time", "distance"]));
  });

  it("displayLoad agrees with core on every load × unit", () => {
    for (const load of [...LOADS, "1.25", "abc"])
      for (const u of UNITS)
        expect(port.displayLoad(load, u), `displayLoad(${JSON.stringify(load)}, ${u})`).toBe(displayLoad(load, u));
  });

  it("rpeRirSwap agrees with core on every scale step, both directions", () => {
    const values = [...port.RPE_SCALE.map((s) => String(s.rpe)), "", "abc"];
    for (const v of values)
      for (const asRir of [true, false])
        expect(port.rpeRirSwap(v, asRir), `rpeRirSwap(${JSON.stringify(v)}, ${asRir})`).toBe(rpeRirSwap(v, asRir));
  });

  it("strengthSetSummary agrees with core across every lift × load × reps × unit × style", () => {
    let checked = 0;
    for (const name of Object.keys(port.LIFTS))
      for (const load of LOADS)
        for (const reps of REPS) {
          const s: Set = { load, reps };
          const where = `${name} load=${JSON.stringify(load)} reps=${JSON.stringify(reps)}`;
          expect(port.strengthSetSummary(name, s), `compact — ${where}`).toBe(strengthSetSummary(name, s));
          checked++;
          for (const units of UNITS) {
            expect(port.strengthSetSummary(name, s, { style: "row", units }), `row ${units} — ${where}`)
              .toBe(strengthSetSummary(name, s, { style: "row", units }));
            checked++;
          }
        }
    expect(checked).toBe(6 * LOADS.length * REPS.length * 3);
  });

  it("the demo's six lifts resolve in the real exercise DB with the modes it claims", () => {
    // The page prints the load mode beside each lift. If a lift were renamed in
    // exercise-db.ts, core would fall back to "external" and the demo's table
    // would confidently describe a lift that no longer exists.
    for (const [name, meta] of Object.entries(port.LIFTS)) {
      const out = strengthSetSummary(name, { load: "20", reps: "5" });
      if (meta.mode === "assisted") expect(out, name).toBe("−20×5");
      else if (meta.mode === "bodyweight-plus") expect(out, name).toBe("+20×5");
      else if (meta.mode === "bodyweight") expect(out, name).not.toContain("×");
      else expect(out, name).toBe("20×5");
    }
  });

  it("still reproduces the drift the demo exists to show", () => {
    // The whole point of keeping the old formatter in the page: an assisted
    // lift used to read as if the load had been ADDED. If this ever stops
    // being true the demo's BEFORE build has nothing to demonstrate.
    const s: Set = { load: "20", reps: "5" };
    expect(port.oldRowSummary("Assisted Pull-Up", s, "kg")).toBe("20 kg × 5 reps");
    expect(port.strengthSetSummary("Assisted Pull-Up", s, { style: "row", units: "kg" })).toBe("−20 kg × 5 reps");
    // ...and that it is a genuine fix, not a cosmetic one: core agrees.
    expect(strengthSetSummary("Assisted Pull-Up", s, { style: "row", units: "kg" })).toBe("−20 kg × 5 reps");
  });
});
