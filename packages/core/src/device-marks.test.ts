import { describe, it, expect } from "vitest";
import {
  DEVICE_MARKS,
  DEVICE_MARK_HEIGHT,
  DEVICE_MARK_INK,
  deviceMarkFor,
  deviceMarkWidth,
  type DeviceMarkArt,
} from "./device-marks";
import { PROVIDER_DEVICE_KEYS } from "./session-device";
import { colors } from "./theme/tokens";
import { contrastRatio, WCAG } from "./contrast";

// `noUncheckedIndexedAccess` makes every DEVICE_MARKS lookup optional — which
// is the registry behaving correctly, since a caller may ask for a provider we
// don't draw. These two are the fixtures the suite is written against, so assert
// them once here rather than at each use.
const APPLE = DEVICE_MARKS.apple!;
const GARMIN = DEVICE_MARKS.garmin!;

const every = (fn: (art: DeviceMarkArt, name: string) => void) => {
  for (const [provider, set] of Object.entries(DEVICE_MARKS)) {
    fn(set.lockup, `${provider}.lockup`);
    if (set.mark) fn(set.mark, `${provider}.mark`);
  }
};

describe("deviceMarkFor", () => {
  it("resolves a provider case- and whitespace-insensitively", () => {
    expect(deviceMarkFor("apple")).toBe(APPLE.lockup);
    expect(deviceMarkFor("  APPLE ")).toBe(APPLE.lockup);
  });

  it("returns null for an unknown or missing provider, so callers can fall back to text", () => {
    expect(deviceMarkFor("nokia")).toBeNull();
    expect(deviceMarkFor("")).toBeNull();
    expect(deviceMarkFor(null)).toBeNull();
    expect(deviceMarkFor(undefined)).toBeNull();
  });

  it("gives the compact mark when asked, and the lockup when there isn't one", () => {
    expect(deviceMarkFor("apple", "mark")).toBe(APPLE.mark);
    // A silhouette provider ships one drawing — asking for `mark` still draws.
    expect(deviceMarkFor("garmin", "mark")).toBe(GARMIN.lockup);
  });

  it("draws every provider session-device.ts can name", () => {
    for (const provider of PROVIDER_DEVICE_KEYS) {
      expect(deviceMarkFor(provider), provider).not.toBeNull();
    }
  });
});

describe("mark artwork", () => {
  it("is normalised to the shared height with a positive width", () => {
    every((art, name) => {
      expect(art.width, name).toBeGreaterThan(0);
      // Nothing is taller than it is wide by more than ~1.3:1 — a drawing that
      // far off the normalisation would mean a bad trace.
      expect(art.width, name).toBeGreaterThan(DEVICE_MARK_HEIGHT * 0.7);
    });
  });

  it("carries fill paths and a screen-reader label", () => {
    every((art, name) => {
      expect(art.paths.length, name).toBeGreaterThan(0);
      for (const d of art.paths) {
        expect(d.startsWith("M"), `${name}: ${d.slice(0, 12)}`).toBe(true);
        expect(d.endsWith("Z"), `${name}: ${d.slice(-12)}`).toBe(true);
      }
      expect(art.label.trim().length, name).toBeGreaterThan(0);
      expect(art.minPx, name).toBeGreaterThan(0);
    });
  });
});

// The trademark rule the whole module exists to enforce: solid black or solid
// white, never the accent. If someone adds a third ink here, this fails.
describe("DEVICE_MARK_INK", () => {
  it("offers exactly the two brand monochromes and nothing else", () => {
    expect(Object.keys(DEVICE_MARK_INK).sort()).toEqual(["dark", "light"]);
    expect(DEVICE_MARK_INK.dark).toBe(colors.chalk);
    expect(DEVICE_MARK_INK.light).toBe(colors.ink);
  });

  it("never offers an accent colour", () => {
    const accents: string[] = [colors.lime, colors.blue, colors.violet, colors.amber, colors.red];
    for (const ink of Object.values(DEVICE_MARK_INK)) {
      expect(accents).not.toContain(ink);
    }
  });

  it("reads at AA against the ground it names", () => {
    expect(contrastRatio(DEVICE_MARK_INK.dark, colors.ink)).toBeGreaterThan(WCAG.AA);
    expect(contrastRatio(DEVICE_MARK_INK.light, colors.chalk)).toBeGreaterThan(WCAG.AA);
  });
});

describe("deviceMarkWidth", () => {
  it("scales from the height so the aspect ratio survives any layout", () => {
    const art = APPLE.lockup;
    expect(deviceMarkWidth(art, DEVICE_MARK_HEIGHT)).toBeCloseTo(art.width, 2);
    expect(deviceMarkWidth(art, 11)).toBeCloseTo((art.width * 11) / 100, 2);
    // The Apple Watch lockup is a wide horizontal shape; the mark is upright.
    expect(deviceMarkWidth(APPLE.lockup, 20)).toBeGreaterThan(80);
    expect(deviceMarkWidth(APPLE.mark!, 20)).toBeLessThan(20);
  });
});
