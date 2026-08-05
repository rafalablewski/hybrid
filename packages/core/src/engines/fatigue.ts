import type { Fatigue, MuscleGroup, TrainingLog } from "./types";
import { ALL_MUSCLES, movementFor } from "./movements";

/**
 * How fast a session's load fades. Two days after the work, half of it is
 * still counted; four days after, a quarter. EXPORTED because the freshness
 * explainer states this number to the athlete — the sentence "a session's load
 * halves every 2 days" has to be read off the constant the loop actually uses,
 * or the explanation drifts from the engine the first time either moves.
 */
export const FATIGUE_HALF_LIFE_DAYS = 2;

/**
 * The floor under the normalisation denominator. Muscle fatigue is expressed
 * relative to the most-loaded tissue, so without a floor a single easy set
 * would read as 100/100 — "fully fatigued" — simply for being the only work in
 * the window. Exported for the same reason as the half-life: the explainer says
 * so out loud.
 */
export const FATIGUE_NORM_FLOOR = 40;

/**
 * Fatigue engine. Each hard set / conditioning minute adds load to the muscles
 * it touches, scaled by intensity (RPE). Load decays with a ~2-day half-life,
 * so recent work dominates. Muscle fatigue is normalized to 0..100.
 */
export function computeFatigue(log: TrainingLog): Fatigue {
  const f = Object.fromEntries(ALL_MUSCLES.map((m) => [m, 0])) as Record<
    MuscleGroup,
    number
  >;
  const sys: Record<"anaerobic" | "threshold" | "aerobic", number> = {
    anaerobic: 0,
    threshold: 0,
    aerobic: 0,
  };

  for (const session of log) {
    const decay = Math.pow(0.5, session.daysAgo / FATIGUE_HALF_LIFE_DAYS);
    for (const it of session.items) {
      const meta = movementFor(it.move) ?? {
        pattern: "",
        muscles: [] as MuscleGroup[],
        baseLoad: null,
        system: null,
      };
      const intensity = it.topRpe ? it.topRpe / 10 : (it.rpe ?? 6) / 10;
      const dose =
        (it.hardSets ? it.hardSets * 4 : (it.minutes ?? 0) * 0.9) *
        intensity *
        decay;
      for (const m of meta.muscles) f[m] = f[m] + dose;
      if (it.system) sys[it.system] += (it.minutes ?? 0) * intensity * decay;
    }
  }

  // normalize muscle fatigue to 0..100 (floor the max so a light week doesn't
  // read as fully fatigued)
  const max = Math.max(FATIGUE_NORM_FLOOR, ...Object.values(f));
  const muscles = Object.fromEntries(
    Object.entries(f).map(([k, v]) => [k, Math.round((v / max) * 100)]),
  ) as Record<MuscleGroup, number>;

  return { muscles, systems: sys };
}

/**
 * Map raw, unbounded energy-system load to a 0..100 endurance-fatigue figure
 * with smooth saturation (a single hard session ≈ 45; a brutal week → ~85+).
 * `scale` is the load at which fatigue reaches ~63%.
 *
 * Lives beside the fatigue it summarises rather than in hpi.ts, because BOTH
 * readiness and HPI consume it and readiness.ts can't reach into hpi.ts
 * without a cycle. `hpi.ts` re-exports it, so every existing import still
 * resolves.
 */
export const ENDURANCE_SCALE = 90;

export function enduranceFatigue(fatigue: Fatigue, scale = ENDURANCE_SCALE): number {
  const total =
    fatigue.systems.anaerobic +
    fatigue.systems.threshold +
    fatigue.systems.aerobic;
  return Math.round(100 * (1 - Math.exp(-total / scale)));
}
