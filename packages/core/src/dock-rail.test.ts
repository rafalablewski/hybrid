import { describe, it, expect } from "vitest";
import { DOCK_RAIL, dockChipOn } from "./dock-rail";
import { fs, space, track } from "./scale";

describe("the dock rail contract", () => {
  it("clears the 44dp hit-target floor", () => {
    // Three of the four rails this replaces sat at ~29 / ~33 / ~33. This is the
    // one value here a user can actually feel, so it is the one asserted first.
    expect(DOCK_RAIL.chip.hit).toBeGreaterThanOrEqual(44);
  });

  it("takes every number from the scale, not from a call site", () => {
    expect(DOCK_RAIL.gap).toBe(space.sm);
    expect(DOCK_RAIL.padY).toBe(space.ms);
    expect(DOCK_RAIL.chip.padX).toBe(space.lg);
    expect(DOCK_RAIL.chip.size).toBe(fs.caption);
  });

  it("sets no tracking — a rail label is a word, not a kicker", () => {
    // Deliberately 0, not the small-copy band's +0.1 — see the note on the token.
    expect(DOCK_RAIL.chip.tracking).toBe(0);
    expect(DOCK_RAIL.chip.tracking).toBe(0);
  });

  it("tints the selected chip rather than filling it solid", () => {
    // Web shipped a SOLID lime pill with dark text; mobile shipped this. The
    // tint wins — a rail is chrome and must not out-shout the cards under it.
    expect(DOCK_RAIL.tint).toBeGreaterThan(0);
    expect(DOCK_RAIL.tint).toBeLessThan(0.25);
  });
});

describe("dockChipOn — the one difference the rails are allowed to have", () => {
  it("turns a mode chip on when it is selected", () => {
    expect(dockChipOn("mode", true)).toBe(true);
    expect(dockChipOn("mode", false)).toBe(false);
    expect(dockChipOn("mode", undefined)).toBe(false);
  });

  it("NEVER turns an anchor chip on, even when a caller says selected", () => {
    // The guarantee, mechanically. A jump chip that lights up is claiming a
    // selection it does not have: pressing "Endurance" and still seeing
    // Strength above it is a broken promise, and it is why the unify-both-rails
    // option was rejected. A call site cannot reintroduce it by passing a prop.
    expect(dockChipOn("anchor", true)).toBe(false);
    expect(dockChipOn("anchor", false)).toBe(false);
    expect(dockChipOn("anchor", undefined)).toBe(false);
  });
});
