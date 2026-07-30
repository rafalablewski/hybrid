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
// Every drawing sits in a 100-unit-tall viewBox with its own width, so a caller
// only ever picks a HEIGHT and the width follows — the aspect ratio can never be
// distorted by a layout. Paths are filled with the even-odd rule (the A's
// counter and the case's inner face are holes).
//
// THE OTHER RULE: EVERY LOGO READS AT THE SAME SIZE.
//
// Scaling each drawing so its BOUNDING BOX fills the box is the obvious thing to
// do and it is wrong, because the boxes hold different things. Apple's lockup is
// bounded by the apple, which overshoots its letters by 36%; Garmin's is bounded
// by the delta, which overshoots by 90%. Normalised that way and set at the same
// height, Apple's letterforms came out 1.39x Garmin's — one logo visibly bigger
// than the other in the same row.
//
// So drawings are normalised on what the EYE measures, not what the geometry
// bounds, and there are two of those depending on the drawing:
//
//   wordmark — the CAP HEIGHT of the letterforms is DEVICE_MARK_CAP units, and
//     that cap band is parked at the same y in every wordmark (DEVICE_MARK_CAP_TOP)
//     so the logos share a baseline as well as a size. Ascenders (the apple, the
//     delta) live in the space above it, which is why a lockup no longer fills
//     its box vertically — that headroom is load-bearing.
//   glyph — normalised on DEVICE_MARK_GLYPH, the geometric mean of its ink
//     area's square root and its bounding height, then centred. Neither measure
//     works alone: a solid triangle and an apple of equal HEIGHT do not read as
//     equal size, while a wide flat band and a tall watch of equal INK do not
//     either. The mean of the two holds both ends.
//
// Adding a manufacturer means measuring it the same way, not eyeballing a
// scale — and the suite holds the line on both constants.
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

/**
 * How a drawing's size is measured — see the normalisation rule up top.
 * `wordmark` is measured on its cap height, `glyph` on its ink area.
 */
export type DeviceMarkKind = "wordmark" | "glyph";

/** Cap height every wordmark is normalised to, in viewBox units. Bounded by the
 *  logo with the tallest ascender relative to its caps (Garmin's delta): any
 *  larger and the delta would not fit in the box above the letters. */
export const DEVICE_MARK_CAP = 50;

/** Where every wordmark's cap band starts, so the logos share a baseline and not
 *  merely a size. Leaves room above for the tallest ascender. */
export const DEVICE_MARK_CAP_TOP = 48;

/** The optical size every glyph is normalised to: the geometric mean of its ink
 *  area's square root and its bounding height. Ink alone leaves a wide, flat
 *  pictogram sitting visibly lower than a tall one (they weigh the same but do
 *  not LOOK the same size); height alone lets a sparse outline out-measure a
 *  solid shape. The mean of the two holds both ends. Anchored on the Apple mark
 *  so the many places already drawing it are unchanged. */
export const DEVICE_MARK_GLYPH = 84;

/** One drawing, normalised into a 100-unit-tall viewBox. */
export interface DeviceMarkArt {
  /** Which measure this drawing was normalised on. */
  kind: DeviceMarkKind;
  /** viewBox width at the shared 100-unit height. */
  width: number;
  /** The height, in viewBox units, that the eye reads as this drawing's size —
   *  DEVICE_MARK_CAP for a wordmark, DEVICE_MARK_GLYPH for a glyph. Every
   *  drawing of a kind carries the same value; that is the invariant that makes
   *  a row of different manufacturers look like one system. */
  optical: number;
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
    kind: "wordmark",
    width: 310.3,
    optical: DEVICE_MARK_CAP,
    minPx: 11,
    label: "Apple Watch",
    paths: [
      "M 15.5,98.55 C 13.65,97.93 11.52,96.29 9.81,94.1 C -3.27,77.45 -3.27,55.53 9.81,49.1 C 14.26,46.97 17.35,46.9 22.62,48.89 C 27.07,50.53 27.76,50.53 31.39,49.16 C 39.26,46.15 45.29,46.84 50.15,51.29 C 52.55,53.55 52.55,53.55 50.02,56.01 C 46.46,59.51 45.57,61.7 45.57,66.84 C 45.57,70.81 45.57,70.95 46.73,73.34 C 47.96,75.88 50.5,78.75 52.35,79.71 C 54.13,80.6 54.2,80.67 53.51,82.52 C 52.14,86.56 48.44,92.59 45.5,95.6 C 42.21,98.96 39.33,99.44 34.26,97.45 C 29.95,95.74 26.73,95.67 22.48,97.38 C 19.13,98.75 17.14,99.1 15.5,98.55 Z",
      "M 26.87,44.99 C 26.87,38.82 32.69,32.11 38.92,30.95 C 40.36,30.67 40.57,31.08 40.15,34.03 C 39.33,40.19 33.99,45.88 28.65,46.29 L 26.87,46.42 L 26.87,44.99 Z",
      "M 77.69,97.59 C 77.62,97.38 74.61,86.36 71.04,73.14 C 67.48,59.92 64.47,48.89 64.33,48.55 C 64.2,48 64.54,48 69.61,48.07 L 75.02,48.14 L 78.99,65.53 C 81.18,75.05 82.96,83.07 83.1,83.34 C 83.17,83.55 85.22,75.74 87.55,65.88 L 91.93,48 L 97,48 C 100.84,48 102.14,48.07 102.28,48.41 C 102.35,48.62 104.26,56.56 106.59,66.08 C 108.92,75.6 110.91,83.34 110.98,83.34 C 111.04,83.34 112.62,76.7 114.47,68.55 C 116.32,60.33 118.17,52.38 118.51,50.81 L 119.2,48 L 124.47,48 C 127.41,48 129.81,48.14 129.81,48.27 C 129.81,48.48 126.87,59.37 123.3,72.52 C 119.74,85.67 116.73,96.77 116.59,97.25 L 116.39,98 L 111.25,98 L 106.11,98 L 105.84,96.9 C 105.7,96.36 103.65,88.68 101.39,79.92 C 99.06,71.15 97.14,64.03 97,64.1 C 96.93,64.23 94.88,71.84 92.41,81.08 L 88.03,97.79 L 82.96,97.93 C 79.06,98 77.83,97.93 77.69,97.59 Z",
      "M 130.77,97.59 C 130.77,97.38 134.26,86.15 138.51,72.66 L 146.25,48.14 L 152.28,48.07 L 158.24,48 L 165.98,72.59 C 170.22,86.08 173.78,97.38 173.85,97.59 C 173.99,97.93 172.89,98 168.58,97.93 L 163.1,97.79 L 161.66,92.79 C 160.91,90.05 160.15,87.18 159.95,86.56 L 159.61,85.33 L 151.93,85.33 L 144.2,85.33 L 142.41,91.63 L 140.7,98 L 135.7,98 C 132,98 130.77,97.86 130.77,97.59 Z",
      "M 157.41,77.52 C 157.41,76.9 152.07,58.07 151.93,58.21 C 151.66,58.48 146.46,77.38 146.59,77.59 C 146.8,78 157.41,77.93 157.41,77.52 Z",
      "M 188.24,77.38 L 188.24,56.77 L 181.11,56.77 L 173.92,56.77 L 173.92,52.38 L 173.92,48 L 193.44,48 L 212.89,48 L 212.89,52.38 L 212.89,56.77 L 205.57,56.77 L 198.3,56.77 L 198.3,77.38 L 198.3,98 L 193.24,98 L 188.24,98 L 188.24,77.38 Z",
      "M 237.55,98.62 C 225.84,97.66 220.02,90.26 219.47,75.6 C 218.92,59.16 223.37,50.74 234.26,48 C 246.8,44.78 259.33,52.66 259.33,63.82 L 259.33,65.19 L 254.47,65.19 L 249.67,65.19 L 249.47,63.62 C 248.92,59.03 245.43,56.15 240.29,56.15 C 232.48,56.08 229.81,60.33 229.81,72.79 C 229.74,85.81 232.28,89.92 240.29,89.85 C 245.77,89.85 248.99,87.25 249.47,82.59 L 249.67,80.81 L 254.47,80.81 L 259.33,80.81 L 259.33,82.32 C 259.26,92.73 250.02,99.64 237.55,98.62 Z",
      "M 270.02,73 L 270.02,48 L 275.09,48 L 280.09,48 L 280.15,58 L 280.22,67.93 L 290.22,68.07 L 300.22,68.14 L 300.22,58.07 L 300.22,48 L 305.22,48 L 310.29,48 L 310.29,73 L 310.29,98 L 305.22,98 L 300.22,98 L 300.22,87.25 L 300.22,76.56 L 290.22,76.63 L 280.22,76.7 L 280.15,87.38 L 280.09,98 L 275.09,98 L 270.02,98 L 270.02,73 Z",
    ],
  },
  mark: {
    kind: "glyph",
    width: 79.1,
    optical: DEVICE_MARK_GLYPH,
    minPx: 9,
    label: "Apple",
    paths: [
      "M 22.69,99.48 C 15.35,97.07 5.59,82.59 1.98,68.82 C -3.05,49.32 1.67,33.13 14.34,26.9 C 20.88,23.78 25.4,23.68 33.14,26.6 C 39.68,29.01 40.68,29.01 46.01,27 C 52.04,24.69 53.85,24.28 57.77,24.28 C 63.8,24.28 69.43,26.4 73.55,30.11 C 77.07,33.43 77.07,33.43 73.35,37.05 C 68.13,42.18 66.82,45.4 66.82,52.94 C 66.82,58.77 66.82,58.97 68.53,62.49 C 70.34,66.21 74.06,70.43 76.77,71.84 C 79.39,73.14 79.49,73.24 78.48,75.96 C 76.47,81.89 71.04,90.74 66.72,95.16 C 61.89,100.09 57.67,100.79 50.23,97.87 C 43.9,95.36 39.17,95.26 32.94,97.77 C 28.01,99.78 25.1,100.29 22.69,99.48 Z",
      "M 39.37,20.87 C 39.37,11.82 47.92,1.97 57.07,0.26 C 59.18,-0.15 59.48,0.46 58.88,4.78 C 57.67,13.83 49.83,22.17 41.99,22.78 L 39.37,22.98 L 39.37,20.87 Z",
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
    kind: "wordmark",
    width: 344.7,
    optical: DEVICE_MARK_CAP,
    minPx: 15,
    label: "Garmin",
    paths: [
      "M 94.65,50.21 A 4.37,4.37 0 0,0 91.09,48 L 88.34,48 A 4.37,4.37 0 0,0 84.81,50.21 L 62.91,95.91 C 62.3,97.11 62.97,98 64.33,98 L 69.39,98 C 71.39,98 72.31,97.08 72.84,95.97 C 73.4,94.87 74.59,92.44 74.8,91.96 C 75.1,91.27 76.05,90.88 77.44,90.88 L 101,90.88 C 102.35,90.88 103.24,91.13 103.64,91.96 C 103.92,92.49 105.13,94.66 105.7,95.83 A 3.62,3.62 0 0,0 109.23,97.97 L 116.58,97.97 C 117.93,97.97 118.54,96.92 118.06,95.97 C 117.54,95.05 94.65,50.21 94.65,50.21 Z",
      "M 80.85,83.81 C 79.5,83.81 78.85,82.8 79.43,81.57 L 88.06,63.12 C 88.64,61.89 89.56,61.89 90.11,63.12 L 98.49,81.57 C 99.05,82.8 98.4,83.81 97.04,83.81 L 80.85,83.81 Z",
      "M 263.74,50.56 L 263.74,95.9 C 263.74,97.15 264.84,97.98 266.2,97.98 L 272.19,97.98 C 273.53,97.98 274.64,97.12 274.64,95.78 L 274.64,50.48 C 274.64,49.14 273.75,48.02 272.41,48.02 L 266.2,48.02 C 264.84,48 263.74,48.83 263.74,50.56 Z",
      "M 163.55,78.96 C 162.78,77.86 163.22,76.64 164.5,76.23 C 164.5,76.23 169.67,74.69 172.15,72.45 C 174.64,70.24 175.87,67.01 175.87,62.84 A 15.11,15.11 0 0,0 174.42,55.94 A 11.89,11.89 0 0,0 170.33,51.36 A 19.28,19.28 0 0,0 163.94,48.77 C 161.45,48.24 158.12,48.07 158.12,48.07 A 133.11,133.11 0 0,0 153.2,47.94 L 128.35,47.94 A 2.48,2.48 0 0,0 125.89,50.41 L 125.89,95.7 C 125.89,97.05 126.99,97.91 128.35,97.91 L 134.21,97.91 C 135.56,97.91 136.68,97.05 136.68,95.7 L 136.68,77.67 S 136.7,77.67 136.7,77.65 L 147.86,77.62 C 149.2,77.62 150.95,78.54 151.75,79.64 L 163.32,95.91 C 164.4,97.36 165.41,97.91 166.77,97.91 L 174.45,97.91 C 175.79,97.91 176.01,96.62 175.54,95.97 C 175.06,95.4 163.55,78.96 163.55,78.96 Z",
      "M 158.85,69.74 A 23.72,23.72 0 0,1 155.64,70.17 A 133.06,133.06 0 0,1 150.72,70.25 L 139.2,70.25 A 2.48,2.48 0 0,1 136.73,67.8 L 136.73,58.61 C 136.73,57.26 137.84,56.15 139.2,56.15 L 150.7,56.15 C 152.06,56.15 154.28,56.2 155.62,56.23 C 155.62,56.23 157.34,56.3 158.84,56.66 A 9.51,9.51 0 0,1 162.46,58.14 A 5.4,5.4 0 0,1 164.37,60.38 A 7.15,7.15 0 0,1 164.37,66.02 A 5.32,5.32 0 0,1 162.46,68.27 A 9.32,9.32 0 0,1 158.85,69.74 Z",
      "M 337.18,48 C 335.83,48 334.72,48.89 334.72,50.21 L 334.72,79.2 C 334.72,80.54 333.94,80.87 332.99,79.92 L 303.97,49.82 A 5.68,5.68 0 0,0 299.8,48.03 L 294.33,48.03 C 292.61,48.03 291.87,48.96 291.87,49.88 L 291.87,96.23 C 291.87,97.15 292.76,98.04 294.11,98.04 L 299.58,98.04 C 300.92,98.04 301.87,97.3 301.87,96.05 L 301.9,65.52 C 301.9,64.17 302.67,63.85 303.62,64.83 L 333.9,96.29 A 5.44,5.44 0 0,0 338.11,98.04 L 342.23,98.04 A 2.48,2.48 0 0,0 344.69,95.58 L 344.69,50.47 A 2.48,2.48 0 0,0 342.23,48 L 337.18,48 Z",
      "M 218.81,76.26 C 218.15,77.45 217.06,77.42 216.4,76.26 L 202.21,50.21 A 3.96,3.96 0 0,0 198.65,48 L 190.94,48 A 2.48,2.48 0 0,0 188.48,50.47 L 188.48,95.73 C 188.48,97.08 189.38,98 190.94,98 L 195.73,98 C 197.08,98 198.06,97.14 198.06,95.86 C 198.06,95.23 198.09,62.93 198.12,62.93 C 198.18,62.93 215.84,95.83 215.84,95.83 A 1.59,1.59 0 0,0 218.7,95.83 S 236.51,62.99 236.54,62.99 C 236.61,62.99 236.57,94.87 236.57,95.83 C 236.57,97.14 237.62,97.97 238.98,97.97 L 244.48,97.97 C 245.82,97.97 246.94,97.29 246.94,95.5 L 246.94,50.45 A 2.48,2.48 0 0,0 244.48,47.99 L 237.1,47.99 A 4,4 0 0,0 233.41,50.13 L 218.81,76.26 Z",
      "M 0,72.95 C 0,97.36 24.98,98.59 29.98,98.59 C 46.56,98.59 53.56,94.1 53.85,93.92 A 4.39,4.39 0 0,0 56.15,89.93 L 56.15,73.07 A 2.81,2.81 0 0,0 53.32,70.24 L 32.49,70.24 C 30.93,70.24 29.92,71.5 29.92,73.07 L 29.92,74.83 C 29.92,76.39 30.93,77.65 32.49,77.65 L 44.54,77.65 A 2.11,2.11 0 0,1 46.65,79.76 L 46.65,87.62 C 44.28,88.6 33.45,91.75 24.73,89.68 C 12.1,86.66 11.12,76.23 11.12,73.11 C 11.12,70.5 11.92,57.36 27.42,56.04 C 39.97,54.97 48.24,60.03 48.34,60.09 C 49.81,60.86 51.34,60.31 52.17,58.75 L 53.74,55.59 C 54.4,54.31 54.16,52.94 52.57,51.87 C 52.49,51.81 43.67,47.05 30.01,47.05 C 0.83,47.02 0,70.3 0,72.95 Z",
      "M 334.41,35.51 L 301.7,35.51 C 300.51,35.51 299.47,34.92 298.88,33.87 S 298.29,31.67 298.88,30.63 L 315.25,2.32 A 3.17,3.17 0 0,1 318.08,0.68 A 3.17,3.17 0 0,1 320.91,2.32 L 337.28,30.63 A 3.06,3.06 0 0,1 337.28,33.87 A 3.33,3.33 0 0,1 334.41,35.51 Z",
    ],
  },
  mark: {
    kind: "glyph",
    width: 104.7,
    optical: DEVICE_MARK_GLYPH,
    minPx: 9,
    label: "Garmin",
    paths: [
      "M 95.79,96.36 L 8.7,96.36 C 5.51,96.36 2.74,94.79 1.18,92.01 S -0.39,86.14 1.18,83.37 L 44.78,7.99 A 8.45,8.45 0 0,1 52.3,3.64 A 8.45,8.45 0 0,1 59.82,7.99 L 103.43,83.37 A 8.17,8.17 0 0,1 103.43,92.01 A 8.85,8.85 0 0,1 95.79,96.36 Z",
    ],
  },

};


/**
 * HYBRID's own silhouettes, for a connector whose logo we don't ship. These are
 * ours, so they may take the accent — but a caller that mixes them with a real
 * logo in one row should keep the row monochrome anyway.
 */
const WATCH_SILHOUETTE: DeviceMarkArt = {
  kind: "glyph",
  width: 72.1,
  optical: DEVICE_MARK_GLYPH,
  minPx: 10,
  label: "Watch",
  paths: [
    "M 24.39,0.15 L 41.36,0.15 A 7.42,7.42 0 0,1 48.79,7.58 L 48.79,16.06 A 7.42,7.42 0 0,1 41.36,23.48 L 24.39,23.48 A 7.42,7.42 0 0,1 16.97,16.06 L 16.97,7.58 A 7.42,7.42 0 0,1 24.39,0.15 Z",
    "M 24.39,76.52 L 41.36,76.52 A 7.42,7.42 0 0,1 48.79,83.94 L 48.79,92.42 A 7.42,7.42 0 0,1 41.36,99.85 L 24.39,99.85 A 7.42,7.42 0 0,1 16.97,92.42 L 16.97,83.94 A 7.42,7.42 0 0,1 24.39,76.52 Z",
    "M 19.09,19.24 L 46.67,19.24 A 19.09,19.09 0 0,1 65.76,38.33 L 65.76,61.67 A 19.09,19.09 0 0,1 46.67,80.76 L 19.09,80.76 A 19.09,19.09 0 0,1 0,61.67 L 0,38.33 A 19.09,19.09 0 0,1 19.09,19.24 Z",
    "M 20.15,26.67 L 45.61,26.67 A 12.73,12.73 0 0,1 58.33,39.39 L 58.33,60.61 A 12.73,12.73 0 0,1 45.61,73.33 L 20.15,73.33 A 12.73,12.73 0 0,1 7.42,60.61 L 7.42,39.39 A 12.73,12.73 0 0,1 20.15,26.67 Z",
    "M 67.88,39.39 L 68.94,39.39 A 3.18,3.18 0 0,1 72.12,42.58 L 72.12,55.3 A 3.18,3.18 0 0,1 68.94,58.48 L 67.88,58.48 A 3.18,3.18 0 0,1 64.7,55.3 L 64.7,42.58 A 3.18,3.18 0 0,1 67.88,39.39 Z",
  ],
};



const BAND_SILHOUETTE: DeviceMarkArt = {
  kind: "glyph",
  width: 124.3,
  optical: DEVICE_MARK_GLYPH,
  minPx: 10,
  label: "Band",
  paths: [
    "M 26.37,12.32 L 97.96,12.32 A 26.37,26.37 0 0,1 124.33,38.7 L 124.33,61.3 A 26.37,26.37 0 0,1 97.96,87.68 L 26.37,87.68 A 26.37,26.37 0 0,1 0,61.3 L 0,38.7 A 26.37,26.37 0 0,1 26.37,12.32 Z",
    "M 30.14,27.39 L 94.19,27.39 A 15.07,15.07 0 0,1 109.26,42.46 L 109.26,57.54 A 15.07,15.07 0 0,1 94.19,72.61 L 30.14,72.61 A 15.07,15.07 0 0,1 15.07,57.54 L 15.07,42.46 A 15.07,15.07 0 0,1 30.14,27.39 Z",
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
