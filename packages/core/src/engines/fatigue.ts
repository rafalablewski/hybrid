import type { Fatigue, MuscleGroup, TrainingLog } from "./types";
import { ALL_MUSCLES, movementFor } from "./movements";

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
    const decay = Math.pow(0.5, session.daysAgo / 2); // half-life 2 days
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

  // normalize muscle fatigue to 0..100 (floor the max at 40 so a light week
  // doesn't read as fully fatigued)
  const max = Math.max(40, ...Object.values(f));
  const muscles = Object.fromEntries(
    Object.entries(f).map(([k, v]) => [k, Math.round((v / max) * 100)]),
  ) as Record<MuscleGroup, number>;

  return { muscles, systems: sys };
}
