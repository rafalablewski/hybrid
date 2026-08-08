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

// A standing mannequin, arms at the sides. The SAME silhouette serves front and
// back (a body's outline reads the same from either side); only the muscle
// regions differ. Hand-tuned schematic geometry — reads as a body, not a render.
const HEAD = { cx: 50, cy: 10, r: 6.5 };
const OUTLINE: Pt[][] = [
  // torso (neck → shoulders → waist → hips)
  [p(43, 17), p(57, 17), p(58, 19), p(71, 23), p(68, 41), p(61, 53), p(62, 60), p(38, 60), p(39, 53), p(32, 41), p(29, 23), p(42, 19)],
  // left arm, right arm
  [p(24, 24), p(31, 23), p(31, 59), p(24, 59)],
  [p(69, 23), p(76, 24), p(76, 59), p(69, 59)],
  // left leg, right leg
  [p(39, 60), p(49, 60), p(48, 80), p(47, 96), p(41, 96), p(40, 80)],
  [p(61, 60), p(51, 60), p(52, 80), p(53, 96), p(59, 96), p(60, 80)],
];

// ── FRONT muscles ───────────────────────────────────────────────────────────

const FRONT_REGIONS: MuscleRegion[] = [
  { muscle: "front-delts", side: "front", shapes: bi([p(31, 22), p(37, 23), p(37, 29), p(32, 30), p(30, 26)]) },
  { muscle: "side-delts", side: "front", shapes: bi([p(28, 24), p(31, 23), p(32, 30), p(27, 31), p(26, 27)]) },
  { muscle: "chest", side: "front", shapes: bi([p(40, 24), p(49, 25), p(49, 34), p(41, 35), p(38, 30)]) },
  { muscle: "biceps", side: "front", shapes: bi([p(25, 32), p(30, 31), p(30, 42), p(25, 42)]) },
  { muscle: "forearms", side: "front", shapes: bi([p(24, 44), p(30, 44), p(30, 58), p(25, 58)]) },
  { muscle: "abs", side: "front", shapes: one([p(44, 38), p(56, 38), p(55, 55), p(45, 55)]) },
  { muscle: "obliques", side: "front", shapes: bi([p(40, 39), p(43.5, 39), p(44.5, 54), p(41, 53)]) },
  { muscle: "hip-flexors", side: "front", shapes: bi([p(44, 56), p(49, 57), p(48, 62), p(44, 61)]) },
  { muscle: "quads", side: "front", shapes: bi([p(41, 63), p(49, 63), p(48, 80), p(42, 80)]) },
  { muscle: "adductors", side: "front", shapes: bi([p(46.5, 63), p(49, 63), p(49, 78), p(47.5, 78)]) },
  { muscle: "abductors", side: "front", shapes: bi([p(38, 61), p(41, 62), p(41, 73), p(38, 71)]) },
];

// ── BACK muscles ────────────────────────────────────────────────────────────

const BACK_REGIONS: MuscleRegion[] = [
  { muscle: "traps", side: "back", shapes: bi([p(43, 18), p(50, 19), p(50, 31), p(41, 28), p(42, 21)]) },
  { muscle: "rear-delts", side: "back", shapes: bi([p(30, 23), p(37, 24), p(37, 30), p(31, 31), p(29, 27)]) },
  { muscle: "upper-back", side: "back", shapes: bi([p(41, 29), p(49, 30), p(49, 39), p(42, 39), p(40, 34)]) },
  { muscle: "lats", side: "back", shapes: bi([p(37, 35), p(45, 37), p(46, 51), p(40, 53), p(35, 45)]) },
  { muscle: "lower-back", side: "back", shapes: bi([p(45, 45), p(49.5, 45), p(49.5, 58), p(46, 58)]) },
  { muscle: "triceps", side: "back", shapes: bi([p(25, 32), p(30, 31), p(30, 42), p(25, 42)]) },
  { muscle: "glutes", side: "back", shapes: bi([p(40, 59), p(49.5, 59), p(49.5, 71), p(41, 71)]) },
  { muscle: "hamstrings", side: "back", shapes: bi([p(42, 72), p(49, 72), p(48, 87), p(43, 87)]) },
  { muscle: "calves", side: "back", shapes: bi([p(42, 88), p(48, 88), p(47, 96), p(43, 96)]) },
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
