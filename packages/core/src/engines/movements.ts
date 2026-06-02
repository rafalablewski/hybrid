import type { MuscleGroup, Movement } from "./types";

/** All trackable muscle groups, in display order. */
export const ALL_MUSCLES: MuscleGroup[] = [
  "quads",
  "glutes",
  "posterior",
  "back",
  "chest",
  "shoulders",
  "triceps",
];

/** Muscle groups + energy systems each movement touches. Ported from the
 *  prototype's MOVEMENTS map — the engine reads this to attribute fatigue. */
export const MOVEMENTS: Record<string, Movement> = {
  "Back Squat": { pattern: "squat", muscles: ["quads", "glutes", "back"], baseLoad: 100, system: null },
  "Front Squat": { pattern: "squat", muscles: ["quads", "glutes"], baseLoad: 85, system: null },
  Deadlift: { pattern: "hinge", muscles: ["posterior", "back", "glutes"], baseLoad: 140, system: null },
  "Bench Press": { pattern: "push", muscles: ["chest", "triceps", "shoulders"], baseLoad: 100, system: null },
  "Overhead Press": { pattern: "push", muscles: ["shoulders", "triceps"], baseLoad: 60, system: null },
  "Row Intervals": { pattern: "cond", muscles: ["posterior", "quads"], baseLoad: null, system: "threshold" },
  "Assault Bike": { pattern: "cond", muscles: ["quads", "shoulders"], baseLoad: null, system: "anaerobic" },
  "Easy Run": { pattern: "cond", muscles: ["quads"], baseLoad: null, system: "aerobic" },
  "Mixed Metcon": { pattern: "cond", muscles: ["posterior", "shoulders"], baseLoad: null, system: "anaerobic" },
};
