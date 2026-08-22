import { gymExercise, type Muscle } from "./exercise-db";
import type { Pt } from "./exercise-animation";
import {
  muscleActivation,
  MUSCLE_LABEL,
  MUSCLE_SHORT,
  type ActivationLevel,
  type ActivationTier,
  type MuscleActivation,
} from "./exercise-anatomy";

// EXERCISE BODY-MAP — the front/back anatomical highlight that complements the
// side-profile MOVEMENT ANIMATION (exercise-animation.ts) with a "where the
// effort lands" view. Like the animation it is PURE, SHARED geometry authored
// once in core and rendered identically on BOTH clients (web + mobile): a clean
// schematic mannequin — two figures (front + back), each muscle a simple polygon
// region — where every region GLOWS in proportion to that lift's share of
// effort. The intensity is driven by the SAME muscleActivation() data as the
// ranked bars, so the picture and the numbers can never drift.
//
//   • FRONT + BACK, so posterior-chain lifts (deadlift, pull-up) light up their
//     hamstrings/glutes/lats/erectors — a single view would miss half the body.
//   • Each Muscle is assigned to EXACTLY ONE figure (its canonical view), so a
//     muscle never appears in two places with two intensities.
//   • INTENSITY = share of effort: a muscle's glow = its pct ÷ the top mover's
//     pct (0..1). Primary movers glow bright, secondary dimmer, untargeted faint
//     — one hue, opacity carries the signal.
//
// Deliberately SCHEMATIC (mannequin + region shapes), not a medical render —
// pure portable geometry both clients draw the same way, same as the animation.

// ── the schematic figure ────────────────────────────────────────────────────

export type BodySide = "front" | "back";

/** A muscle drawn on one figure as one or two polygons (bilateral muscles carry
 *  a left + right shape). Coordinates live in a 0-100 box (x → right, y → down),
 *  matching the animation module's convention. */
export interface MuscleRegion {
  muscle: Muscle;
  side: BodySide;
  shapes: Pt[][];
}

/** One schematic figure (front or back): a faint silhouette + head that give the
 *  mannequin its form, plus the muscle regions painted on top. */
export interface BodyFigure {
  side: BodySide;
  head: { cx: number; cy: number; r: number };
  /** silhouette parts (torso, arms, legs) drawn as a faint base. */
  outline: Pt[][];
  /** the muscles that live on this view, in draw order. */
  regions: MuscleRegion[];
}

const p = (x: number, y: number): Pt => ({ x, y });
/** mirror a polygon about the vertical mid-line (x = 50). */
const mirror = (poly: Pt[]): Pt[] => poly.map((q) => p(100 - q.x, q.y));
/** a bilateral muscle: the authored (left) shape + its mirror (right). */
const bi = (poly: Pt[]): Pt[][] => [poly, mirror(poly)];
/** a single central muscle (abs) — one shape spanning the mid-line. */
const one = (poly: Pt[]): Pt[][] => [poly];

/**
 * A CLOSED SHAPE AS A SMOOTH PATH — the geometry's own de-robotiser.
 *
 * The mannequin's parts are polygons, and a polygon of four or five points
 * renders as exactly what it is: an arm was `[24,24 → 31,23 → 31,59 → 24,59]`,
 * a literal rectangle, and the figure read as an action figure rather than a
 * body. Bodies have no straight edges.
 *
 * Rather than hand-author fifty-point outlines, the points are treated as a
 * CATMULL-ROM spline through which a cubic Bézier is fitted — every authored
 * point is still passed through exactly, so the anatomy stays where it was
 * placed, and the segments between them arrive curved. `tension` 0 is a
 * straight polygon and 1 is the loosest curve; the default is the value that
 * reads as muscle without ballooning a narrow shape like the obliques.
 *
 * Lives in core because it IS the geometry: the mobile figure, the share card
 * and any future surface must draw the same body, and a smoothing pass applied
 * per client is two bodies waiting to disagree.
 */
export function bodyPath(pts: Pt[], tension = 0.5): string {
  const n = pts.length;
  if (n < 3) return "";
  const k = tension / 6;
  const at = (i: number): Pt => pts[((i % n) + n) % n]!;
  let d = `M${at(0).x.toFixed(2)} ${at(0).y.toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1x = p1.x + (p2.x - p0.x) * k;
    const c1y = p1.y + (p2.y - p0.y) * k;
    const c2x = p2.x - (p3.x - p1.x) * k;
    const c2y = p2.y - (p3.y - p1.y) * k;
    d += ` C${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return `${d}Z`;
}

/**
 * MUSCLE FIBRES — the short strokes that make a drawing read as anatomy.
 *
 * WHY THIS EXISTS. The last open case on the session summary was "commissioned
 * anatomical illustration", held behind `SKETCH_BODY_ART` and priced as a
 * purchase. It is not one. What separates an anatomical drawing from a
 * silhouette is not resolution — it is that the muscles are DRAWN: a contour,
 * and fibres running the length of the belly. Both are geometry, and the
 * geometry is already here.
 *
 * So the figure joins the instrument family as a TRACE. Every muscle is
 * stroked rather than filled, and these are the strokes inside it: lines
 * parallel to the muscle's own long axis, spaced across its width, which the
 * client clips to the muscle's shape.
 *
 * THE AXIS IS COMPUTED, NOT AUTHORED. The principal component of the polygon's
 * vertices IS the direction the belly runs — a lat is broad and diagonal, a
 * bicep is long and vertical, and each gets fibres along its own grain without
 * anybody hand-placing them. Hand-placing would also mean re-placing them every
 * time a shape is retouched, which is how illustration goes stale.
 *
 * Returns segments in the same 0–100 space as the shapes.
 */
export function muscleFibres(shape: Pt[], count = 3): [Pt, Pt][] {
  const n = shape.length;
  if (n < 3 || count < 1) return [];
  let cx = 0;
  let cy = 0;
  for (const q of shape) {
    cx += q.x;
    cy += q.y;
  }
  cx /= n;
  cy /= n;

  // Covariance of the vertices; its dominant eigenvector is the long axis.
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const q of shape) {
    const dx = q.x - cx;
    const dy = q.y - cy;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  // Closed form for the principal angle of a 2×2 covariance matrix.
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ux = Math.cos(theta);
  const uy = Math.sin(theta);
  const vx = -uy;
  const vy = ux;

  let uMin = Infinity;
  let uMax = -Infinity;
  let vMin = Infinity;
  let vMax = -Infinity;
  for (const q of shape) {
    const dx = q.x - cx;
    const dy = q.y - cy;
    const u = dx * ux + dy * uy;
    const v = dx * vx + dy * vy;
    uMin = Math.min(uMin, u);
    uMax = Math.max(uMax, u);
    vMin = Math.min(vMin, v);
    vMax = Math.max(vMax, v);
  }
  // Overrun the long axis so a clipped fibre reaches the muscle's real edge
  // rather than stopping at the bounding extent of its vertices.
  const over = (uMax - uMin) * 0.15;
  const out: [Pt, Pt][] = [];
  for (let i = 1; i <= count; i++) {
    const v = vMin + ((vMax - vMin) * i) / (count + 1);
    out.push([
      p(cx + ux * (uMin - over) + vx * v, cy + uy * (uMin - over) + vy * v),
      p(cx + ux * (uMax + over) + vx * v, cy + uy * (uMax + over) + vy * v),
    ]);
  }
  return out;
}

// A standing mannequin, arms at the sides. The SAME silhouette serves front and
// back (a body's outline reads the same from either side); only the muscle
// regions differ. Hand-tuned schematic geometry — reads as a body, not a render.
const HEAD = { cx: 50, cy: 9.5, r: 6.2 };

/**
 * THE SILHOUETTE, re-authored with the taper a body actually has: shoulders
 * that slope off the neck, a waist that draws in above the hips, arms that
 * narrow to the wrist, thighs that swell and knees that do not, a calf belly
 * high on the shin. Every part is drawn through `bodyPath`, so the segments
 * between these points arrive curved — the points place the anatomy, the spline
 * removes the corners.
 *
 * What was here before was five convex blocks, two of them literal rectangles,
 * and it read as an action figure. That is not a rendering nitpick: this figure
 * is the centrepiece of the session's share card, and a body is the one picture
 * a training app has that a spreadsheet does not.
 */
const OUTLINE: Pt[][] = [
  // torso — neck, trapezius slope, deltoid cap, lat flare, waist, hip shelf
  [
    p(45.5, 16), p(54.5, 16), p(58, 18), p(64, 20.5), p(68.5, 24), p(69.5, 29),
    p(67.5, 35), p(64.5, 41), p(62.5, 47), p(62, 52), p(63, 57), p(62.5, 61),
    p(37.5, 61), p(37, 57), p(38, 52), p(37.5, 47), p(35.5, 41), p(32.5, 35),
    p(30.5, 29), p(31.5, 24), p(36, 20.5), p(42, 18),
  ],
  // left arm — deltoid, biceps belly, elbow, forearm, wrist
  [p(30.5, 25), p(27, 28), p(25, 34), p(24.5, 41), p(25, 47), p(24.5, 53), p(25.5, 59), p(29, 59), p(29.5, 52), p(30, 45), p(31, 38), p(32, 30)],
  // right arm (mirrored)
  [p(69.5, 25), p(73, 28), p(75, 34), p(75.5, 41), p(75, 47), p(75.5, 53), p(74.5, 59), p(71, 59), p(70.5, 52), p(70, 45), p(69, 38), p(68, 30)],
  // left leg — glute shelf, thigh swell, knee, calf belly, ankle
  [p(38, 61), p(49, 61), p(49, 70), p(48.5, 78), p(47.5, 83), p(47, 89), p(46, 95), p(42, 95), p(41, 89), p(40.5, 83), p(39.5, 78), p(38.5, 70)],
  // right leg (mirrored)
  [p(62, 61), p(51, 61), p(51, 70), p(51.5, 78), p(52.5, 83), p(53, 89), p(54, 95), p(58, 95), p(59, 89), p(59.5, 83), p(60.5, 78), p(61.5, 70)],
];

// ── FRONT muscles ───────────────────────────────────────────────────────────

const FRONT_REGIONS: MuscleRegion[] = [
  { muscle: "front-delts", side: "front", shapes: bi([p(33, 21.5), p(37.5, 23), p(38, 27.5), p(36, 31), p(32, 30.5), p(30.5, 26.5), p(31, 23)]) },
  { muscle: "side-delts", side: "front", shapes: bi([p(31, 22.5), p(32, 30.5), p(29, 32), p(26.5, 30), p(26, 26), p(28, 23)]) },
  { muscle: "chest", side: "front", shapes: bi([p(41, 24), p(48.5, 25.5), p(49, 31), p(48, 35.5), p(43, 36), p(39, 33), p(37.5, 28.5)]) },
  { muscle: "biceps", side: "front", shapes: bi([p(27.5, 31), p(31, 32), p(31, 38), p(30, 43), p(26.5, 43), p(25.5, 38), p(26, 34)]) },
  { muscle: "forearms", side: "front", shapes: bi([p(25.5, 45), p(29.5, 45), p(29.5, 51), p(28.5, 57), p(26, 57), p(25, 51)]) },
  { muscle: "abs", side: "front", shapes: one([p(44.5, 37.5), p(55.5, 37.5), p(56, 45), p(55, 51), p(53.5, 56), p(46.5, 56), p(45, 51), p(44, 45)]) },
  { muscle: "obliques", side: "front", shapes: bi([p(40, 39), p(44, 39.5), p(44.5, 47), p(45, 54), p(42, 54.5), p(39.5, 48), p(39, 43)]) },
  { muscle: "hip-flexors", side: "front", shapes: bi([p(44.5, 56.5), p(49, 57), p(48.5, 61), p(46.5, 62.5), p(44, 61)]) },
  { muscle: "quads", side: "front", shapes: bi([p(41.5, 63), p(48.5, 63), p(48.5, 70), p(48, 76), p(46.5, 80.5), p(43, 80.5), p(41.5, 76), p(40.5, 69)]) },
  { muscle: "adductors", side: "front", shapes: bi([p(46, 63.5), p(49, 63.5), p(49, 71), p(48.5, 78), p(47, 78), p(46, 71)]) },
  { muscle: "abductors", side: "front", shapes: bi([p(38.5, 62), p(41.5, 63), p(41.5, 68), p(41, 73.5), p(38.5, 72.5), p(38, 67)]) },
];

// ── BACK muscles ────────────────────────────────────────────────────────────

const BACK_REGIONS: MuscleRegion[] = [
  { muscle: "traps", side: "back", shapes: bi([p(43.5, 17.5), p(49.5, 18.5), p(49.5, 26), p(48, 31), p(43, 29.5), p(40.5, 25), p(41.5, 20)]) },
  { muscle: "rear-delts", side: "back", shapes: bi([p(32, 22.5), p(37, 24), p(37.5, 29), p(35, 31.5), p(31, 31), p(29.5, 26.5)]) },
  { muscle: "upper-back", side: "back", shapes: bi([p(41.5, 29), p(49, 30), p(49, 36), p(48, 40), p(43, 39.5), p(40, 35.5), p(39.5, 32)]) },
  { muscle: "lats", side: "back", shapes: bi([p(37, 34.5), p(44, 36.5), p(45.5, 42), p(46, 48), p(45, 52.5), p(40.5, 53), p(37, 47), p(35, 40.5)]) },
  { muscle: "lower-back", side: "back", shapes: bi([p(45.5, 45), p(49.5, 45), p(49.5, 52), p(49, 58), p(46.5, 58), p(45, 52)]) },
  { muscle: "triceps", side: "back", shapes: bi([p(26.5, 31), p(30.5, 32), p(30.5, 37), p(29.5, 43), p(26, 43), p(25, 37.5)]) },
  { muscle: "glutes", side: "back", shapes: bi([p(40, 59.5), p(49.5, 59.5), p(49.5, 66), p(48.5, 70.5), p(44, 72), p(40.5, 69), p(39.5, 64)]) },
  { muscle: "hamstrings", side: "back", shapes: bi([p(42, 72.5), p(48.5, 72.5), p(48, 79), p(47, 85), p(43.5, 86.5), p(42, 80)]) },
  { muscle: "calves", side: "back", shapes: bi([p(42.5, 87.5), p(47.5, 87.5), p(47, 91), p(46, 95.5), p(43.5, 95.5), p(42.5, 91)]) },
];

export const BODY_FRONT: BodyFigure = { side: "front", head: HEAD, outline: OUTLINE, regions: FRONT_REGIONS };
export const BODY_BACK: BodyFigure = { side: "back", head: HEAD, outline: OUTLINE, regions: BACK_REGIONS };
export const BODY_FIGURES: BodyFigure[] = [BODY_FRONT, BODY_BACK];

/** Which figure a muscle lives on (its canonical view) — derived from the
 *  regions so it can never drift from the geometry. */
export const MUSCLE_SIDE: Record<Muscle, BodySide> = Object.fromEntries(
  [...FRONT_REGIONS, ...BACK_REGIONS].map((r) => [r.muscle, r.side]),
) as Record<Muscle, BodySide>;

/** The polygons for a muscle (empty if — impossibly — unmapped). */
const REGION_OF: Record<Muscle, Pt[][]> = Object.fromEntries(
  [...FRONT_REGIONS, ...BACK_REGIONS].map((r) => [r.muscle, r.shapes]),
) as Record<Muscle, Pt[][]>;

export const muscleRegion = (m: Muscle): Pt[][] => REGION_OF[m] ?? [];

// ── the swap seam: schematic today, professional sketch later ────────────────
//
// Mirrors exercise-media's sketch-registry seam. The schematic mannequin is
// the zero-asset default; when commissioned ANATOMICAL ILLUSTRATION exists,
// populate SKETCH_BODY_ART and exerciseBodyMap() flips every lift to the sketch
// renderer — the muscle-activation / cues section never changes, and the SAME
// intensity data (muscleGlows) drives the highlight opacities. Unlike the
// per-exercise animation registry, the body ART IS GLOBAL: the illustration
// doesn't change per lift — only WHICH muscles glow — so this is one art set,
// not a name→asset map.

export interface SketchBodyArt {
  /** base anatomical illustration per side (asset refs the client resolves —
   *  bundled require ids, remote URLs, or data URIs). */
  front: string;
  back: string;
  /** per-muscle highlight overlays, composited over the base at that muscle's
   *  glow intensity. A muscle with no overlay simply doesn't highlight. */
  overlays: Partial<Record<Muscle, { front?: string; back?: string }>>;
  /** optional credit for the illustrator/source. */
  credit?: string;
}

/**
 * The commissioned art, or null. EMPTY today — every lift renders the procedural
 * schematic mannequin. Set `.art` (e.g. hydrated from an asset manifest) and
 * exerciseBodyMap() returns kind:"sketch" for ALL lifts; the clients' sketch
 * renderer branch (wired but dormant) then composites base + overlays. This is
 * the single data swap point — nothing else changes to ship the pro art.
 */
export const SKETCH_BODY_ART: { art: SketchBodyArt | null } = { art: null };

// ── activation → glow ───────────────────────────────────────────────────────

export interface MuscleGlow {
  muscle: Muscle;
  side: BodySide;
  label: string;
  short: string;
  tier: ActivationTier;
  level: ActivationLevel;
  /** share of total muscular effort, whole-number % (from muscleActivation). */
  pct: number;
  /** normalized glow, pct ÷ the top mover's pct, in (0, 1]. */
  intensity: number;
}

export interface ExerciseBodyMap {
  name: string;
  /** how the body is DRAWN — the swap seam: the schematic mannequin today, the
   *  commissioned anatomical sketch once SKETCH_BODY_ART is populated. */
  kind: "schematic" | "sketch";
  /** every targeted muscle with its glow, ranked (brightest first). */
  glow: MuscleGlow[];
  /** muscle → glow intensity in [0, 1]; 0 for muscles this lift doesn't target. */
  intensityOf: Record<Muscle, number>;
  /** the schematic figures — always present (the fallback the sketch replaces). */
  figures: BodyFigure[];
  /** commissioned art, present iff kind === "sketch". */
  sketch: SketchBodyArt | null;
}

/** Turn ranked muscle activation into per-muscle glow intensities — the top
 *  mover glows at 1, the rest scale by their share. Pure: the clients pass the
 *  activation they already resolved so the map and the bars share one source. */
export function muscleGlows(activation: MuscleActivation[]): MuscleGlow[] {
  const maxPct = Math.max(1, ...activation.map((a) => a.pct));
  return activation.map((a) => ({
    muscle: a.muscle,
    side: MUSCLE_SIDE[a.muscle],
    label: MUSCLE_LABEL[a.muscle],
    short: MUSCLE_SHORT[a.muscle],
    tier: a.tier,
    level: a.level,
    pct: a.pct,
    intensity: a.pct / maxPct,
  }));
}

/** The body-map for a lift, or null for a name the DB doesn't know (custom
 *  lifts, cardio sports) — the section skips, same as the anatomy pill. */
export function exerciseBodyMap(name: string): ExerciseBodyMap | null {
  const e = gymExercise(name);
  if (!e) return null;
  const glow = muscleGlows(muscleActivation(e));
  const intensityOf = Object.fromEntries(
    (Object.keys(MUSCLE_SHORT) as Muscle[]).map((m) => [m, 0]),
  ) as Record<Muscle, number>;
  for (const g of glow) intensityOf[g.muscle] = g.intensity;
  const sketch = SKETCH_BODY_ART.art;
  return { name: e.name, kind: sketch ? "sketch" : "schematic", glow, intensityOf, figures: BODY_FIGURES, sketch };
}

// ── the ROOM mark: one figure, this group's muscles lit ─────────────────────
//
// The exercise picker's "rooms" grid (Chest, Back, Quads & Glutes, …) used to
// tile each room with its INITIALS — the same noise the lift rows carried
// before they took implement marks (exercise-marks.ts). A room has no implement
// to draw: it's a muscle group, so its mark is the BODY, with the muscles that
// room trains lit on it.
//
// Driven by the room's own exercise list rather than a hand-typed
// category→muscles table, so it cannot drift from the catalog and works for any
// room — the built-ins' pattern buckets, the admin library's muscle groups, and
// whatever an admin adds later.
//
// ONE figure, not two: at tile size a front/back pair would be ~12px each. The
// side carrying more of the room's work wins, which is the side an athlete
// pictures anyway (Chest → front, Back → back). The room's label says the rest.

/** A room's body mark: which figure to draw, and how brightly each muscle on it
 *  glows. */
export interface BodyMark {
  side: BodySide;
  figure: BodyFigure;
  /** muscle → glow in [0, 1]; 0 for muscles this room barely touches. */
  intensityOf: Record<Muscle, number>;
  /** the room's top mover on that figure — the mark's accessible label. */
  top: Muscle | null;
}

/** Below this share of the room's top mover a muscle stays dark: at tile size a
 *  dozen faintly-lit regions read as a smudge, not as a group. */
const ROOM_GLOW_FLOOR = 0.25;

/** How much a lift's own muscles count toward its room: prime movers by their
 *  order of importance, assisting muscles at a fraction. Cheap by design — this
 *  runs for every room in a grid, not for one exercise page. */
const PRIMARY_WEIGHT = [2, 1.5, 1];
const SECONDARY_WEIGHT = 0.5;

const roomCache = new Map<string, BodyMark | null>();

/**
 * The body mark for a room, from the lifts it holds. Null when none of the
 * names are gym lifts the DB knows (a sports room, an empty room) — the caller
 * keeps whatever glyph it draws today rather than showing an unlit body.
 */
export function roomBodyMark(names: string[]): BodyMark | null {
  const key = names.join("|");
  const hit = roomCache.get(key);
  if (hit !== undefined) return hit;

  const weight = new Map<Muscle, number>();
  let known = 0;
  for (const name of names) {
    const e = gymExercise(name);
    if (!e) continue;
    known++;
    e.primary.forEach((m, i) => weight.set(m, (weight.get(m) ?? 0) + (PRIMARY_WEIGHT[i] ?? 1)));
    for (const m of e.secondary) weight.set(m, (weight.get(m) ?? 0) + SECONDARY_WEIGHT);
  }

  if (known === 0 || weight.size === 0) {
    roomCache.set(key, null);
    return null;
  }

  // The side that carries more of the room's work is the one worth drawing.
  let front = 0, back = 0;
  for (const [m, w] of weight) (MUSCLE_SIDE[m] === "front" ? (front += w) : (back += w));
  const side: BodySide = back > front ? "back" : "front";
  const figure = side === "front" ? BODY_FRONT : BODY_BACK;

  const onSide = [...weight].filter(([m]) => MUSCLE_SIDE[m] === side);
  const max = Math.max(...onSide.map(([, w]) => w));
  const intensityOf = Object.fromEntries(
    (Object.keys(MUSCLE_SHORT) as Muscle[]).map((m) => [m, 0]),
  ) as Record<Muscle, number>;
  let top: Muscle | null = null;
  for (const [m, w] of onSide) {
    const intensity = w / max;
    if (intensity < ROOM_GLOW_FLOOR) continue;
    intensityOf[m] = intensity;
    if (w === max) top = m;
  }

  const mark: BodyMark = { side, figure, intensityOf, top };
  roomCache.set(key, mark);
  return mark;
}
