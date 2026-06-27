import type { Macrocycle, MacroBlock, Phase, Microcycle } from "./types";

/**
 * Periodization engine. A macrocycle (season) is built from mesocycles (phase
 * blocks), each split into microcycles (weeks of load vs recovery). Two phase
 * models — endurance and strength — are selected by goal/sport.
 */
export const PHASE_MODELS: Record<string, { name: string; phases: Phase[] }> = {
  endurance: {
    name: "Endurance model",
    phases: [
      { key: "base", label: "Base", weeks: 4, intensity: 45, volume: 90, color: "#3c787e", focus: "Aerobic & muscular endurance", pattern: "3 load / 1 recovery" },
      { key: "build", label: "Build", weeks: 3, intensity: 70, volume: 75, color: "#c7ef00", focus: "Threshold & VO₂ max", pattern: "2 load / 1 recovery" },
      { key: "peak", label: "Peak", weeks: 3, intensity: 90, volume: 50, color: "#d0cd94", focus: "Anaerobic capacity & power", pattern: "2 load / 1 recovery" },
      { key: "taper", label: "Taper", weeks: 1, intensity: 75, volume: 30, color: "#c9a9f0", focus: "Sharpen, shed fatigue", pattern: "race week" },
      { key: "recovery", label: "Recovery", weeks: 2, intensity: 30, volume: 35, color: "#8b8f86", focus: "Rest & regenerate", pattern: "easy" },
    ],
  },
  strength: {
    name: "Strength model",
    phases: [
      { key: "hypertrophy", label: "Hypertrophy", weeks: 4, intensity: 60, volume: 90, color: "#3c787e", focus: "Muscle mass, work capacity", pattern: "3 load / 1 deload" },
      { key: "strength", label: "Strength", weeks: 4, intensity: 80, volume: 65, color: "#c7ef00", focus: "Maximal force, heavy loads", pattern: "3 load / 1 deload" },
      { key: "power", label: "Power", weeks: 3, intensity: 85, volume: 45, color: "#d0cd94", focus: "Rate of force, explosiveness", pattern: "2 load / 1 deload" },
      { key: "peak", label: "Peak", weeks: 1, intensity: 95, volume: 25, color: "#c9a9f0", focus: "Express peak strength", pattern: "test week" },
      { key: "deload", label: "Deload", weeks: 2, intensity: 35, volume: 35, color: "#8b8f86", focus: "Supercompensate", pattern: "easy" },
    ],
  },
};

/** goals/sports → which phase model. */
export const MODEL_FOR: Record<string, "endurance" | "strength"> = {
  Running: "endurance",
  Cycling: "endurance",
  Swimming: "endurance",
  Hyrox: "endurance",
  Triathlon: "endurance",
  Bodybuilding: "strength",
  Powerlifting: "strength",
  Climbing: "strength",
  BJJ: "strength",
  Boxing: "strength",
  Hybrid: "strength",
};

export function modelFor(goalOrSport: string): { name: string; phases: Phase[] } {
  return PHASE_MODELS[MODEL_FOR[goalOrSport] ?? "strength"]!;
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
