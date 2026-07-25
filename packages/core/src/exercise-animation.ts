import { gymExercise, type GymExercise } from "./exercise-db";

// EXERCISE ANIMATION — the movement demo shown on the exercise page, kept in its
// OWN module (separate from exercise-anatomy's muscles/cues) so the way the rep
// is DRAWN can be swapped without touching anything else.
//
// Today the demo is a procedural side-profile stick figure: each lift maps to a
// movement ARCHETYPE (squat, hinge, press, pull, curl, …), the archetype carries
// 2-3 skeleton keyframes, and `skeletonAt()` interpolates them into a looping
// rep. This is the unblocked, zero-asset stand-in while the licensed demo-clip /
// professional sketch animation is unavailable (see capabilities:
// exercise-video-library).
//
// THE SWAP SEAM: `exerciseAnimation(name)` returns a discriminated union —
// `SkeletonAnimation` (procedural) OR `SketchAnimation` (commissioned frames).
// When professional sketch animation is ready, register the asset per exercise
// (or per archetype) in `SKETCH_ANIMATIONS` and the resolver returns the sketch
// spec instead, with the procedural skeleton as the automatic fallback for any
// lift not yet drawn. The clients switch on `kind`, so the ONLY change to ship
// sketches is: (1) populate the registry, (2) add the sketch renderer branch —
// the muscle-activation / cues section never changes.

// ── movement taxonomy ───────────────────────────────────────────────────────

export type AnimArchetype =
  | "squat"
  | "lunge"
  | "hinge"
  | "hipThrust"
  | "pressH"
  | "pressV"
  | "dip"
  | "pullH"
  | "pullV"
  | "curl"
  | "extension"
  | "raise"
  | "calf"
  | "plank"
  | "crunch"
  | "hangingLeg"
  | "twist"
  | "jump"
  | "carry"
  | "olympic"
  | "generic";

const has = (name: string, ...needles: string[]): boolean => {
  const l = name.toLowerCase();
  return needles.some((n) => l.includes(n));
};

/** Which movement archetype a lift animates as — pattern-first, refined by
 *  category/name so a curl, a lateral raise and a triceps pushdown (all
 *  "isolation") each get the right motion. Shared by the animation keyframes and
 *  the anatomy module's stabilizers/cues, so both stay in lockstep. */
export function exerciseArchetype(e: GymExercise): AnimArchetype {
  const n = e.name;
  switch (e.pattern) {
    case "squat":
      return "squat";
    case "lunge":
      return "lunge";
    case "hinge":
      return has(n, "hip thrust", "glute bridge") ? "hipThrust" : "hinge";
    case "push-h":
      return "pressH";
    case "push-v":
      return has(n, "dip") ? "dip" : "pressV";
    case "pull-h":
      return "pullH";
    case "pull-v":
      return has(n, "upright row") ? "raise" : "pullV";
    case "olympic":
      return "olympic";
    case "carry":
      return "carry";
    case "plyo":
      return has(n, "slam", "ball", "rope") ? "twist" : "jump";
    case "core":
      if (has(n, "plank", "hold", "dead bug", "bird dog", "l-sit", "rollout", "bear crawl", "get-up")) return "plank";
      if (has(n, "twist", "pallof", "wood")) return "twist";
      if (has(n, "hanging", "toes-to-bar", "knee raise", "leg raise")) return "hangingLeg";
      return "crunch";
    case "isolation":
      if (e.category === "Calves" || has(n, "calf")) return "calf";
      if (e.category === "Biceps" || has(n, "curl")) return "curl";
      if (e.category === "Triceps" || has(n, "pushdown", "extension", "kickback", "skull", "jm")) return "extension";
      if (has(n, "raise", "fly", "face pull", "delt", "upright")) return "raise";
      if (e.category === "Abs & Core") return "crunch";
      return "curl";
  }
}

// ── the procedural skeleton ─────────────────────────────────────────────────

export interface Pt {
  x: number;
  y: number;
}

/** A side-profile stick-figure pose in a 0-100 box (x → right, y → down,
 *  ground ≈ 94). The figure faces right; `bar` is where the implement sits. */
export interface Skeleton {
  head: Pt;
  shoulder: Pt;
  elbow: Pt;
  hand: Pt;
  hip: Pt;
  knee: Pt;
  ankle: Pt;
  bar: Pt;
}

/** How the implement is drawn at `bar`. */
export type LoadGlyph = "barbell" | "dumbbell" | "kettlebell" | "bodyweight" | "fixed";

const p = (x: number, y: number): Pt => ({ x, y });
const Sk = (
  head: Pt, shoulder: Pt, elbow: Pt, hand: Pt, hip: Pt, knee: Pt, ankle: Pt, bar: Pt,
): Skeleton => ({ head, shoulder, elbow, hand, hip, knee, ankle, bar });

// Two (or three) keyframes per archetype; the clients ping-pong through them so
// the rep loops start → end → start. Hand-tuned schematic geometry — reads as
// the movement, not an anatomy render.
const KEYFRAMES: Record<AnimArchetype, Skeleton[]> = {
  squat: [
    Sk(p(50, 14), p(50, 29), p(42, 37), p(46, 30), p(50, 52), p(50, 73), p(50, 93), p(46, 29)),
    Sk(p(57, 31), p(53, 42), p(45, 50), p(48, 43), p(43, 64), p(60, 74), p(50, 93), p(49, 43)),
  ],
  lunge: [
    Sk(p(50, 13), p(50, 28), p(50, 40), p(50, 52), p(50, 50), p(52, 70), p(52, 92), p(50, 53)),
    Sk(p(50, 25), p(50, 40), p(50, 52), p(50, 64), p(50, 62), p(58, 74), p(52, 92), p(50, 65)),
  ],
  hinge: [
    Sk(p(50, 14), p(50, 29), p(52, 41), p(53, 54), p(50, 52), p(50, 73), p(50, 92), p(53, 55)),
    Sk(p(64, 30), p(58, 36), p(58, 52), p(57, 66), p(42, 55), p(52, 73), p(50, 92), p(57, 68)),
  ],
  hipThrust: [
    Sk(p(24, 50), p(30, 54), p(34, 62), p(38, 68), p(50, 70), p(66, 66), p(70, 86), p(50, 66)),
    Sk(p(24, 50), p(30, 54), p(34, 60), p(38, 64), p(50, 56), p(66, 62), p(70, 86), p(50, 52)),
  ],
  pressH: [
    Sk(p(26, 56), p(38, 58), p(40, 50), p(39, 46), p(66, 60), p(78, 70), p(86, 86), p(39, 44)),
    Sk(p(26, 56), p(38, 58), p(38, 46), p(38, 34), p(66, 60), p(78, 70), p(86, 86), p(38, 32)),
  ],
  pressV: [
    Sk(p(50, 15), p(50, 29), p(56, 38), p(52, 26), p(50, 52), p(50, 73), p(50, 92), p(50, 25)),
    Sk(p(49, 16), p(50, 28), p(51, 18), p(50, 8), p(50, 52), p(50, 73), p(50, 92), p(50, 6)),
  ],
  dip: [
    Sk(p(50, 18), p(50, 30), p(52, 42), p(52, 44), p(52, 54), p(54, 72), p(54, 90), p(52, 44)),
    Sk(p(52, 30), p(50, 42), p(58, 48), p(52, 44), p(52, 62), p(54, 78), p(54, 92), p(52, 44)),
  ],
  pullH: [
    Sk(p(64, 32), p(58, 38), p(60, 50), p(60, 64), p(42, 56), p(52, 72), p(50, 92), p(60, 66)),
    Sk(p(64, 32), p(58, 38), p(52, 44), p(56, 50), p(42, 56), p(52, 72), p(50, 92), p(56, 52)),
  ],
  pullV: [
    Sk(p(53, 26), p(50, 36), p(50, 25), p(50, 10), p(50, 58), p(50, 76), p(50, 90), p(50, 8)),
    Sk(p(53, 16), p(50, 26), p(50, 16), p(50, 10), p(50, 48), p(50, 66), p(50, 80), p(50, 8)),
  ],
  curl: [
    Sk(p(50, 14), p(50, 28), p(52, 42), p(54, 55), p(50, 53), p(50, 73), p(50, 92), p(54, 56)),
    Sk(p(50, 14), p(50, 28), p(52, 42), p(50, 33), p(50, 53), p(50, 73), p(50, 92), p(50, 32)),
  ],
  extension: [
    Sk(p(50, 14), p(50, 28), p(52, 42), p(52, 33), p(50, 53), p(50, 73), p(50, 92), p(52, 32)),
    Sk(p(50, 14), p(50, 28), p(52, 42), p(53, 54), p(50, 53), p(50, 73), p(50, 92), p(53, 55)),
  ],
  raise: [
    Sk(p(50, 14), p(50, 28), p(52, 40), p(53, 52), p(50, 53), p(50, 73), p(50, 92), p(53, 53)),
    Sk(p(50, 14), p(50, 28), p(58, 30), p(66, 28), p(50, 53), p(50, 73), p(50, 92), p(66, 28)),
  ],
  calf: [
    Sk(p(50, 15), p(50, 30), p(50, 42), p(50, 54), p(50, 54), p(50, 74), p(50, 92), p(50, 54)),
    Sk(p(50, 11), p(50, 26), p(50, 38), p(50, 50), p(50, 50), p(50, 70), p(50, 88), p(50, 50)),
  ],
  plank: [
    Sk(p(20, 54), p(30, 56), p(30, 62), p(24, 66), p(58, 60), p(74, 64), p(88, 68), p(24, 66)),
    Sk(p(20, 55), p(30, 57), p(30, 63), p(24, 67), p(58, 61), p(74, 65), p(88, 69), p(24, 67)),
  ],
  crunch: [
    Sk(p(22, 60), p(32, 62), p(30, 56), p(26, 52), p(64, 64), p(74, 54), p(80, 66), p(26, 52)),
    Sk(p(34, 52), p(40, 56), p(36, 50), p(32, 46), p(64, 64), p(74, 54), p(80, 66), p(32, 46)),
  ],
  hangingLeg: [
    Sk(p(50, 20), p(50, 30), p(50, 20), p(50, 10), p(50, 52), p(50, 70), p(50, 88), p(50, 8)),
    Sk(p(50, 20), p(50, 30), p(50, 20), p(50, 10), p(50, 50), p(64, 44), p(70, 34), p(50, 8)),
  ],
  twist: [
    Sk(p(50, 22), p(50, 34), p(54, 42), p(60, 46), p(50, 58), p(48, 74), p(48, 92), p(60, 46)),
    Sk(p(50, 22), p(50, 34), p(46, 42), p(40, 46), p(50, 58), p(52, 74), p(52, 92), p(40, 46)),
  ],
  jump: [
    Sk(p(50, 14), p(50, 28), p(44, 40), p(40, 48), p(50, 52), p(50, 73), p(50, 92), p(40, 48)),
    Sk(p(54, 26), p(52, 36), p(42, 48), p(36, 56), p(44, 58), p(58, 72), p(50, 92), p(36, 56)),
    Sk(p(50, 8), p(50, 22), p(52, 14), p(54, 6), p(50, 46), p(50, 64), p(50, 82), p(54, 6)),
  ],
  carry: [
    Sk(p(50, 14), p(50, 29), p(50, 42), p(50, 55), p(50, 53), p(54, 72), p(56, 92), p(50, 56)),
    Sk(p(50, 14), p(50, 29), p(50, 42), p(50, 55), p(50, 53), p(46, 72), p(44, 92), p(50, 56)),
  ],
  olympic: [
    Sk(p(62, 30), p(56, 36), p(58, 52), p(57, 70), p(44, 58), p(56, 70), p(50, 90), p(57, 72)),
    Sk(p(50, 12), p(50, 26), p(52, 38), p(53, 50), p(50, 50), p(50, 70), p(50, 88), p(53, 50)),
    Sk(p(49, 16), p(50, 28), p(51, 17), p(50, 7), p(50, 52), p(52, 64), p(50, 90), p(50, 6)),
  ],
  generic: [
    Sk(p(50, 14), p(50, 29), p(50, 42), p(50, 54), p(50, 52), p(50, 73), p(50, 92), p(50, 55)),
    Sk(p(50, 16), p(50, 31), p(50, 44), p(50, 56), p(50, 54), p(50, 74), p(50, 93), p(50, 57)),
  ],
};

const LOAD_GLYPH = (e: GymExercise): LoadGlyph => {
  switch (e.equipment) {
    case "barbell":
    case "ez-bar":
    case "trap-bar":
    case "smith":
    case "landmine":
      return "barbell";
    case "dumbbell":
      return "dumbbell";
    case "kettlebell":
      return "kettlebell";
    case "bodyweight":
      return "bodyweight";
    case "cable":
    case "machine":
    case "band":
      return "fixed";
    default:
      return "barbell";
  }
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const lerpPt = (a: Pt, b: Pt, t: number): Pt => p(lerp(a.x, b.x, t), lerp(a.y, b.y, t));
const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/**
 * The skeleton at cycle phase `phase` ∈ [0, 1). The phase is mapped to a
 * triangle wave so the rep goes start → end → start on a loop (for a 3-keyframe
 * archetype: start → mid → end → mid → start). Eased so it holds briefly at the
 * turnarounds like a real rep. Pure — both clients feed a time-driven phase and
 * render the returned points identically.
 */
export function skeletonAt(frames: Skeleton[], phase: number): Skeleton {
  if (frames.length === 1) return frames[0]!;
  const tri = phase < 0.5 ? phase * 2 : (1 - phase) * 2; // 0→1→0
  const u = easeInOut(Math.max(0, Math.min(1, tri)));
  const segs = frames.length - 1;
  const scaled = u * segs;
  const i = Math.min(segs - 1, Math.floor(scaled));
  const t = scaled - i;
  const a = frames[i]!, b = frames[i + 1]!;
  return Sk(
    lerpPt(a.head, b.head, t),
    lerpPt(a.shoulder, b.shoulder, t),
    lerpPt(a.elbow, b.elbow, t),
    lerpPt(a.hand, b.hand, t),
    lerpPt(a.hip, b.hip, t),
    lerpPt(a.knee, b.knee, t),
    lerpPt(a.ankle, b.ankle, t),
    lerpPt(a.bar, b.bar, t),
  );
}

// ── the animation spec (a swap-ready union) ─────────────────────────────────

/** The procedural stick-figure demo — the zero-asset default. */
export interface SkeletonAnimation {
  kind: "skeleton";
  archetype: AnimArchetype;
  frames: Skeleton[];
  load: LoadGlyph;
  /** milliseconds for one full rep loop. */
  cycleMs: number;
}

/** A commissioned professional sketch animation — ordered frame assets the
 *  client flips/cross-fades through. Not used yet; the shape the registry + the
 *  future sketch renderer share. `frames` are asset references (bundled require
 *  ids, remote URLs, or a sprite manifest) resolved by the client. */
export interface SketchAnimation {
  kind: "sketch";
  archetype: AnimArchetype;
  frames: string[];
  /** milliseconds for one full loop through the frames. */
  cycleMs: number;
  /** optional credit for the illustrator/source. */
  credit?: string;
}

export type ExerciseAnimation = SkeletonAnimation | SketchAnimation;

/**
 * Professional sketch animations, keyed by exact exercise name OR by archetype
 * (name wins). EMPTY today — every lift falls back to the procedural skeleton.
 *
 * To ship sketches, register them here (or hydrate this from an asset manifest):
 *   SKETCH_ANIMATIONS["Bench Press"] = { kind: "sketch", archetype: "pressH",
 *     frames: [...frameRefs], cycleMs: 2200, credit: "…" };
 * `exerciseAnimation()` then returns the sketch for that lift and the skeleton
 * for everything not yet drawn — no other code changes on the data side.
 */
export const SKETCH_ANIMATIONS: Record<string, SketchAnimation> = {};

/** Cardio/plyo reps are quicker; grinding barbell reps are slower. */
const cycleMsFor = (a: AnimArchetype): number =>
  a === "jump" || a === "twist" || a === "carry" ? 1600 : a === "olympic" ? 2600 : a === "plank" ? 3200 : 2200;

/** The animation spec for a lift, or null for a name the DB doesn't know. A
 *  registered sketch wins; otherwise the procedural skeleton is returned. This
 *  is the single swap point — the clients render whichever `kind` comes back. */
export function exerciseAnimation(name: string): ExerciseAnimation | null {
  const e = gymExercise(name);
  if (!e) return null;
  const archetype = exerciseArchetype(e);
  const sketch = SKETCH_ANIMATIONS[e.name] ?? SKETCH_ANIMATIONS[archetype];
  if (sketch) return sketch;
  return { kind: "skeleton", archetype, frames: KEYFRAMES[archetype], load: LOAD_GLYPH(e), cycleMs: cycleMsFor(archetype) };
}
