import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// THE CONSOLE AND ITS OWN EXPLANATION MUST DESCRIBE ONE ATHLETE
//
// The Engine Room renders a state, and the "Explain this athlete" card narrates
// it. They are two computations of the same thing, which is exactly the shape
// that drifts — and it did, twice, in the same change:
//
//   1. THE INPUTS. The panel passed `heatSignals` and the fuel read into
//      computeEngineTrace; the explain route did not. So the route built a
//      trace with heatAdj and fuelAdj at ZERO and narrated it beside a panel
//      showing the real score. On the sample athlete the two printed readiness
//      71 and 67 — and because the narrative is grounded only on what it is
//      handed, it attributed the missing points to the causes it could see.
//
//   2. THE WHAT-IF. The panel has sliders for load, three wearable metrics, a
//      simulated sauna, "no wearable" and eating-as-%-of-maintenance. The
//      explain request forwarded the first four. An operator simulating a cut
//      got an explanation of the UNTRANSFORMED athlete, captioned "No what-if
//      is active — this is the live state".
//
// Both are silent failures: the output is fluent, plausible prose about numbers
// that are not on screen. Nothing type-checks them, because passing fewer
// options to a function with optional options is legal, and so is sending a
// subset of a JSON body. So they are guarded here, at the source, the same way
// the dead-pointer and parity guards in this folder work.
//
// These assertions are deliberately about STRUCTURE, not wording: they check
// that the two surfaces name the same inputs, never how the prose reads.
// ---------------------------------------------------------------------------

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(join(here, "..", p), "utf8");

const ROUTE = "app/api/admin/engine/explain/route.ts";
const PANEL = "components/admin/engine-room.tsx";

describe("the explain route builds the trace the panel builds", () => {
  const route = read(ROUTE);

  it("feeds computeEngineTrace BOTH signal streams the score reads", () => {
    // The call itself, not merely an import — the streams were imported and
    // unused for the whole life of the bug.
    const call = route.slice(route.indexOf("const trace = computeEngineTrace"));
    const opts = call.slice(0, call.indexOf("});") + 3);
    expect(opts, "the explain trace must pass the heat rows").toContain("heatSignals");
    expect(opts, "the explain trace must pass the fuel read").toContain("fuel");
    expect(opts, "…and the same clock, so the decay and the intake window agree").toContain("now");
  });

  it("computes the fuel read from the athlete's own rows, not a default", () => {
    expect(route).toContain("fuelAdjustment(nutritionSignals");
  });

  it("reads the REAL athlete's streams when a user is named", () => {
    // athleteInputs returns both; a route that fetched a user and then narrated
    // the sample athlete's diary would be worse than one that narrated neither.
    expect(route).toContain("heatSignals = inputs.heatSignals");
    expect(route).toContain("nutritionSignals = inputs.nutritionSignals");
  });

  it("names every readiness adjustment in the prompt, so none is attributed elsewhere", () => {
    const prompt = route.slice(route.indexOf("const userMsg ="));
    for (const term of ["bioAdj", "heatAdj", "fuelAdj"]) {
      expect(prompt, `the prompt must state ${term}`).toContain(term);
    }
  });

  it("describes an unmeasurable fuel term as ABSENT rather than as zero", () => {
    // "Eats at maintenance" and "logs nothing usable" both render as no arc on
    // every athlete-facing surface. A narrative that conflates them tells the
    // operator something false about an athlete who has said nothing.
    expect(route).toContain("NOT MEASURED");
    expect(route).toMatch(/ABSENT, not zero/);
  });

  it("carries both terms in the deterministic fallback too", () => {
    // The fallback is what an operator actually reads until ANTHROPIC_API_KEY
    // is set, so it cannot be the honest path's poor relation.
    const lines = route.slice(route.indexOf("const engineLines"));
    const arr = lines.slice(0, lines.indexOf("];"));
    expect(arr).toContain("fuelLine");
    expect(arr).toContain("heatLine");
  });
});

describe("every slider the panel can move reaches the explanation", () => {
  const panel = read(PANEL);
  const route = read(ROUTE);

  /** The what-if's own field list, read off the panel's OFF constant so this
   *  can never fall behind a slider someone adds. */
  const fields = (() => {
    const start = panel.indexOf("const WHATIF_OFF");
    const block = panel.slice(start, panel.indexOf("};", start));
    return [...block.matchAll(/(\w+)\s*:/g)].map((m) => m[1]!).filter((f) => f !== "WHATIF_OFF");
  })();

  it("finds the panel's what-if fields", () => {
    // A sanity check on the scrape itself: if this ever reads zero fields the
    // assertions below would all pass vacuously.
    expect(fields.length).toBeGreaterThanOrEqual(8);
    expect(fields).toContain("intakePct");
    expect(fields).toContain("noWearable");
  });

  const body = (() => {
    const at = panel.indexOf('fetch("/api/admin/engine/explain"');
    return panel.slice(at, panel.indexOf("});", at));
  })();

  it.each(fields)("the explain request forwards %s", (f) => {
    expect(body, `the panel simulates ${f} but never sends it`).toContain(f);
  });

  it.each(fields)("the route accepts %s rather than dropping it", (f) => {
    const sanitizer = route.slice(route.indexOf("const whatIf"), route.indexOf("const whatIfActive"));
    expect(sanitizer, `${f} arrives but is sanitized away`).toContain(f);
  });

  it("treats the new sliders as making a what-if ACTIVE", () => {
    // Otherwise the state is transformed and still captioned "this is the live
    // state" — the caption being wrong is worse than the transform being absent.
    const active = route.slice(route.indexOf("const whatIfActive"), route.indexOf("// Assemble inputs"));
    expect(active).toContain("heatMinutes");
    expect(active).toContain("intakePct");
    expect(active).toContain("noWearable");
  });
});
