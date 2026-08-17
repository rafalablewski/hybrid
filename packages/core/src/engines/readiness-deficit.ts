import type { Biometrics, MuscleGroup, TrainingLog } from "./types";
import { readinessRole, type SemanticRole } from "../semantic";
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
 *                                     + wearable + heat + fuel))
 *
 * Four real causes — the seven tissues averaged, the energy-system load
 * conditioning leaves behind, the wearable's ±15 nudge, and the energy
 * availability the food log measures — plus the two clamps. The conditioning
 * term is here because THIS MODULE FOUND IT MISSING:
 * the sum law refuses to draw a cause the score doesn't have, so when the ring
 * tried to give conditioning an arc the arithmetic said its cost was zero. It
 * was: readiness counted muscle fatigue and the wearable and nothing else, so
 * an athlete could run themselves into the ground and this number would not
 * notice. That is now fixed in the engine rather than papered over in the card
 * (see readiness.ts, and the `readiness-conditioning` capability).
 *
 * A POSITIVE WEARABLE NUDGE takes no arc. It doesn't cost anything; it makes
 * the whole deficit smaller, so every tissue's share shrinks with it. The HEAT
 * credit behaves identically and for the same reason — it is never negative by
 * construction (engines/heat.ts), so it can never need a cost kind of its own. A cost
 * here is therefore "this tissue's share of TODAY's deficit", not a gross
 * figure — which is the only reading under which the parts can sum to the
 * whole. The wearable's own sentence still says +3 in the drawer.
 *
 * THE FUEL TERM IS THE EXACT MIRROR OF THAT, which is why it DOES get a kind:
 * `fuelAdjustment` is never positive by construction (engines/fuel.ts), so it
 * can never be invisible the way a credit is, and a term that only ever takes
 * points must be drawable or the sum law catches it. An athlete who under-ate
 * for a fortnight now sees where those points went instead of watching them
 * disappear into "tissue".
 */

/** What a single deficit cost is. */
export type ReadinessCostKind =
  /** the tissue term, whole, named by whichever tissue carries the most of it */
  | "tissue"
  /** energy-system load from conditioning */
  | "conditioning"
  /** rolling logged intake under this athlete's own maintenance estimate */
  | "fuel"
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
  /**
   * The heat prior's credit, 0..HEAT_CREDIT_MAX. Like a POSITIVE bioAdj it
   * takes no arc — it does not cost anything, it makes the whole deficit
   * smaller — so the sum law is untouched by it. Which is exactly why it needs
   * a `readinessFacts` line: a term that moved the score and draws nothing
   * would otherwise be invisible on the card.
   */
  heatAdj: number;
  /**
   * The energy-availability term, −FUEL_PENALTY_MAX..0. UNLIKE `heatAdj` this
   * one always has a matching `fuel` cost when it is non-zero, because it can
   * only ever take points — a term that is never positive is never invisible.
   * It is carried here anyway so a surface can quote the signed figure beside
   * the arc without recomputing the read.
   */
  fuelAdj: number;
  /** Which engine clamp the score hit, if either. */
  clamped: "floor" | "ceiling" | null;
}

export const READINESS_COST_KEY: Record<ReadinessCostKind, string> = {
  tissue: "w.home.readiness.costTissue",
  conditioning: "w.home.readiness.costConditioning",
  fuel: "w.home.readiness.costFuel",
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
export function readinessDeficit(log: TrainingLog, bio?: Biometrics, heatAdj = 0, fuelAdj = 0): ReadinessDeficit {
  const fatigue = computeFatigue(log);
  const { score, bioAdj, heatAdj: heat, fuelAdj: fuel } = computeReadiness(fatigue, bio, heatAdj, fuelAdj);
  const kept = score;
  const deficit = 100 - kept;

  // The raw, unrounded weights — the same arithmetic computeReadiness does.
  const rawMuscle = MUSCLE_SLOPE * (ALL_MUSCLES.reduce((a, m) => a + fatigue.muscles[m], 0) / ALL_MUSCLES.length);
  const rawConditioning = ENDURANCE_SLOPE * enduranceFatigue(fatigue);
  const rawWearable = bioAdj < 0 ? -bioAdj : 0;
  // Never positive by construction, so this is the whole term rather than the
  // negative half of a signed one.
  const rawFuel = fuel < 0 ? -fuel : 0;

  const unclamped = Math.round(100 - rawMuscle - rawConditioning + bioAdj + heat + fuel);
  const clamped: ReadinessDeficit["clamped"] =
    unclamped < READINESS_FLOOR ? "floor" : unclamped > READINESS_CEILING ? "ceiling" : null;

  if (deficit <= 0) return { kept, deficit: 0, costs: [], bioAdj, heatAdj: heat, fuelAdj: fuel, clamped };

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
  // Fuel sits between what the athlete DID (tissue, conditioning) and what was
  // READ about them (the wearable), which is also where it belongs on the ring:
  // it is the first cause here that comes from a different column of the app.
  if (rawFuel > 0) raw.push({ kind: "fuel", muscle: null, weight: rawFuel, role: "caution" });
  if (rawWearable > 0) raw.push({ kind: "wearable", muscle: null, weight: rawWearable, role: "caution" });

  // Nothing measurable took the points — the only thing that can be true here
  // is the scale's own ceiling, and it says so rather than leaving a gap.
  if (raw.length === 0) {
    return {
      kept,
      deficit,
      costs: [{ kind: "ceiling", key: READINESS_COST_KEY.ceiling, muscle: null, points: deficit, role: "neutral" }],
      bioAdj,
      heatAdj: heat,
      fuelAdj: fuel,
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

  return { kept, deficit, costs, bioAdj, heatAdj: heat, fuelAdj: fuel, clamped };
}

/* ── THE RING ─────────────────────────────────────────────────────────────── */

/**
 * HOW FAR BACK THE KEPT RUN IS HELD.
 *
 * The kept run wears the readiness band's own colour — and the band's colour
 * COLLIDES with a cause's in every band but the top one: caution is both "score
 * 40–59" and "the wearable", info is both "60–79" and "conditioning", danger is
 * both "under 40" and "tissue". Drawn at equal strength that is not a near-miss
 * but a lie a legend can be read off: at a score of 53 the kept run and the
 * wearable's run were the same sand, so a swatch worth ONE tick pointed at the
 * seventeen the score kept.
 *
 * So the hue stays (severity is still readable before any number is) and the
 * WEIGHT separates them: the kept run is drawn at this alpha, every cause at
 * full strength. The causes therefore sit in front of the run they were taken
 * out of, which is also the right depth ordering for what the ring now says.
 */
export const KEPT_ARC_ALPHA = 0.3;

/** One run of ticks around the readiness ring. */
export interface RingSegment {
  /** `kept` is the score itself; the rest are the costs that took the deficit. */
  kind: "kept" | ReadinessCostKind;
  /** First tick index, 0 at twelve o'clock, running clockwise. */
  from: number;
  /** How many ticks. Never 0 — a cost that can't be seen can't be read. */
  count: number;
  /**
   * The role the run is painted from. On `kept` this is the READINESS BAND's
   * role (`readinessRole(kept)`) rather than a neutral: the clients used to
   * derive that themselves, in two places, and both derived the collision
   * above with it. It is the engine's call now, so a client can't reintroduce
   * one half of the pair without the other.
   */
  role: SemanticRole;
  /**
   * Whether this run is HELD BACK to `KEPT_ARC_ALPHA` (true on `kept`, false on
   * every cause). It travels with the run rather than being inferred from
   * `kind` so the rule reaches every surface that draws a segment — the ring,
   * the proportional bar, and the ledger's swatches — identically.
   */
  dim: boolean;
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
 *   FIXED ORDER    kept, then tissue, then conditioning, then fuel, then the
 *                  wearable, then the ceiling — never sorted by value. If the
 *                  order moved with the numbers
 *                  the card would stop being learnable, which is the entire
 *                  reason we moved off prose.
 *   MINIMUM ARC    every cost gets at least one tick, taken from the largest
 *                  run, so a −1 wearable nudge is visible without ever being
 *                  mistaken for a big one.
 *   EXACT SUM      the runs cover the ring exactly once, with no gap and no
 *                  overlap, for any tick count.
 *   ONE PAINT      every run carries the role it is drawn from AND whether it
 *                  is held back (`dim`), so the ring, the bar and the ledger's
 *                  swatches resolve the same colour from the same field. A
 *                  client that paints a run from anything else is the bug this
 *                  field exists to prevent.
 */
export function readinessRingSegments(d: ReadinessDeficit, ticks = 32): RingSegment[] {
  const parts = [
    { kind: "kept" as const, role: readinessRole(d.kept), key: null as string | null, muscle: null as MuscleGroup | null, points: d.kept, dim: true },
    ...d.costs.map((c) => ({ kind: c.kind, role: c.role, key: c.key as string | null, muscle: c.muscle, points: c.points, dim: false })),
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
  // is already tiny — in which case it has genuinely lost the ring, but it has
  // not lost its ENTIRE arc: a score is never nothing.
  //
  // It has to PAY for that tick from the longest run, exactly as the minimum-arc
  // rule does. The first cut simply set it to 1 and left the total one over,
  // which the coverage correction below then took off the LAST run — the
  // smallest, the one that could least afford it. At kept 1 that drove the
  // wearable's run to zero ticks and a `from` past the end of the ring: a legend
  // row pointing at an arc that isn't drawn, which is the exact class of lie the
  // minimum-arc rule exists to prevent.
  if (counts.length > 0 && at(0) === 0 && (parts[0]?.points ?? 0) > 0) {
    let biggest = 0;
    for (let j = 0; j < counts.length; j++) if (at(j) > at(biggest)) biggest = j;
    if (at(biggest) > 1) {
      counts[biggest] = at(biggest) - 1;
      counts[0] = 1;
    }
  }

  const out: RingSegment[] = [];
  let from = 0;
  parts.forEach((p, i) => {
    const count = at(i);
    if (count <= 0) return;
    out.push({ kind: p.kind, from, count, role: p.role, dim: p.dim, key: p.key, muscle: p.muscle, points: p.points });
    from += count;
  });
  // COVERAGE, as a safety net rather than a mechanism: the runs must cover the
  // ring exactly once. Any remainder goes to the LONGEST run — never the last —
  // and never at the price of taking a run below its one guaranteed tick, which
  // is what turned a rounding correction into an undrawn cost.
  const covered = out.reduce((a, s) => a + s.count, 0);
  if (out.length > 0 && covered !== ticks) {
    let biggest = 0;
    for (let j = 0; j < out.length; j++) if (out[j]!.count > out[biggest]!.count) biggest = j;
    out[biggest]!.count = Math.max(1, out[biggest]!.count + (ticks - covered));
    // `from` is a promise about where a run starts; re-seat every run after the
    // one that moved rather than leaving the tail pointing at stale indices.
    let from = 0;
    for (const s of out) { s.from = from; from += s.count; }
  }
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
