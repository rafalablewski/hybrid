import { describe, it, expect } from "vitest";
import { states, shakeOffsets, durations } from "./motion";

/**
 * §17's state-change vocabulary. The numbers are assertable; what matters more
 * is the SHAPE of the shake, which is the one piece of it with a rule that can
 * be got wrong silently.
 */

describe("shakeOffsets", () => {
  it("starts and ends at rest", () => {
    // A shake that ends off-centre has MOVED the thing it was only supposed to
    // draw attention to — and on a button, permanently.
    const o = shakeOffsets();
    expect(o[0]).toBe(0);
    expect(o[o.length - 1]).toBe(0);
  });

  it("alternates direction", () => {
    const swings = shakeOffsets().slice(1, -1);
    swings.forEach((v, i) => expect(Math.sign(v)).toBe(i % 2 === 0 ? 1 : -1));
  });

  it("decays, so the last swing is smaller than the first", () => {
    // A constant-amplitude shake reads as a broken animation loop rather than
    // as an object recoiling.
    const swings = shakeOffsets().slice(1, -1).map(Math.abs);
    for (let i = 1; i < swings.length; i++) expect(swings[i]!).toBeLessThan(swings[i - 1]!);
  });

  it("never exceeds the declared amplitude", () => {
    for (const v of shakeOffsets()) expect(Math.abs(v)).toBeLessThanOrEqual(states.shakeDx);
  });

  it("runs two swings per cycle", () => {
    expect(shakeOffsets(4, 3)).toHaveLength(3 * 2 + 2);   // + the rest at each end
    expect(shakeOffsets(4, 1)).toHaveLength(1 * 2 + 2);
  });

  it("scales with the amplitude it is given", () => {
    const big = shakeOffsets(12).map(Math.abs);
    const small = shakeOffsets(4).map(Math.abs);
    expect(Math.max(...big)).toBeGreaterThan(Math.max(...small));
  });
});

describe("states", () => {
  it("lets the empty state leave faster than the content arrives", () => {
    // The thing you waited for should feel like it ARRIVES; the placeholder
    // should not feel like it resents going.
    expect(states.emptyOutMs).toBeLessThan(states.emptyInMs);
  });

  it("holds a tick long enough to read", () => {
    expect(states.savedHoldMs).toBeGreaterThan(durations.crossfade);
  });

  it("keeps the whole shake inside the system's motion ceiling", () => {
    expect(states.shakeMs).toBeLessThanOrEqual(450);
  });

  it("dims siblings without hiding them", () => {
    // Editing is a mode, not a modal: the things you are not editing must stay
    // legible enough to be the context you are editing against.
    expect(states.editDim).toBeGreaterThan(0.4);
    expect(states.editDim).toBeLessThan(1);
  });
});
