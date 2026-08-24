/**
 * WHAT KIND OF TRAINING A GOAL IS — one classification, every consumer.
 *
 * Three separate parts of the app need to know whether an athlete is chasing
 * strength, endurance, both at once, or general health:
 *
 *  - the PERIODIZATION engine, to pick a phase model;
 *  - the FRESHNESS index, to weight the muscular pillar against the
 *    conditioning one (engines/hpi.ts has carried STRENGTH_WEIGHTS and
 *    ENDURANCE_WEIGHTS since it was written, and nothing outside the admin
 *    Engine Room simulator ever passed either — every athlete was scored on the
 *    hybrid weighting, so a marathoner and a powerlifter got the same number);
 *  - the PRESCRIPTION engine, to bias the session it designs.
 *
 * They were going to need three tables, and three tables for one question drift
 * apart — which is exactly what had already happened to the one table that did
 * exist. `MODEL_FOR` was keyed by display name, named four sports that are not
 * goals (Climbing, BJJ, Boxing, Hybrid), and missed twelve of the nineteen
 * goals including the flagship, so they fell to a silent `?? "strength"`
 * default. Twelve wrong answers nobody could see, because nothing ever asked
 * the table to account for its coverage.
 *
 * So: ONE table, keyed by goal id, and a test that fails if any goal in the
 * library is missing from it. There is no default to fall through to.
 *
 * THESE ARE PRIORS, NOT FINDINGS — the same status the heat and fuel constants
 * carry. They are exported so the admin Engine Room can render them, and
 * retuning any one of them is a single line.
 */

import { GOAL_TREE } from "./plans";
import { resolveGoalId } from "./goal-id";
import { HYBRID_WEIGHTS, STRENGTH_WEIGHTS, ENDURANCE_WEIGHTS, type HpiWeights } from "./engines/hpi";

/**
 * How a goal loads the athlete, which is the thing all three consumers are
 * really asking about.
 *
 * - `strength`    — force production is the objective; conditioning supports it.
 * - `endurance`   — the aerobic engine is the objective; lifting supports it.
 * - `concurrent`  — both are the objective at once, which is its own problem
 *                   rather than the average of the other two.
 * - `general`     — health, physique or return-to-training. There is no event,
 *                   so there is nothing to peak for.
 */
export type TrainingEmphasis = "strength" | "endurance" | "concurrent" | "general";

/**
 * How the goal biases the prescribed session, in the same currency the
 * `experience` tier already uses (see engines/prescription.ts) — a set, a rep,
 * a few percent of e1RM. Deliberately the same magnitude: the goal should shape
 * a session, not replace the readiness and progression signals that decide it.
 */
export interface GoalPrescriptionBias {
  /** Sets added to (or taken off) the strength block. */
  setAdj: number;
  /** Added to the working percentage of e1RM, before the 0.55–0.9 clamp. */
  pctAdj: number;
  /** Rounds added to (or taken off) an interval conditioning block. */
  condRoundsAdj: number;
  /** Whether the conditioning pick should favour the aerobic system over the
   *  merely freshest one. True only for goals whose objective IS the engine. */
  preferAerobic: boolean;
}

export interface GoalProfile {
  emphasis: TrainingEmphasis;
  /** Which phase model the season is built from (engines/periodization.ts). */
  model: "strength" | "endurance" | "concurrent" | "general";
  /** How freshness is weighted between the muscular and conditioning pillars. */
  weights: HpiWeights;
  bias: GoalPrescriptionBias;
}

const BIAS: Record<TrainingEmphasis, GoalPrescriptionBias> = {
  // Heavier and one set more on the bar; conditioning kept short so it does not
  // eat the recovery the strength work needs.
  strength: { setAdj: 1, pctAdj: 0.03, condRoundsAdj: -2, preferAerobic: false },
  // The mirror. The lifting is insurance against injury rather than the point,
  // so it is lighter and shorter, and the conditioning is where the volume goes.
  endurance: { setAdj: -1, pctAdj: -0.05, condRoundsAdj: 2, preferAerobic: true },
  // NO ADJUSTMENT, and that is a decision rather than an omission: the engine's
  // existing balance IS the concurrent one, which is also why HYBRID_WEIGHTS is
  // 0.55/0.45. A hybrid athlete is the athlete this app was designed around.
  concurrent: { setAdj: 0, pctAdj: 0, condRoundsAdj: 0, preferAerobic: false },
  // Nothing to peak for, so nothing to push. One set fewer and a slightly
  // easier bar keeps sessions repeatable, which is the whole objective here.
  general: { setAdj: -1, pctAdj: -0.03, condRoundsAdj: 0, preferAerobic: false },
};

const WEIGHTS: Record<TrainingEmphasis, HpiWeights> = {
  strength: STRENGTH_WEIGHTS,
  endurance: ENDURANCE_WEIGHTS,
  concurrent: HYBRID_WEIGHTS,
  // A general-fitness athlete is not specialising, so neither should the score.
  general: HYBRID_WEIGHTS,
};

/**
 * EVERY goal in the library, classified. There is no default and no fallback —
 * `goal-profile.test.ts` fails if GOAL_TREE gains an entry this map does not
 * name, which is the check the old `MODEL_FOR` never had.
 */
export const EMPHASIS_BY_GOAL: Record<string, TrainingEmphasis> = {
  // ── Strength ───────────────────────────────────────────────────────────
  power: "strength",
  oly: "strength",
  strongman: "strength",
  // ── Physique ───────────────────────────────────────────────────────────
  // Bodybuilding's limiter is muscular, so it is scored and periodised as
  // strength even though the rep ranges differ from a powerlifter's.
  bb: "strength",
  // Fat loss is NOT strength: the training is conditioning-heavy and the point
  // is to keep the muscle, not to add to it. It periodises like general
  // training because there is no event and a peak week would be the wrong
  // instruction for someone in an energy deficit.
  fatloss: "general",
  // ── Endurance ──────────────────────────────────────────────────────────
  tri: "endurance",
  run: "endurance",
  cycling: "endurance",
  swim: "endurance",
  // ── Functional & Sport ─────────────────────────────────────────────────
  // Hyrox stays on the endurance model: compromised running is the event, and
  // the stations are paced work rather than maximal-force work.
  hyrox: "endurance",
  crossfit: "concurrent",
  hybrid: "concurrent",
  tactical: "concurrent",
  sport: "concurrent",
  // Bodyweight strength: the objective is force production at a fixed load, so
  // the strength model is right even with no barbell in it.
  calisthenics: "strength",
  kettlebell: "concurrent",
  // ── Health ─────────────────────────────────────────────────────────────
  fitness: "general",
  mobility: "general",
  // Deliberately `general`, and this one matters more than the others: the
  // strength model ramps intensity to a peak TEST week, which is not an
  // instruction to give a pregnant or postpartum athlete. It fell through to
  // exactly that model before this table existed.
  prenatal: "general",
};

/** Emphasis by goal category, for a goal the map above does not name. Only
 *  reachable for a coach's free-text goal, since the test enforces coverage of
 *  the library itself. */
const EMPHASIS_BY_CATEGORY: Record<string, TrainingEmphasis> = {
  Strength: "strength",
  Physique: "strength",
  Endurance: "endurance",
  "Functional & Sport": "concurrent",
  Health: "general",
};

const CATEGORY_BY_ID: Record<string, string> = Object.fromEntries(
  GOAL_TREE.map((g) => [g.id, g.category]),
);

/**
 * The emphasis for a goal given as an id or a legacy display name.
 *
 * An unrecognised value — a coach's free-text goal — reads as `concurrent`
 * rather than as any specialisation, because a season nobody classified should
 * get the balanced treatment rather than a guess about which half matters.
 */
export function emphasisFor(goal: string | null | undefined): TrainingEmphasis {
  const id = resolveGoalId(goal);
  if (!id) return "concurrent";
  return EMPHASIS_BY_GOAL[id] ?? EMPHASIS_BY_CATEGORY[CATEGORY_BY_ID[id] ?? ""] ?? "concurrent";
}

/** Everything the engines need to know about a goal, in one read. */
export function goalProfile(goal: string | null | undefined): GoalProfile {
  const emphasis = emphasisFor(goal);
  return { emphasis, model: emphasis, weights: WEIGHTS[emphasis], bias: BIAS[emphasis] };
}

/** The freshness weighting for an athlete's goal. Falls back to the hybrid
 *  weighting when there is no goal at all, which is what every athlete got
 *  before this existed. */
export const hpiWeightsFor = (goal: string | null | undefined): HpiWeights =>
  goal ? goalProfile(goal).weights : HYBRID_WEIGHTS;
