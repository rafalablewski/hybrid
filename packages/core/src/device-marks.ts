// DEVICE MARKS — the artwork a matched session signs itself with.
//
// When a session is matched to a wearable's recording, the device's read IS the
// session's truth (see session-device.ts). The mark is how that claim is made on
// screen: the Wrapped hero chip, the device panel's measured column, the share
// card's footer, the logbook rows, the match sheet.
//
// THE ONE RULE: the mark is never tinted. A manufacturer's logo reproduces in
// solid black or solid white and nothing else — no accent colour, no gradient,
// no opacity, no outline, no stretch. That is why nothing here carries a colour
// and why neither renderer takes a `color` prop: the art is drawn with
// `currentColor`, and both clients' text colour is already chalk on the dark
// panels and ink in the light theme, so the mark can only ever come out
// monochrome. It holds by construction rather than by review.
//
// The knock-on is a colour grammar worth keeping: on a matched session, WHITE
// means "the device said so" (the lockup, the words sharing its line, the
// measured column) and the brand's lime means "HYBRID said so". The two voices
// stop competing on the same panel.
//
// Every drawing is normalised to a 100-unit-tall viewBox with its own width, so
// a caller only ever picks a HEIGHT and the width follows — the aspect ratio can
// never be distorted by a layout. Paths are filled with the even-odd rule (the
// A's counter and the case's inner face are holes).
//
// Shape data only: no React, no platform APIs. The renderers are
// apps/web/components/aurora/device-mark.tsx and
// apps/mobile/components/aurora/device-mark.tsx.

import { colors } from "./theme/tokens";

/** How a mark is being used. `lockup` names the device ("… WATCH"); `mark` is
 *  the compact status glyph used where the device is merely being counted. */
export type DeviceMarkForm = "lockup" | "mark";

/**
 * The ONLY two inks a mark may be drawn in — the brand's own monochromes, which
 * are also its text colours. Both renderers pick from here and expose no other
 * colour, so "solid black or solid white" is the only thing either client can
 * express. Callers name the SURFACE, not a colour.
 *
 * Web could lean on `currentColor` instead, but this codebase sets accent text
 * colours on the very rows a mark sits in (the hero chip used to be lime), so
 * inheriting would tint it by accident. Naming the surface can't drift.
 */
export const DEVICE_MARK_INK = { dark: colors.chalk, light: colors.ink } as const;

/** Which ground the mark is sitting on. HYBRID's device surfaces (the Wrapped
 *  panels, the match sheet, the share card) are dark whatever the theme does;
 *  anything that follows the theme passes the theme's own scheme. */
export type DeviceMarkSurface = keyof typeof DEVICE_MARK_INK;

/** One drawing, normalised to a 100-unit-tall viewBox. */
export interface DeviceMarkArt {
  /** viewBox width at the shared 100-unit height. */
  width: number;
  /** Fill paths, drawn with fill-rule evenodd. */
  paths: string[];
  /** Smallest height, in px, at which this drawing stays legible. Below it the
   *  counters fill in — callers should step down to the other form instead. */
  minPx: number;
  /** What a screen reader should announce. */
  label: string;
}

/** The two forms a provider ships. `mark` is optional: a provider whose logo has
 *  no compact form uses the lockup at every size. */
export interface DeviceMarkSet {
  lockup: DeviceMarkArt;
  mark?: DeviceMarkArt;
}

/** The height every drawing is normalised to. Callers scale from here. */
export const DEVICE_MARK_HEIGHT = 100;

/**
 * Apple Watch — the lockup and the Apple mark alone, traced from the artwork
 * Apple publishes. Reproduced solid, never recoloured, and never used as a
 * substitute for the word "Apple" in a sentence.
 */
const APPLE: DeviceMarkSet = {
  lockup: {
    width: 453.6,
    minPx: 11,
    label: "Apple Watch",
    paths: [
      "M22.7 99.4C20 98.5 16.9 96.1 14.4 92.9C-4.7 68.6 -4.7 36.6 14.4 27.2C20.9 24.1 25.4 24 33.1 26.9C39.6 29.3 40.6 29.3 45.9 27.3C57.4 22.9 66.2 23.9 73.3 30.4C76.8 33.7 76.8 33.7 73.1 37.3C67.9 42.4 66.6 45.6 66.6 53.1C66.6 58.9 66.6 59.1 68.3 62.6C70.1 66.3 73.8 70.5 76.5 71.9C79.1 73.2 79.2 73.3 78.2 76C76.2 81.9 70.8 90.7 66.5 95.1C61.7 100 57.5 100.7 50.1 97.8C43.8 95.3 39.1 95.2 32.9 97.7C28 99.7 25.1 100.2 22.7 99.4Z",
      "M39.3 21.2C39.3 12.2 47.8 2.4 56.9 0.7C59 0.3 59.3 0.9 58.7 5.2C57.5 14.2 49.7 22.5 41.9 23.1L39.3 23.3L39.3 21.2Z",
      "M113.5 98C113.4 97.7 109 81.6 103.8 62.3C98.6 43 94.2 26.9 94 26.4C93.8 25.6 94.3 25.6 101.7 25.7L109.6 25.8L115.4 51.2C118.6 65.1 121.2 76.8 121.4 77.2C121.5 77.5 124.5 66.1 127.9 51.7L134.3 25.6L141.7 25.6C147.3 25.6 149.2 25.7 149.4 26.2C149.5 26.5 152.3 38.1 155.7 52C159.1 65.9 162 77.2 162.1 77.2C162.2 77.2 164.5 67.5 167.2 55.6C169.9 43.6 172.6 32 173.1 29.7L174.1 25.6L181.8 25.6C186.1 25.6 189.6 25.8 189.6 26C189.6 26.3 185.3 42.2 180.1 61.4C174.9 80.6 170.5 96.8 170.3 97.5L170 98.6L162.5 98.6L155 98.6L154.6 97C154.4 96.2 151.4 85 148.1 72.2C144.7 59.4 141.9 49 141.7 49.1C141.6 49.3 138.6 60.4 135 73.9L128.6 98.3L121.2 98.5C115.5 98.6 113.7 98.5 113.5 98Z",
      "M191 98C191 97.7 196.1 81.3 202.3 61.6L213.6 25.8L222.4 25.7L231.1 25.6L242.4 61.5C248.6 81.2 253.8 97.7 253.9 98C254.1 98.5 252.5 98.6 246.2 98.5L238.2 98.3L236.1 91C235 87 233.9 82.8 233.6 81.9L233.1 80.1L221.9 80.1L210.6 80.1L208 89.3L205.5 98.6L198.2 98.6C192.8 98.6 191 98.4 191 98Z",
      "M229.9 68.7C229.9 67.8 222.1 40.3 221.9 40.5C221.5 40.9 213.9 68.5 214.1 68.8C214.4 69.4 229.9 69.3 229.9 68.7Z",
      "M274.9 68.5L274.9 38.4L264.5 38.4L254 38.4L254 32L254 25.6L282.5 25.6L310.9 25.6L310.9 32L310.9 38.4L300.2 38.4L289.6 38.4L289.6 68.5L289.6 98.6L282.2 98.6L274.9 98.6L274.9 68.5Z",
      "M346.9 99.5C329.8 98.1 321.3 87.3 320.5 65.9C319.7 41.9 326.2 29.6 342.1 25.6C360.4 20.9 378.7 32.4 378.7 48.7L378.7 50.7L371.6 50.7L364.6 50.7L364.3 48.4C363.5 41.7 358.4 37.5 350.9 37.5C339.5 37.4 335.6 43.6 335.6 61.8C335.5 80.8 339.2 86.8 350.9 86.7C358.9 86.7 363.6 82.9 364.3 76.1L364.6 73.5L371.6 73.5L378.7 73.5L378.7 75.7C378.6 90.9 365.1 101 346.9 99.5Z",
      "M394.3 62.1L394.3 25.6L401.7 25.6L409 25.6L409.1 40.2L409.2 54.7L423.8 54.9L438.4 55L438.4 40.3L438.4 25.6L445.7 25.6L453.1 25.6L453.1 62.1L453.1 98.6L445.7 98.6L438.4 98.6L438.4 82.9L438.4 67.3L423.8 67.4L409.2 67.5L409.1 83.1L409 98.6L401.7 98.6L394.3 98.6L394.3 62.1Z",
    ],
  },
  mark: {
    width: 79.6,
    minPx: 9,
    label: "Apple",
    paths: [
      "M22.7 99.4C15.4 97 5.7 82.6 2.1 68.9C-2.9 49.5 1.8 33.4 14.4 27.2C20.9 24.1 25.4 24 33.1 26.9C39.6 29.3 40.6 29.3 45.9 27.3C51.9 25 53.7 24.6 57.6 24.6C63.6 24.6 69.2 26.7 73.3 30.4C76.8 33.7 76.8 33.7 73.1 37.3C67.9 42.4 66.6 45.6 66.6 53.1C66.6 58.9 66.6 59.1 68.3 62.6C70.1 66.3 73.8 70.5 76.5 71.9C79.1 73.2 79.2 73.3 78.2 76C76.2 81.9 70.8 90.7 66.5 95.1C61.7 100 57.5 100.7 50.1 97.8C43.8 95.3 39.1 95.2 32.9 97.7C28 99.7 25.1 100.2 22.7 99.4Z",
      "M39.3 21.2C39.3 12.2 47.8 2.4 56.9 0.7C59 0.3 59.3 0.9 58.7 5.2C57.5 14.2 49.7 22.5 41.9 23.1L39.3 23.3L39.3 21.2Z",
    ],
  },
};

/**
 * HYBRID's own silhouettes, for a connector whose logo we don't ship. These are
 * ours, so they may take the accent — but a caller that mixes them with a real
 * logo in one row should keep the row monochrome anyway.
 */
const WATCH_SILHOUETTE: DeviceMarkArt = {
  width: 78,
  minPx: 10,
  label: "Watch",
  paths: [
    "M31 3H47A7 7 0 0 1 54 10V18A7 7 0 0 1 47 25H31A7 7 0 0 1 24 18V10A7 7 0 0 1 31 3Z",
    "M31 75H47A7 7 0 0 1 54 82V90A7 7 0 0 1 47 97H31A7 7 0 0 1 24 90V82A7 7 0 0 1 31 75Z",
    "M26 21H52A18 18 0 0 1 70 39V61A18 18 0 0 1 52 79H26A18 18 0 0 1 8 61V39A18 18 0 0 1 26 21Z",
    "M27 28H51A12 12 0 0 1 63 40V60A12 12 0 0 1 51 72H27A12 12 0 0 1 15 60V40A12 12 0 0 1 27 28Z",
    "M72 40H73A3 3 0 0 1 76 43V55A3 3 0 0 1 73 58H72A3 3 0 0 1 69 55V43A3 3 0 0 1 72 40Z",
  ],
};

const BAND_SILHOUETTE: DeviceMarkArt = {
  width: 78,
  minPx: 10,
  label: "Band",
  paths: [
    "M20 30H58A14 14 0 0 1 72 44V56A14 14 0 0 1 58 70H20A14 14 0 0 1 6 56V44A14 14 0 0 1 20 30Z",
    "M22 38H56A8 8 0 0 1 64 46V54A8 8 0 0 1 56 62H22A8 8 0 0 1 14 54V46A8 8 0 0 1 22 38Z",
  ],
};

/**
 * provider → artwork. Apple ships its own logo; the other connectors fall back
 * to the silhouette that matches their hardware until their marks are added,
 * so `deviceMarkFor` can never come back empty for a provider we support.
 *
 * Keys mirror PROVIDER_DEVICE in session-device.ts — a provider named there
 * should be drawable here.
 */
export const DEVICE_MARKS: Record<string, DeviceMarkSet> = {
  apple: APPLE,
  whoop: { lockup: BAND_SILHOUETTE },
  oura: { lockup: BAND_SILHOUETTE },
  garmin: { lockup: WATCH_SILHOUETTE },
  polar: { lockup: WATCH_SILHOUETTE },
  fitbit: { lockup: WATCH_SILHOUETTE },
  suunto: { lockup: WATCH_SILHOUETTE },
  coros: { lockup: WATCH_SILHOUETTE },
};

/**
 * The artwork for a provider in the requested form, or null when we have none
 * (an unknown connector) — the caller then falls back to naming the device in
 * text with `deviceSourceLabel`.
 *
 * Asking for `mark` from a provider that only ships a lockup gives the lockup
 * back rather than nothing: better a wide mark than a missing one.
 */
export function deviceMarkFor(
  provider: string | null | undefined,
  form: DeviceMarkForm = "lockup",
): DeviceMarkArt | null {
  const key = typeof provider === "string" ? provider.trim().toLowerCase() : "";
  const set = DEVICE_MARKS[key];
  if (!set) return null;
  if (form === "mark") return set.mark ?? set.lockup;
  return set.lockup;
}

/**
 * The px width a drawing occupies at `height` px. Both renderers size from the
 * height alone and derive the width here, so the aspect ratio survives every
 * layout — a mark can never be stretched into a chip.
 */
export function deviceMarkWidth(art: DeviceMarkArt, height: number): number {
  return Math.round(((art.width * height) / DEVICE_MARK_HEIGHT) * 100) / 100;
}
