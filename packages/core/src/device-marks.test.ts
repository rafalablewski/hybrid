import { describe, it, expect } from "vitest";
import {
  DEVICE_MARKS,
  DEVICE_MARK_CAP,
  DEVICE_MARK_CAP_TOP,
  DEVICE_MARK_GLYPH,
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
// Still a silhouette (one drawing, no compact form) — the fixture for the
// fall-back-to-lockup behaviour, which Garmin used to stand for before its own
// artwork landed.
const POLAR = DEVICE_MARKS.polar!;

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
    // A real logo ships both forms: the wordmark to name the device, the glyph
    // to count it.
    expect(deviceMarkFor("garmin", "mark")).toBe(GARMIN.mark);
    expect(deviceMarkFor("garmin")).toBe(GARMIN.lockup);
    // A silhouette provider ships one drawing — asking for `mark` still draws.
    expect(POLAR.mark).toBeUndefined();
    expect(deviceMarkFor("polar", "mark")).toBe(POLAR.lockup);
  });

  it("normalises every drawing of a kind onto the SAME optical measure", () => {
    // The invariant the whole normalisation exists for: two manufacturers' logos
    // set at one height must read as one size. A new logo added by eye instead
    // of by measurement fails here.
    every((art, name) => {
      expect(art.optical, name).toBe(art.kind === "wordmark" ? DEVICE_MARK_CAP : DEVICE_MARK_GLYPH);
    });
    const wordmarks = Object.values(DEVICE_MARKS).map((s) => s.lockup).filter((a) => a.kind === "wordmark");
    expect(wordmarks.length).toBeGreaterThan(1);
    expect(new Set(wordmarks.map((a) => a.optical)).size).toBe(1);
  });

  it("leaves the cap band room for the tallest ascender", () => {
    // Garmin's delta is the constraint: it sits ~0.95 cap-heights above the
    // letters, so the band cannot start lower than it needs, nor the caps be
    // taller than the leftover. If either constant drifts, a logo clips.
    expect(DEVICE_MARK_CAP_TOP).toBeGreaterThan(DEVICE_MARK_CAP * 0.94);
    expect(DEVICE_MARK_CAP_TOP + DEVICE_MARK_CAP).toBeLessThan(DEVICE_MARK_HEIGHT);
  });

  it("draws Garmin's wordmark wide and its delta near-square", () => {
    // The two forms exist because they solve different problems: a 352-wide
    // wordmark cannot sit in a row that only has room to say "this came off a
    // device", and the delta alone cannot name the manufacturer.
    expect(GARMIN.lockup.width).toBeGreaterThan(300);
    expect(GARMIN.mark!.width).toBeLessThan(130);
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
    // Stated as a RATIO to the requested height, not a pixel count: the widths
    // move whenever the optical normalisation is retuned, but a wordmark being
    // wider than it is tall — and a glyph narrower — is the durable claim.
    expect(deviceMarkWidth(APPLE.lockup, 20)).toBeGreaterThan(20);
    expect(deviceMarkWidth(APPLE.mark!, 20)).toBeLessThan(20);
  });

  it("sets every wordmark at one cap height, whatever its own proportions", () => {
    // The regression this whole normalisation fixes: Apple's caps used to render
    // 1.39x Garmin's at the same requested height. Now the ratio is exactly 1.
    const capPx = (art: DeviceMarkArt, height: number) => (art.optical * height) / DEVICE_MARK_HEIGHT;
    expect(capPx(APPLE.lockup, 16)).toBeCloseTo(capPx(GARMIN.lockup, 16), 5);
    expect(capPx(APPLE.mark!, 16)).toBeCloseTo(capPx(GARMIN.mark!, 16), 5);
  });
});
