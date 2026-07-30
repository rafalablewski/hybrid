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
 * Garmin — the wordmark with its delta above the N (`lockup`), and the delta
 * alone as the compact glyph (`mark`). Traced from Garmin's published artwork,
 * normalised here like every other drawing. The ® that rides at the wordmark's
 * baseline is dropped: at the 11-15px this is rendered at it resolves to a
 * smudge, and the Apple lockup above already sets that precedent.
 */
const GARMIN: DeviceMarkSet = {
  lockup: {
    width: 352.1,
    minPx: 15,
    label: "Garmin",
    paths: [
      "M 96.68,50.59 A 4.46,4.46 0 0,0 93.04,48.33 L 90.23,48.33 A 4.46,4.46 0 0,0 86.62,50.59 L 64.26,97.27 C 63.63,98.49 64.32,99.4 65.71,99.4 L 70.88,99.4 C 72.92,99.4 73.86,98.46 74.4,97.33 C 74.97,96.2 76.19,93.72 76.4,93.23 C 76.71,92.53 77.68,92.13 79.1,92.13 L 103.16,92.13 C 104.54,92.13 105.45,92.38 105.86,93.23 C 106.14,93.77 107.38,95.99 107.96,97.18 A 3.7,3.7 0 0,0 111.57,99.37 L 119.07,99.37 C 120.45,99.37 121.08,98.3 120.59,97.33 C 120.06,96.39 96.68,50.59 96.68,50.59 Z",
      "M 82.58,84.91 C 81.2,84.91 80.54,83.87 81.13,82.62 L 89.94,63.77 C 90.54,62.52 91.48,62.52 92.04,63.77 L 100.6,82.62 C 101.17,83.87 100.51,84.91 99.12,84.91 L 82.58,84.91 Z",
      "M 269.38,50.94 L 269.38,97.25 C 269.38,98.53 270.51,99.38 271.9,99.38 L 278.01,99.38 C 279.38,99.38 280.52,98.5 280.52,97.13 L 280.52,50.86 C 280.52,49.49 279.61,48.35 278.24,48.35 L 271.9,48.35 C 270.51,48.33 269.38,49.18 269.38,50.94 Z",
      "M 167.05,79.95 C 166.26,78.83 166.71,77.58 168.02,77.16 C 168.02,77.16 173.3,75.59 175.83,73.3 C 178.38,71.05 179.63,67.75 179.63,63.49 A 15.43,15.43 0 0,0 178.15,56.44 A 12.14,12.14 0 0,0 173.98,51.76 A 19.69,19.69 0 0,0 167.45,49.12 C 164.91,48.58 161.5,48.4 161.5,48.4 A 135.96,135.96 0 0,0 156.48,48.27 L 131.1,48.27 A 2.53,2.53 0 0,0 128.58,50.79 L 128.58,97.05 C 128.58,98.43 129.71,99.31 131.1,99.31 L 137.08,99.31 C 138.46,99.31 139.6,98.43 139.6,97.05 L 139.6,78.64 S 139.63,78.64 139.63,78.61 L 151.02,78.58 C 152.39,78.58 154.18,79.52 155,80.65 L 166.82,97.27 C 167.92,98.75 168.95,99.31 170.34,99.31 L 178.18,99.31 C 179.55,99.31 179.78,97.99 179.3,97.33 C 178.81,96.74 167.05,79.95 167.05,79.95 Z",
      "M 162.25,70.54 A 24.23,24.23 0 0,1 158.97,70.97 A 135.91,135.91 0 0,1 153.95,71.06 L 142.18,71.06 A 2.53,2.53 0 0,1 139.66,68.55 L 139.66,59.17 C 139.66,57.79 140.79,56.65 142.18,56.65 L 153.93,56.65 C 155.31,56.65 157.58,56.71 158.95,56.74 C 158.95,56.74 160.71,56.81 162.24,57.18 A 9.71,9.71 0 0,1 165.94,58.69 A 5.52,5.52 0 0,1 167.89,60.97 A 7.3,7.3 0 0,1 167.89,66.74 A 5.43,5.43 0 0,1 165.94,69.03 A 9.52,9.52 0 0,1 162.25,70.54 Z",
      "M 344.4,48.33 C 343.02,48.33 341.88,49.24 341.88,50.59 L 341.88,80.2 C 341.88,81.57 341.09,81.9 340.12,80.93 L 310.48,50.19 A 5.8,5.8 0 0,0 306.22,48.36 L 300.63,48.36 C 298.87,48.36 298.12,49.31 298.12,50.25 L 298.12,97.59 C 298.12,98.53 299.03,99.44 300.4,99.44 L 305.99,99.44 C 307.36,99.44 308.33,98.69 308.33,97.41 L 308.36,66.22 C 308.36,64.85 309.15,64.52 310.12,65.52 L 341.05,97.65 A 5.56,5.56 0 0,0 345.35,99.44 L 349.55,99.44 A 2.53,2.53 0 0,0 352.07,96.93 L 352.07,50.85 A 2.53,2.53 0 0,0 349.55,48.33 L 344.4,48.33 Z",
      "M 223.49,77.19 C 222.82,78.41 221.7,78.38 221.03,77.19 L 206.54,50.59 A 4.04,4.04 0 0,0 202.9,48.33 L 195.03,48.33 A 2.53,2.53 0 0,0 192.51,50.85 L 192.51,97.08 C 192.51,98.46 193.43,99.4 195.03,99.4 L 199.92,99.4 C 201.3,99.4 202.3,98.52 202.3,97.21 C 202.3,96.57 202.33,63.58 202.36,63.58 C 202.42,63.58 220.46,97.18 220.46,97.18 A 1.62,1.62 0 0,0 223.38,97.18 S 241.57,63.64 241.6,63.64 C 241.67,63.64 241.63,96.2 241.63,97.18 C 241.63,98.52 242.7,99.37 244.09,99.37 L 249.71,99.37 C 251.08,99.37 252.22,98.67 252.22,96.85 L 252.22,50.83 A 2.53,2.53 0 0,0 249.71,48.32 L 242.17,48.32 A 4.09,4.09 0 0,0 238.41,50.51 L 223.49,77.19 Z",
      "M 0,73.81 C 0,98.75 25.51,100 30.62,100 C 47.56,100 54.71,95.42 55,95.23 A 4.48,4.48 0 0,0 57.35,91.16 L 57.35,73.94 A 2.87,2.87 0 0,0 54.46,71.05 L 33.19,71.05 C 31.59,71.05 30.56,72.33 30.56,73.94 L 30.56,75.73 C 30.56,77.33 31.59,78.61 33.19,78.61 L 45.49,78.61 A 2.16,2.16 0 0,1 47.65,80.77 L 47.65,88.8 C 45.23,89.8 34.17,93.02 25.26,90.9 C 12.36,87.82 11.36,77.16 11.36,73.98 C 11.36,71.31 12.18,57.89 28.01,56.54 C 40.83,55.45 49.27,60.62 49.37,60.68 C 50.88,61.47 52.44,60.9 53.29,59.31 L 54.89,56.08 C 55.56,54.77 55.32,53.38 53.7,52.28 C 53.61,52.22 44.6,47.36 30.65,47.36 C 0.85,47.33 0,71.11 0,73.81 Z",
      "M 341.57,35.57 L 308.16,35.57 C 306.94,35.57 305.88,34.97 305.28,33.9 S 304.67,31.65 305.28,30.59 L 322,1.67 A 3.24,3.24 0 0,1 324.89,0 A 3.24,3.24 0 0,1 327.78,1.67 L 344.5,30.59 A 3.13,3.13 0 0,1 344.5,33.9 A 3.4,3.4 0 0,1 341.57,35.57 Z",
    ],
  },
  mark: {
    width: 112.9,
    minPx: 9,
    label: "Garmin",
    paths: [
      "M 103.31,100 L 9.38,100 C 5.95,100 2.96,98.31 1.27,95.31 S -0.42,88.98 1.27,85.99 L 48.3,4.69 A 9.11,9.11 0 0,1 56.41,0 A 9.11,9.11 0 0,1 64.52,4.69 L 111.55,85.99 A 8.81,8.81 0 0,1 111.55,95.31 A 9.54,9.54 0 0,1 103.31,100 Z",
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
  garmin: GARMIN,
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
