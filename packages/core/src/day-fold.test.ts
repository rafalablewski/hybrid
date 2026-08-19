import { describe, expect, it } from "vitest";
import { FOLD, FOLD_RISE, bandHue, barLatched, foldProgress } from "./day-fold";
import { TRAINING_KINDS, type DayBand } from "./day-band";
import { ROLE_COLOR, type SemanticRole } from "./semantic";

const band = (rung: DayBand["rung"], fill: DayBand["fill"] = null): Pick<DayBand, "fill" | "rung"> =>
  ({ rung, fill });

describe("the fold's ramp", () => {
  it("is flat until the field has a reason to move", () => {
    expect(foldProgress(0)).toBe(0);
    expect(foldProgress(FOLD.start)).toBe(0);
    expect(foldProgress(FOLD.start - 1)).toBe(0);
  });

  it("reaches 1 exactly at the end, and stays there", () => {
    expect(foldProgress(FOLD.end)).toBe(1);
    expect(foldProgress(FOLD.end + 400)).toBe(1);
  });

  it("rises monotonically across the compression", () => {
    let prev = -1;
    for (let y = 0; y <= FOLD.end + 20; y += 4) {
      const p = foldProgress(y);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
  });

  it("never returns a value a transform cannot use", () => {
    for (const y of [-500, -1, 0, 77, 132, 1e6, 0.5]) {
      const p = foldProgress(y);
      expect(Number.isFinite(p)).toBe(true);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });
});

describe("the bar's latch", () => {
  it("arrives at barIn and not before", () => {
    expect(barLatched(FOLD.barIn, false)).toBe(false);
    expect(barLatched(FOLD.barIn + 1, false)).toBe(true);
  });

  it("holds on the way back up until barOut", () => {
    expect(barLatched(FOLD.barIn - 20, true)).toBe(true);
    expect(barLatched(FOLD.barOut + 1, true)).toBe(true);
    expect(barLatched(FOLD.barOut, true)).toBe(false);
  });

  it("cannot strobe: no offset both mounts and dismisses", () => {
    // The gap between the two thresholds is the whole point of having two.
    expect(FOLD.barOut).toBeLessThan(FOLD.barIn);
    // Strictly inside the band the answer depends ONLY on where it already was.
    // The bounds themselves belong to the state they hand over to: barOut is
    // the offset that DROPS a latched bar, barIn the one a rising offset must
    // pass, so neither is "inside".
    for (let y = FOLD.barOut + 1; y <= FOLD.barIn; y += 1) {
      expect(barLatched(y, true)).toBe(true);
      expect(barLatched(y, false)).toBe(false);
    }
  });

  it("settles after one crossing, in both directions", () => {
    let up = false;
    for (const y of [0, 60, 120, 140, 200]) up = barLatched(y, up);
    expect(up).toBe(true);
    for (const y of [140, 120, 100, 90, 0]) up = barLatched(y, up);
    expect(up).toBe(false);
  });
});

describe("the field's rows leave in order", () => {
  it("travels the head of the field furthest, the instruction least", () => {
    // The question must not outlive the answer: the wordmark row goes first.
    expect(FOLD_RISE.chrome).toBeGreaterThan(FOLD_RISE.title);
    expect(FOLD_RISE.hub).toBeGreaterThan(FOLD_RISE.date);
    for (const v of Object.values(FOLD_RISE)) expect(v).toBeLessThan(0);
  });
});

describe("the day's hue", () => {
  it("takes the reading's own role whenever the field is filled", () => {
    const roles: SemanticRole[] = ["go", "info", "caution", "danger"];
    for (const r of roles) expect(bandHue(band("order", r))).toBe(ROLE_COLOR[r]);
  });

  it("takes the subject's colour on a rung that only reports", () => {
    expect(bandHue(band("protect"))).toBe("amber"); // a calendar fact
    expect(bandHue(band("rest"))).toBe("blue"); //     recovery
    expect(bandHue(band("done"))).toBe("lime"); //     a day already trained
  });

  it("draws nothing when the band draws nothing", () => {
    expect(bandHue(band("none"))).toBeNull();
  });

  it("answers for every rung the ladder can produce", () => {
    const rungs: DayBand["rung"][] = ["deload", "protect", "rest", "order", "single", "open", "done"];
    for (const rung of rungs) {
      expect(bandHue(band(rung))).not.toBeNull();
      expect(bandHue(band(rung, "caution"))).toBe("amber");
    }
  });

  it("never answers with the neutral — a day always has a colour", () => {
    // `ash` is the muted TEXT tone, not an accent; a bar filled with it would
    // be a grey slab claiming to be a state.
    const rungs: DayBand["rung"][] = ["deload", "protect", "rest", "order", "single", "open", "done"];
    for (const rung of rungs) expect(bandHue(band(rung))).not.toBe("ash");
  });

  it("is a real accent key, so a client can look it up without a fallback", () => {
    const KEYS = ["lime", "blue", "amber", "red"];
    for (const rung of ["deload", "protect", "rest", "order", "single", "open", "done"] as const) {
      expect(KEYS).toContain(bandHue(band(rung)));
    }
    // and the training kinds the band can mark are untouched by any of this
    expect(TRAINING_KINDS.length).toBeGreaterThan(0);
  });
});
