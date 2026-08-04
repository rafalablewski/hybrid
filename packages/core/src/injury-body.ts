import { BODY_FRONT, BODY_BACK, muscleRegion, MUSCLE_SIDE, type BodyFigure, type BodySide } from "./body-map";
import type { Muscle } from "./exercise-db";
import type { Pt } from "./exercise-animation";
import type { MuscleGroup } from "./engines/types";
import { ALL_MUSCLES } from "./engines/movements";

/**
 * THE INJURED BODY — the seven trackable areas drawn ON the shared mannequin.
 *
 * Asking "which area is hurt?" with a row of word-chips puts a form between an
 * athlete and their own body, and it asks the question in a vocabulary that is
 * ours, not theirs ("Posterior"). The body is a THING; you point at it. So the
 * picker is the mannequin — the SAME schematic figure the exercise body-map
 * already draws (body-map.ts) — with the seven engine areas painted on it as
 * touchable regions.
 *
 * Everything here is pure, shared geometry: both clients render identical
 * figures and resolve a touch through the identical hit test, so the picture
 * an athlete points at on the phone is the picture they point at on the web.
 *
 * Only the SEVEN areas the engines actually track are drawn as live regions —
 * a biceps or a shin is left as faint silhouette, because a picker must not
 * offer what the model cannot carry. That legibility IS the affordance: the
 * regions you can choose are the ones that are drawn.
 */

/** The muscles each engine area is drawn from, in draw order. Every area's
 *  muscles live on ONE figure (asserted by the test), so an area never appears
 *  twice with two meanings. */
const AREA_MUSCLES: Record<MuscleGroup, Muscle[]> = {
  quads: ["quads"],
  glutes: ["glutes"],
  posterior: ["hamstrings", "calves"],
  back: ["traps", "upper-back", "lats", "lower-back"],
  chest: ["chest"],
  shoulders: ["front-delts", "side-delts"],
  triceps: ["triceps"],
};

/** One touchable area: its polygons on a figure, plus the centre of each
 *  polygon (bilateral areas carry a left and a right centre). */
export interface InjuryArea {
  group: MuscleGroup;
  side: BodySide;
  /** the polygons to paint, in a 0-100 box (x → right, y → down). */
  shapes: Pt[][];
  /** each shape's centre — what the hit test measures against. */
  centres: Pt[];
}

/** A figure with the injury areas painted on it, rather than muscle regions. */
export interface InjuryFigure {
  side: BodySide;
  head: { cx: number; cy: number; r: number };
  outline: Pt[][];
  areas: InjuryArea[];
}

const centre = (poly: Pt[]): Pt => ({
  x: poly.reduce((s, q) => s + q.x, 0) / poly.length,
  y: poly.reduce((s, q) => s + q.y, 0) / poly.length,
});

const buildArea = (group: MuscleGroup): InjuryArea => {
  const muscles = AREA_MUSCLES[group];
  const shapes = muscles.flatMap((m) => muscleRegion(m));
  return {
    group,
    side: MUSCLE_SIDE[muscles[0]!],
    shapes,
    centres: shapes.map(centre),
  };
};

/** Every trackable area, in the engines' display order. */
export const INJURY_AREAS: InjuryArea[] = ALL_MUSCLES.map(buildArea);

const figure = (base: BodyFigure): InjuryFigure => ({
  side: base.side,
  head: base.head,
  outline: base.outline,
  areas: INJURY_AREAS.filter((a) => a.side === base.side),
});

export const INJURY_FRONT: InjuryFigure = figure(BODY_FRONT);
export const INJURY_BACK: InjuryFigure = figure(BODY_BACK);
export const INJURY_FIGURES: InjuryFigure[] = [INJURY_FRONT, INJURY_BACK];

/** The crop both clients draw. The mannequin only ever occupies x 24-76 of its
 *  0-100 authoring box, so rendering the full box would waste a third of the
 *  width on nothing and shrink every touch target. */
export const INJURY_VIEWBOX = { x: 21, y: 1, w: 58, h: 98 } as const;

/** How far (in box units) a touch may land from an area's centre and still
 *  count as that area. Sized so the tracked regions are comfortably forgiving
 *  while a tap on the head, a forearm or the space beside the figure resolves
 *  to NOTHING rather than to a wrong answer nobody asked for. */
export const INJURY_TOUCH_RADIUS = 15;

/**
 * A touch on a rendered figure, in viewBox units.
 *
 * Both clients draw the figure with the SVG default `preserveAspectRatio`
 * (meet, centred), so whenever the rendered box and the viewBox disagree on
 * aspect the drawing is LETTERBOXED inside it. Mapping a touch linearly across
 * the whole box would then read every tap as further out than it was — the
 * error growing towards the edges, exactly where the small areas live. This is
 * the one conversion, shared, so neither client can get it subtly wrong.
 */
export function injuryTouchPoint(boxW: number, boxH: number, px: number, py: number): Pt | null {
  if (!(boxW > 0) || !(boxH > 0)) return null;
  const { x, y, w, h } = INJURY_VIEWBOX;
  const scale = Math.min(boxW / w, boxH / h);
  return {
    x: x + (px - (boxW - w * scale) / 2) / scale,
    y: y + (py - (boxH - h * scale) / 2) / scale,
  };
}

/**
 * The hit test — the area nearest a touch on one figure, or null if the touch
 * landed nowhere near a tracked area.
 *
 * The polygons themselves are far smaller than a fingertip (a triceps is ~5
 * units wide), so hit-testing the shapes exactly would demand a precision no
 * thumb has. Measuring to each shape's CENTRE instead makes the whole limb
 * live: a touch anywhere down the back of the arm reads as triceps, and the
 * areas divide the figure between them the way an athlete would point.
 */
export function nearestInjuryArea(side: BodySide, x: number, y: number): MuscleGroup | null {
  let best: MuscleGroup | null = null;
  let bestD = INJURY_TOUCH_RADIUS * INJURY_TOUCH_RADIUS;
  for (const area of INJURY_AREAS) {
    if (area.side !== side) continue;
    for (const c of area.centres) {
      const d = (c.x - x) ** 2 + (c.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = area.group;
      }
    }
  }
  return best;
}

/** The area an athlete would name — not the engine's key. "Posterior" is our
 *  word for a thing nobody calls that; the picker says Hamstrings. */
export const INJURY_AREA_KEY: Record<MuscleGroup, string> = {
  quads: "w.injury.area.quads",
  glutes: "w.injury.area.glutes",
  posterior: "w.injury.area.posterior",
  back: "w.injury.area.back",
  chest: "w.injury.area.chest",
  shoulders: "w.injury.area.shoulders",
  triceps: "w.injury.area.triceps",
};

/** Where that area IS, in plain words — the line under the selection, so a
 *  choice is confirmed by anatomy rather than by a highlight alone. */
export const INJURY_AREA_HINT_KEY: Record<MuscleGroup, string> = {
  quads: "w.injury.areaHint.quads",
  glutes: "w.injury.areaHint.glutes",
  posterior: "w.injury.areaHint.posterior",
  back: "w.injury.areaHint.back",
  chest: "w.injury.areaHint.chest",
  shoulders: "w.injury.areaHint.shoulders",
  triceps: "w.injury.areaHint.triceps",
};

/* ── when it happened ───────────────────────────────────────────────────────
   The protocol has always stamped an injury as happening the moment it was
   opened, which is almost never true — an athlete opens one days after the
   thing they felt. Three answers is the whole question: today, this week, or
   longer ago. Anything finer is a date-picker asking for precision nobody has
   about a tweak they half-noticed. */

export type InjuryWhen = "today" | "week" | "earlier";

export const INJURY_WHEN: InjuryWhen[] = ["today", "week", "earlier"];

export const INJURY_WHEN_KEY: Record<InjuryWhen, string> = {
  today: "w.injury.when.today",
  week: "w.injury.when.week",
  earlier: "w.injury.when.earlier",
};

/** Days back each answer means — the middle of the window it describes, so a
 *  day count never claims more than was said. */
const WHEN_DAYS: Record<InjuryWhen, number> = { today: 0, week: 3, earlier: 14 };

/** The injury date an answer resolves to, as an ISO instant. */
export function injuryDateFor(when: InjuryWhen, now: number | Date = Date.now()): string {
  const ms = (typeof now === "number" ? now : now.getTime()) - WHEN_DAYS[when] * 86_400_000;
  return new Date(ms).toISOString();
}
