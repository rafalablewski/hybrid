import type { Biometrics, MuscleGroup, TrainingLog } from "./types";
import type { SemanticRole } from "../semantic";
import { computeFatigue, enduranceFatigue } from "./fatigue";
import { computeReadiness, MUSCLE_SLOPE, ENDURANCE_SLOPE, READINESS_FLOOR, READINESS_CEILING } from "./readiness";
import { ALL_MUSCLES } from "./movements";

/**
 * WHAT THE MISSING POINTS WERE SPENT ON.
 *
 * The readiness ring used to gauge what is KEPT and leave a paragraph beside it
 * to explain the rest. This module lets the ring account for the DEFICIT
 * instead — one arc per cause, sized by what that cause actually took — so the
 * explanation and the number become one object rather than a caption on one.
 *
 * THE LAW, and it is the whole reason this module has its own tests: `kept`
 * plus every cost sums to EXACTLY 100. "Back fatigue is the main drag" was a
 * safe sentence; "back fatigue cost you 22 points" is a claim the engine has to
 * be able to defend, and a ring whose parts don't add up to its own number is
 * a lie drawn at 118px. Nothing is allowed to fall off the edge: anything that
 * can't be attributed to a tissue or the wearable lands in a named cost of its
 * own rather than being silently dropped.
 *
 * WHAT READINESS IS MADE OF (engines/readiness.ts):
 *
 *     score = clamp(35..98, round(100 − avg(muscle fatigue) × MUSCLE_SLOPE
 *                                     − enduranceFatigue × ENDURANCE_SLOPE
 *                                     + wearable))
 *
 * Three real causes — the seven tissues averaged, the energy-system load
 * conditioning leaves behind, and the wearable's ±15 nudge — plus the two
 * clamps. The conditioning term is here because THIS MODULE FOUND IT MISSING:
 * the sum law refuses to draw a cause the score doesn't have, so when the ring
 * tried to give conditioning an arc the arithmetic said its cost was zero. It
 * was: readiness counted muscle fatigue and the wearable and nothing else, so
 * an athlete could run themselves into the ground and this number would not
 * notice. That is now fixed in the engine rather than papered over in the card
 * (see readiness.ts, and the `readiness-conditioning` capability).
 *
 * A POSITIVE WEARABLE NUDGE takes no arc. It doesn't cost anything; it makes
 * the whole deficit smaller, so every tissue's share shrinks with it. A cost
 * here is therefore "this tissue's share of TODAY's deficit", not a gross
 * figure — which is the only reading under which the parts can sum to the
 * whole. The wearable's own sentence still says +3 in the drawer.
 */

/** What a single deficit cost is. */
export type ReadinessCostKind =
  /** the tissue term, whole, named by whichever tissue carries the most of it */
  | "tissue"
  /** energy-system load from conditioning */
  | "conditioning"
  /** the wearable, when it took points off */
  | "wearable"
  /** the scale's own ceiling — readiness never reads above 98 */
  | "ceiling";

export interface ReadinessCost {
  kind: ReadinessCostKind;
  /** i18n key for the label — copy stays out of the engine. */
  key: string;
  /** The tissue named, for `kind: "tissue"`. */
  muscle: MuscleGroup | null;
  /** Points off 100. Always ≥ 1: a cost too small to draw is still a cost. */
  points: number;
  /** Semantic role the client resolves to a colour (see semantic.ts). */
  role: SemanticRole;
}

export interface ReadinessDeficit {
  /** The score itself — what the ring keeps. */
  kept: number;
  /** 100 − kept. Equals the sum of `costs`, exactly, always. */
  deficit: number;
  /** Largest first within each kind, in the ring's fixed drawing order. */
  costs: ReadinessCost[];
  /** The wearable's signed nudge; positive means it gave points back. */
  bioAdj: number;
  /** Which engine clamp the score hit, if either. */
  clamped: "floor" | "ceiling" | null;
}

export const READINESS_COST_KEY: Record<ReadinessCostKind, string> = {
  tissue: "w.home.readiness.costTissue",
  conditioning: "w.home.readiness.costConditioning",
  wearable: "w.home.readiness.costWearable",
  ceiling: "w.home.readiness.costCeiling",
};

/**
 * Largest-remainder apportionment: split `total` across `weights` in whole
 * units so the parts sum to `total` EXACTLY, giving the leftover units to the
 * largest fractional remainders. The alternative — rounding each share on its
 * own — is what makes a ring's segments miss its own total by a point or two.
 */
export function apportion(weights: number[], total: number): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (w / sum) * total);
  const out = exact.map((e) => Math.floor(e));
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = exact
    .map((e, i) => ({ i, rem: e - Math.floor(e) }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (let k = 0; left > 0 && order.length > 0; k++, left--) {
    const idx = order[k % order.length]?.i ?? 0;
    out[idx] = (out[idx] ?? 0) + 1;
  }
  return out;
}

/**
 * Today's readiness, split into what it kept and what each cause took.
 *
 * Order of operations matters: causes are MERGED to the arc ceiling before the
 * points are apportioned, so the integers are computed once against the number
 * of arcs actually drawn and can't drift when two small tissues become one.
 */
export function readinessDeficit(log: TrainingLog, bio?: Biometrics): ReadinessDeficit {
  const fatigue = computeFatigue(log);
  const { score, bioAdj } = computeReadiness(fatigue, bio);
  const kept = score;
  const deficit = 100 - kept;

  // The raw, unrounded weights — the same arithmetic computeReadiness does.
  const rawMuscle = MUSCLE_SLOPE * (ALL_MUSCLES.reduce((a, m) => a + fatigue.muscles[m], 0) / ALL_MUSCLES.length);
  const rawConditioning = ENDURANCE_SLOPE * enduranceFatigue(fatigue);
  const rawWearable = bioAdj < 0 ? -bioAdj : 0;

  const unclamped = Math.round(100 - rawMuscle - rawConditioning + bioAdj);
  const clamped: ReadinessDeficit["clamped"] =
    unclamped < READINESS_FLOOR ? "floor" : unclamped > READINESS_CEILING ? "ceiling" : null;

  if (deficit <= 0) return { kept, deficit: 0, costs: [], bioAdj, clamped };

  // ── THE CAUSES. There are two, and the structure is FIXED ──
  //
  // Readiness takes the AVERAGE of all seven tissues, so every tissue pays into
  // one term rather than seven separable ones. A first cut split that term per
  // muscle and it read badly for the reason the maths predicts: on any normal
  // week the fatigue spreads, so the biggest arc on the ring was an anonymous
  // "other tissue" larger than the tissue actually named. The tissue term is
  // therefore ONE cost, named by whichever tissue carries the most of it —
  // which is also the limiter the card's face already names, so the ring and
  // the sentence above it can't tell two different stories.
  //
  // Fixed slots — tissue, conditioning, wearable, ceiling — are the point: a
  // card whose parts move with the numbers can't be learned, and being
  // learnable is the entire reason this block stopped being prose.
  type Raw = { kind: ReadinessCostKind; muscle: MuscleGroup | null; weight: number; role: SemanticRole };
  let heaviest: MuscleGroup = "quads";
  for (const m of ALL_MUSCLES) if (fatigue.muscles[m] > fatigue.muscles[heaviest]) heaviest = m;
  const raw: Raw[] = [];
  if (rawMuscle > 0) raw.push({ kind: "tissue", muscle: heaviest, weight: rawMuscle, role: "danger" });
  if (rawConditioning > 0) raw.push({ kind: "conditioning", muscle: null, weight: rawConditioning, role: "info" });
  if (rawWearable > 0) raw.push({ kind: "wearable", muscle: null, weight: rawWearable, role: "caution" });

  // Nothing measurable took the points — the only thing that can be true here
  // is the scale's own ceiling, and it says so rather than leaving a gap.
  if (raw.length === 0) {
    return {
      kept,
      deficit,
      costs: [{ kind: "ceiling", key: READINESS_COST_KEY.ceiling, muscle: null, points: deficit, role: "neutral" }],
      bioAdj,
      clamped: clamped ?? "ceiling",
    };
  }

  // ── points: apportioned so they sum to the deficit exactly ──
  const points = apportion(raw.map((c) => c.weight), deficit);
  const costs: ReadinessCost[] = raw
    .map((c, i) => ({
      kind: c.kind,
      key: READINESS_COST_KEY[c.kind],
      muscle: c.muscle,
      points: points[i] ?? 0,
      role: c.role,
    }))
    .filter((c) => c.points > 0);

  return { kept, deficit, costs, bioAdj, clamped };
}

/* ── THE RING ─────────────────────────────────────────────────────────────── */

/** One run of ticks around the readiness ring. */
export interface RingSegment {
  /** `kept` is the score itself; the rest are the costs that took the deficit. */
  kind: "kept" | ReadinessCostKind;
  /** First tick index, 0 at twelve o'clock, running clockwise. */
  from: number;
  /** How many ticks. Never 0 — a cost that can't be seen can't be read. */
  count: number;
  role: SemanticRole;
  /** i18n key for the label; absent on `kept`, which the figure already names. */
  key: string | null;
  muscle: MuscleGroup | null;
  /** The points this run stands for, so a legend and an arc can't disagree. */
  points: number;
}

/**
 * The ring, as runs of ticks — the SAME 32-tick geometry both clients already
 * draw readiness with, so the deficit arrives in the shape the athlete knows
 * rather than as a new instrument.
 *
 * Three rules the spec fixes, all enforced here so neither client can drift:
 *
 *   FIXED ORDER    kept, then tissues, then the wearable, then the ceiling —
 *                  never sorted by value. If the order moved with the numbers
 *                  the card would stop being learnable, which is the entire
 *                  reason we moved off prose.
 *   MINIMUM ARC    every cost gets at least one tick, taken from the largest
 *                  run, so a −1 wearable nudge is visible without ever being
 *                  mistaken for a big one.
 *   EXACT SUM      the runs cover the ring exactly once, with no gap and no
 *                  overlap, for any tick count.
 */
export function readinessRingSegments(d: ReadinessDeficit, ticks = 32): RingSegment[] {
  const parts = [
    { kind: "kept" as const, role: "neutral" as SemanticRole, key: null as string | null, muscle: null as MuscleGroup | null, points: d.kept },
    ...d.costs.map((c) => ({ kind: c.kind, role: c.role, key: c.key as string | null, muscle: c.muscle, points: c.points })),
  ].filter((p) => p.points > 0);

  const counts = apportion(parts.map((p) => p.points), ticks);
  const at = (i: number) => counts[i] ?? 0;

  // MINIMUM ARC — lift every visible cost to one tick, paying for it from the
  // longest run (which is the one that can afford it and the one whose length
  // is least changed by losing a tick).
  for (let i = 1; i < counts.length; i++) {
    if (at(i) !== 0) continue;
    let biggest = 0;
    for (let j = 0; j < counts.length; j++) if (at(j) > at(biggest)) biggest = j;
    if (at(biggest) <= 1) break; // nothing left to give; the ring is full
    counts[biggest] = at(biggest) - 1;
    counts[i] = at(i) + 1;
  }
  // The kept run can be starved to nothing by the rule above only if the score
  // is already tiny — in which case it has genuinely lost the ring.
  if (counts.length > 0 && at(0) === 0 && (parts[0]?.points ?? 0) > 0) counts[0] = 1;

  const out: RingSegment[] = [];
  let from = 0;
  parts.forEach((p, i) => {
    const count = at(i);
    if (count <= 0) return;
    out.push({ kind: p.kind, from, count, role: p.role, key: p.key, muscle: p.muscle, points: p.points });
    from += count;
  });
  // Any tick left over by the starvation guard above belongs to the last run,
  // because the ring must be covered exactly once.
  const covered = out.reduce((a, s) => a + s.count, 0);
  const last = out[out.length - 1];
  if (last && covered !== ticks) last.count += ticks - covered;
  return out;
}

/**
 * Per-tick roles, for a client that just wants to paint 32 ticks in a loop.
 * Derived from `readinessRingSegments`, so the two can never disagree.
 */
export function readinessRingTicks(d: ReadinessDeficit, ticks = 32): RingSegment[] {
  const segs = readinessRingSegments(d, ticks);
  const out: RingSegment[] = [];
  for (const s of segs) for (let i = 0; i < s.count; i++) out.push(s);
  return out;
}
