// ─────────────────────────────────────────────────────────────────────────────
// SPORT MARKS — the cover art a sport page signs itself with.
//
// The sport page's hero shipped with the catalog EMOJI as its ghost glyph. At
// 152pt an emoji is a full-colour illustration desaturated to grey: its detail
// dissolves, its weight fights the wash, and it cannot survive into the
// collapsed bar as texture the way the Hero System allows a monochrome ghost to
// (HERO.artFloor.ghost). These are drawn marks — stroke geometry in the same
// 72-unit box the app's icon set uses (theme/icons.ts), so they scale from a
// 24pt row to a 218pt emblem without re-tuning.
//
// THE MARK NAMES THE KIND, NOT THE INSTANCE. There are 65 sports and there are
// not 65 distinctive silhouettes — a tennis racket and a squash racket are the
// same drawing, and pretending otherwise would mean 65 near-duplicates to keep
// in step. So a mark is resolved per sport where the sport's own instrument or
// field is distinctive (a pool, a bike, an oar), and per CATEGORY otherwise.
// The title already says which sport it is; the art says what kind of thing it
// is, at 9% opacity, behind it.
//
// Shape data only — no React, no platform APIs. There is no dedicated
// sport-mark component: `sportMarkPaths()` is stroked straight into the hero's
// `artPaths` slot (apps/mobile/components/aurora/sport-page.tsx), because a
// sport mark is only ever cover art and a component whose one job is to be
// passed to one prop is a layer, not an abstraction.
// ─────────────────────────────────────────────────────────────────────────────

import { OLYMPIC_SPORTS, type SportCategory } from "../olympic-sports";

/** The drawn marks. Keep this list small — one per KIND of sport. */
export type SportMarkName =
  | "track"
  | "water"
  | "wheel"
  | "oar"
  | "bag"
  | "racket"
  | "ball"
  | "rings"
  | "target"
  | "peak"
  | "bar"
  | "ski"
  | "blade"
  | "sail"
  | "tri";

/**
 * Stroke paths in a 72×72 box, drawn with round caps and joins — the same
 * contract as AURORA_ICON_PATHS, so one renderer shape serves both.
 */
export const SPORT_MARK_PATHS: Record<SportMarkName, string[]> = {
  // A running track: the stadium oval, with its inner lane.
  track: [
    "M24 16H48A20 20 0 0 1 48 56H24A20 20 0 0 1 24 16Z",
    "M27 26H45A10 10 0 0 1 45 46H27A10 10 0 0 1 27 26Z",
  ],
  // Open water: three swells.
  water: [
    "M6 26C13 19 19 19 26 26S39 33 46 26 59 19 66 26",
    "M6 40C13 33 19 33 26 40S39 47 46 40 59 33 66 40",
    "M6 54C13 47 19 47 26 54S39 61 46 54 59 47 66 54",
  ],
  // A bicycle: two wheels, the frame between them, the crank at its centre.
  // (Every closed circle here is drawn as TWO half-arcs. A single arc that
  // returns to its own start point is degenerate — the first cut of this file
  // used that trick and two of the marks silently rendered as nothing.)
  wheel: [
    "M18 48A12 12 0 1 0 42 48A12 12 0 1 0 18 48Z",
    "M42 48A12 12 0 1 0 66 48A12 12 0 1 0 42 48Z",
    "M30 48L38 28H50",
    "M38 28L54 48",
    "M30 48H46",
  ],
  // An oar: the shaft and its blade.
  oar: [
    "M14 58L44 28",
    "M44 28C48 24 55 15 58 12 61 15 56 22 52 26 48 30 44 32 41 31Z",
    "M20 52L26 58",
  ],
  // A heavy bag on its chain — combat, without a fist.
  bag: [
    "M28 22H44A4 4 0 0 1 48 26L46 50A10 10 0 0 1 26 50L24 26A4 4 0 0 1 28 22Z",
    "M36 22V14",
    "M32 11A4 4 0 1 0 40 11A4 4 0 1 0 32 11Z",
    "M25 36H47",
  ],
  // A racket: the head, the handle, one string each way.
  racket: [
    "M36 6C43 6 49 14 49 24C49 34 43 42 36 42C29 42 23 34 23 24C23 14 29 6 36 6Z",
    "M33 42V62",
    "M39 42V62",
    "M33 62H39",
    "M36 8V40",
    "M24 24H48",
  ],
  // A ball: the sphere and two seams.
  ball: [
    "M12 36A24 24 0 1 0 60 36A24 24 0 1 0 12 36Z",
    "M14 27C24 33 48 33 58 27",
    "M14 45C24 39 48 39 58 45",
  ],
  // Gymnastic rings on their straps.
  rings: [
    "M24 10V26",
    "M48 10V26",
    "M14 38A10 10 0 1 0 34 38A10 10 0 1 0 14 38Z",
    "M38 38A10 10 0 1 0 58 38A10 10 0 1 0 38 38Z",
  ],
  // A target: the rings and the mark at the centre.
  target: [
    "M10 36A26 26 0 1 0 62 36A26 26 0 1 0 10 36Z",
    "M22 36A14 14 0 1 0 50 36A14 14 0 1 0 22 36Z",
    "M32 36A4 4 0 1 0 40 36A4 4 0 1 0 32 36Z",
  ],
  // Two peaks — the outdoor sports.
  peak: [
    "M6 56L26 22L38 42",
    "M30 56L46 28L66 56Z",
  ],
  // A barbell: the bar, its sleeves, its plates.
  bar: [
    "M8 36H64",
    "M20 22V50",
    "M28 26V46",
    "M44 26V46",
    "M52 22V50",
  ],
  // A ski and its pole. (Two skis side by side, which is the obvious drawing,
  // reads as a pair of lowercase f's — the binding crossbar lands exactly where
  // the letter's does.)
  ski: [
    "M18 60L32 18C33 14 37 12 43 14",
    "M26 42H36",
    "M52 14L46 58",
    "M42 50H50",
  ],
  // A skate blade under its plate.
  blade: [
    "M24 10H36V28H44A8 8 0 0 1 52 36V44H24Z",
    "M18 54H48A8 8 0 0 0 54 46",
    "M30 44V54",
    "M44 44V54",
  ],
  // A sail on the water.
  sail: [
    "M36 8V50",
    "M36 12L58 50H36",
    "M32 50L14 50 30 22",
    "M8 60C14 55 20 55 26 60S38 65 44 60 56 55 62 60",
  ],
  // Three stages, one race — the multisport mark.
  tri: [
    "M14 18L30 36L14 54",
    "M30 18L46 36L30 54",
    "M46 18L62 36L46 54",
  ],
};

/** The mark a whole CATEGORY wears when a sport has no distinctive one. */
const BY_CATEGORY: Record<SportCategory, SportMarkName> = {
  Athletics: "track",
  Aquatics: "water",
  Cycling: "wheel",
  Combat: "bag",
  Racket: "racket",
  Team: "ball",
  Gymnastics: "rings",
  Target: "target",
  Outdoor: "peak",
  Strength: "bar",
  Winter: "ski",
  Multisport: "tri",
};

/**
 * Sports whose own instrument is distinctive enough to earn a mark of their
 * own, against their category's. Everything absent here takes its category's.
 */
const BY_SPORT: Record<string, SportMarkName> = {
  Rowing: "oar",
  "Canoe Sprint": "oar",
  "Canoe Slalom": "oar",
  Sailing: "sail",
  Surfing: "sail",
  "Speed Skating": "blade",
  "Short Track": "blade",
  "Figure Skating": "blade",
  "Ice Hockey": "blade",
  Skateboarding: "blade",
  Climbing: "peak",
  Equestrian: "peak",
  Weightlifting: "bar",
  "Track & Field": "track",
};

/**
 * The mark for a sport, or null when the name is not in the catalog at all —
 * a hand-typed activity has no kind to draw, and the caller falls back to the
 * emoji rather than to a mark that would be a guess.
 */
export function sportMark(name: string): SportMarkName | null {
  const own = BY_SPORT[name];
  if (own) return own;
  const cat = OLYMPIC_SPORTS[name]?.category;
  return cat ? BY_CATEGORY[cat] : null;
}

/** The paths for a sport, ready to stroke. Empty when it has no mark. */
export function sportMarkPaths(name: string): string[] {
  const mark = sportMark(name);
  return mark ? SPORT_MARK_PATHS[mark] : [];
}
