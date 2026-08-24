import type { Macrocycle, MacroBlock, Phase, Microcycle } from "./types";
import { goalProfile, type TrainingEmphasis } from "../goal-profile";

/**
 * Periodization engine. A macrocycle (season) is built from mesocycles (phase
 * blocks), each split into microcycles (weeks of load vs recovery). Two phase
 * models — endurance and strength — are selected by goal/sport.
 */
export const PHASE_MODELS: Record<string, { name: string; phases: Phase[] }> = {
  endurance: {
    name: "Endurance model",
    phases: [
      { key: "base", label: "Base", weeks: 4, intensity: 45, volume: 90, color: "#2f7893", focus: "Aerobic & muscular endurance", pattern: "3 load / 1 recovery" },
      { key: "build", label: "Build", weeks: 3, intensity: 70, volume: 75, color: "#c3d363", focus: "Threshold & VO₂ max", pattern: "2 load / 1 recovery" },
      { key: "peak", label: "Peak", weeks: 3, intensity: 90, volume: 50, color: "#daa51d", focus: "Anaerobic capacity & power", pattern: "2 load / 1 recovery" },
      { key: "taper", label: "Taper", weeks: 1, intensity: 75, volume: 30, color: "#ec935e", focus: "Sharpen, shed fatigue", pattern: "race week" },
      { key: "recovery", label: "Recovery", weeks: 2, intensity: 30, volume: 35, color: "#8a9691", focus: "Rest & regenerate", pattern: "easy" },
    ],
  },
  strength: {
    name: "Strength model",
    phases: [
      { key: "hypertrophy", label: "Hypertrophy", weeks: 4, intensity: 60, volume: 90, color: "#2f7893", focus: "Muscle mass, work capacity", pattern: "3 load / 1 deload" },
      { key: "strength", label: "Strength", weeks: 4, intensity: 80, volume: 65, color: "#c3d363", focus: "Maximal force, heavy loads", pattern: "3 load / 1 deload" },
      { key: "power", label: "Power", weeks: 3, intensity: 85, volume: 45, color: "#daa51d", focus: "Rate of force, explosiveness", pattern: "2 load / 1 deload" },
      { key: "peak", label: "Peak", weeks: 1, intensity: 95, volume: 25, color: "#ec935e", focus: "Express peak strength", pattern: "test week" },
      { key: "deload", label: "Deload", weeks: 2, intensity: 35, volume: 35, color: "#8a9691", focus: "Supercompensate", pattern: "easy" },
    ],
  },
  // BOTH QUALITIES AT ONCE, which is its own problem rather than the average of
  // the other two: the interference effect means a concurrent athlete cannot
  // specialise either half for long, so the blocks are shorter and neither
  // quality is ever fully set down. This is the model a Hybrid Athlete, a
  // CrossFitter, a tactical athlete and a field-sport athlete were all missing —
  // every one of them fell through to the powerlifting progression.
  concurrent: {
    name: "Concurrent model",
    phases: [
      { key: "base", label: "Base", weeks: 4, intensity: 55, volume: 85, color: "#2f7893", focus: "Aerobic base and general strength together", pattern: "3 load / 1 deload" },
      { key: "build", label: "Build", weeks: 4, intensity: 75, volume: 70, color: "#c3d363", focus: "Heavy lifting alongside threshold work", pattern: "3 load / 1 deload" },
      { key: "sharpen", label: "Sharpen", weeks: 3, intensity: 88, volume: 50, color: "#daa51d", focus: "Power and race-pace work under fatigue", pattern: "2 load / 1 deload" },
      { key: "taper", label: "Taper", weeks: 1, intensity: 75, volume: 35, color: "#ec935e", focus: "Shed fatigue, hold sharpness", pattern: "event week" },
      { key: "deload", label: "Deload", weeks: 2, intensity: 35, volume: 35, color: "#8a9691", focus: "Supercompensate", pattern: "easy" },
    ],
  },
  // NO PEAK AND NO TAPER, and their absence is the whole model. General fitness,
  // fat loss, mobility and pre/postnatal training have no event to arrive at, so
  // a ramp to a maximal test week is not a plan — it is an instruction nobody
  // asked for, and for a pregnant or postpartum athlete it is the wrong one.
  // What these goals need is a progression they can repeat indefinitely.
  general: {
    name: "General model",
    phases: [
      { key: "foundation", label: "Foundation", weeks: 4, intensity: 50, volume: 80, color: "#2f7893", focus: "Movement quality and work capacity", pattern: "3 load / 1 easy" },
      { key: "progress", label: "Progress", weeks: 5, intensity: 65, volume: 85, color: "#c3d363", focus: "Steady progressive overload", pattern: "4 load / 1 easy" },
      { key: "consolidate", label: "Consolidate", weeks: 4, intensity: 70, volume: 70, color: "#daa51d", focus: "Hold the gains, refine technique", pattern: "3 load / 1 easy" },
      { key: "recovery", label: "Easy week", weeks: 1, intensity: 35, volume: 45, color: "#8a9691", focus: "Rest and regenerate", pattern: "easy" },
    ],
  },
};

/**
 * Which phase model a goal is built from.
 *
 * THIS USED TO BE A TABLE HERE, `MODEL_FOR`, and it is worth recording what was
 * wrong with it because the shape of the mistake is more instructive than the
 * mistake. It was keyed by DISPLAY NAME; it named four sports that are not
 * goals at all (Climbing, BJJ, Boxing, Hybrid) left over from a taxonomy the
 * goal tree replaced; it covered seven of the nineteen goals; and everything it
 * missed fell through a silent `?? "strength"`. So twelve goals were quietly
 * periodised as powerlifters — including `Hybrid Athlete`, the flagship, which
 * missed by a single word, and `Pre & Postnatal`, which was handed a ramp to a
 * maximal test week.
 *
 * None of that was visible, because a lookup with a default never has to
 * account for its coverage. The classification now lives in ONE place that all
 * three consumers read (goal-profile.ts), is keyed by goal id, has no default,
 * and has a test that fails if the library gains a goal it does not name.
 */
export function modelFor(goalOrSport: string): { name: string; phases: Phase[] } {
  return PHASE_MODELS[modelKeyFor(goalOrSport)]!;
}

/** The phase-model key for a goal, given as an id or a legacy display name. */
export function modelKeyFor(goalOrSport: string): TrainingEmphasis {
  return goalProfile(goalOrSport).model;
}

/**
 * Apportion `total` weeks across phases in proportion to their natural length,
 * guaranteeing the result sums to EXACTLY `total`. Uses the largest-remainder
 * (Hamilton) method. When `total` is smaller than the phase count, the earliest
 * phases are dropped (0 weeks) and the final `total` phases get one week each —
 * so the peak/taper that must land on the event is always preserved.
 */
function distributeWeeks(weights: number[], total: number): number[] {
  const n = weights.length;
  if (n === 0) return [];
  if (total <= n) return weights.map((_, i) => (i >= n - total ? 1 : 0));

  const sum = weights.reduce((s, w) => s + w, 0) || n;
  const raw = weights.map((w) => (w / sum) * total);
  const out = raw.map((r) => Math.max(1, Math.floor(r)));
  let used = out.reduce((s, w) => s + w, 0);

  // Hand out any shortfall to the phases with the largest fractional remainder.
  const byRemainder = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; used < total; k++, used++) {
    const i = byRemainder[k % n]!.i;
    out[i] = (out[i] ?? 0) + 1;
  }

  // The min-of-1 floor can overshoot; trim from the longest phases (never below 1).
  while (used > total) {
    const idx = out
      .map((w, i) => ({ w, i }))
      .filter((x) => x.w > 1)
      .sort((a, b) => b.w - a.w)[0]?.i;
    if (idx === undefined) break;
    out[idx] = (out[idx] ?? 0) - 1;
    used--;
  }
  return out;
}

/**
 * Build a macrocycle. If `eventInWeeks` is given, the active phases are scaled
 * to fit the available weeks (taper/peak land on the event). Otherwise all
 * phases are stacked forward from now, including the recovery block.
 */
export function buildMacrocycle(
  goalOrSport: string,
  eventInWeeks?: number | null,
): Macrocycle {
  const model = modelFor(goalOrSport);
  const phases = model.phases.filter(
    (p) => p.key !== "recovery" && p.key !== "deload",
  ); // active build
  const recovery = model.phases.find(
    (p) => p.key === "recovery" || p.key === "deload",
  );

  let mesos: Phase[];
  if (eventInWeeks && eventInWeeks > 0) {
    const ordered = [...phases]; // base...taper, in order
    // Distribute the available weeks across the phases so they sum EXACTLY to
    // eventInWeeks (taper/peak land ON the event). Rounding each phase
    // independently used to overshoot for short horizons (event 2wk out -> a
    // 4wk plan whose peak lands after the event) and drift for long ones
    // (event 20wk out -> 19wk). Largest-remainder keeps the total exact.
    const weeks = distributeWeeks(ordered.map((p) => p.weeks), eventInWeeks);
    // When there isn't room for every phase (eventInWeeks < phase count) the
    // earliest base phases get 0 weeks — drop them and keep the peak block,
    // rather than forcing a minimum that pushes the plan past the event.
    mesos = ordered.map((p, i) => ({ ...p, weeks: weeks[i]! })).filter((p) => p.weeks > 0);
  } else {
    mesos = [...phases, ...(recovery ? [recovery] : [])];
  }

  let weekCursor = 0;
  const blocks: MacroBlock[] = mesos.map((p) => {
    const micros: Microcycle[] = Array.from({ length: p.weeks }, (_, i) => {
      const isRecovery =
        p.key === "recovery" ||
        p.key === "deload" ||
        (i === p.weeks - 1 && p.weeks >= 3);
      return {
        week: weekCursor + i + 1,
        kind: isRecovery ? "recovery" : "load",
        intensity: isRecovery
          ? Math.round(p.intensity * 0.6)
          : Math.min(100, p.intensity + i * 4),
        volume: isRecovery
          ? Math.round(p.volume * 0.55)
          : Math.min(100, p.volume - i * 3),
      };
    });
    const block: MacroBlock = {
      ...p,
      startWeek: weekCursor + 1,
      endWeek: weekCursor + p.weeks,
      micros,
    };
    weekCursor += p.weeks;
    return block;
  });

  return {
    model: model.name,
    goalOrSport,
    totalWeeks: weekCursor,
    eventInWeeks: eventInWeeks ?? null,
    blocks,
  };
}

/** Which phase is "this week" (1-indexed), plus that week's microcycle. */
export function currentPhase(
  macro: Macrocycle,
  currentWeek = 1,
): { block: MacroBlock; micro: Microcycle } {
  const block =
    macro.blocks.find(
      (b) => currentWeek >= b.startWeek && currentWeek <= b.endWeek,
    ) ?? macro.blocks[0]!;
  const micro = block.micros.find((m) => m.week === currentWeek) ?? block.micros[0]!;
  return { block, micro };
}
