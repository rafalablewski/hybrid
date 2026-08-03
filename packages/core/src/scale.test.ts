import { describe, expect, it } from "vitest";
import { fs, space, lh, leading, tracking, type TypeRole, type SpaceToken } from "./scale";

/**
 * THE SCALE'S OWN GUARD.
 *
 * The design audit's root finding was that the token system is well authored and
 * not enforced — nothing failed when a call site invented a value. Motion was the
 * one healthy axis precisely because motion.test.ts holds it to its own rules.
 * This is the same guard for type, spacing, leading and tracking: it can't stop a
 * screen writing `fontSize: 21`, but it does stop the SCALE itself from growing a
 * rung that breaks the ladder's promises.
 */

const ORDER: TypeRole[] = [
  "nano", "micro", "caption", "body", "bodyLg", "note",
  "subtitle", "title", "heading", "headline", "display", "hero", "stat",
];

const SPACE_ORDER: SpaceToken[] = [
  "none", "xxs", "xs", "sm", "ms", "md", "lg", "xl", "xxl", "xxxl", "huge",
];

describe("type scale", () => {
  it("names every rung exactly once", () => {
    expect(Object.keys(fs).sort()).toEqual([...ORDER].sort());
  });

  it("ascends strictly — no two rungs share a size", () => {
    const sizes = ORDER.map((r) => fs[r]);
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]!, `${ORDER[i]} must exceed ${ORDER[i - 1]}`).toBeGreaterThan(sizes[i - 1]!);
    }
  });

  it("never dips below the legibility floor", () => {
    // 10 is `nano`, and it is the floor on purpose: below it the app's dominant
    // eyebrow style (mono + uppercase + tracked) stops being readable at arm's
    // length. The audit found 98 text nodes at 8–9px; the ladder must not be the
    // thing that legitimises them.
    for (const role of ORDER) expect(fs[role], role).toBeGreaterThanOrEqual(10);
  });

  it("keeps `headline` between a heading and a display", () => {
    expect(fs.headline).toBeGreaterThan(fs.heading);
    expect(fs.headline).toBeLessThan(fs.display);
  });

  it("ends at `stat` — a figure larger than this is a design smell", () => {
    expect(Math.max(...Object.values(fs))).toBe(fs.stat);
  });
});

describe("spacing scale", () => {
  it("starts at zero and ascends strictly", () => {
    const sizes = SPACE_ORDER.map((r) => space[r]);
    expect(sizes[0]).toBe(0);
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]!, `${SPACE_ORDER[i]} must exceed ${SPACE_ORDER[i - 1]}`).toBeGreaterThan(sizes[i - 1]!);
    }
  });

  it("is entirely even — an odd gap can't sit on a half-pixel boundary", () => {
    for (const token of SPACE_ORDER) expect(space[token] % 2, token).toBe(0);
  });
});

describe("leading", () => {
  it("ascends from tight to relaxed", () => {
    expect(lh.tight).toBeLessThan(lh.snug);
    expect(lh.snug).toBeLessThan(lh.normal);
    expect(lh.normal).toBeLessThan(lh.relaxed);
  });

  it("is expressed as a RATIO, so a scaled size carries its line box with it", () => {
    // The Dynamic Type failure mode: an absolute lineHeight leaves the line box
    // where it was when the OS scales the glyphs. Doubling the size must double
    // the leading.
    expect(leading(fs.body)).toBe(Math.round(fs.body * lh.normal));
    expect(leading(fs.body * 2)).toBe(Math.round(fs.body * 2 * lh.normal));
  });

  it("always clears the font size — a line box can't be shorter than its glyphs", () => {
    for (const role of ORDER) {
      expect(leading(fs[role], "tight"), role).toBeGreaterThan(fs[role]);
    }
  });

  it("returns whole dp so text lands on the pixel grid", () => {
    expect(Number.isInteger(leading(15, "relaxed"))).toBe(true);
  });

  it("defaults to `normal`", () => {
    expect(leading(fs.body)).toBe(leading(fs.body, "normal"));
  });
});

describe("tracking", () => {
  it("takes air out of large type and adds it to caps", () => {
    expect(tracking.display).toBeLessThan(0);
    expect(tracking.normal).toBe(0);
    expect(tracking.label).toBeGreaterThan(0);
    expect(tracking.caps).toBeGreaterThan(tracking.label);
  });

  it("codifies the two eyebrow trackings already in use", () => {
    // 0.9 (216 sites) and 1.2 (137 sites) at the time of the audit. Changing
    // either is a deliberate restyle of every kicker in the app, not a tweak.
    expect(tracking.label).toBe(0.9);
    expect(tracking.caps).toBe(1.2);
  });
});
