import type { Movement, MuscleGroup } from "./engines/types";

// THE EXERCISE DATABASE — every gym exercise as first-class data, each with its
// OWN property sheet: muscles worked (primary/secondary, fine-grained), movement
// pattern, equipment, mechanics, unilateral flag, how load is entered
// (external / bodyweight / bodyweight+added / assisted) and how a set is
// measured (reps / seconds / metres). Written once in core and consumed by BOTH
// clients, so the pickers, the Builders, the loggers and the engines all read
// the same registry. Sports live in olympic-sports.ts (the manual sport-session
// catalog); exercise-profile.ts unifies the two worlds into one resolver.
//
// The DB also DERIVES an engine `Movement` for every entry (GYM_MOVEMENTS) and
// folds into the MOVEMENTS map, so fatigue attribution, volume-by-muscle,
// landmarks, records and the pickers cover the whole catalog with no per-engine
// changes. The 18 original hand-tuned MOVEMENTS entries still override their DB
// twins, so existing engine behaviour (baseLoads the prescription tests pin)
// is unchanged.
//
// Naming rules (enforced by tests): "KB" prefix for kettlebell moves, no
// middots, unique names.

/** Fine-grained muscles — richer than the engine's 7 groups (mapped below). */
export type Muscle =
  | "chest"
  | "lats"
  | "upper-back"
  | "lower-back"
  | "traps"
  | "front-delts"
  | "side-delts"
  | "rear-delts"
  | "biceps"
  | "triceps"
  | "forearms"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "adductors"
  | "abductors"
  | "calves"
  | "abs"
  | "obliques"
  | "hip-flexors";

export type GymEquipment =
  | "barbell"
  | "dumbbell"
  | "kettlebell"
  | "machine"
  | "cable"
  | "bodyweight"
  | "band"
  | "trap-bar"
  | "ez-bar"
  | "smith"
  | "sled"
  | "medball"
  | "landmine"
  | "other";

export type Mechanics = "compound" | "isolation";

/** How the load field reads for this exercise. */
export type LoadMode =
  | "external" // plates/stack/bells — the number IS the load
  | "bodyweight" // no load entry expected (BW)
  | "bodyweight-plus" // BW + added weight (dips/pull-ups with a belt)
  | "assisted"; // BW − assistance (band/machine assist)

/** What a set counts — reps, seconds (holds), or metres (carries/sleds). */
export type Measure = "reps" | "time" | "distance";

export type GymPattern =
  | "squat"
  | "hinge"
  | "lunge"
  | "push-h" // horizontal push
  | "push-v" // vertical push
  | "pull-h" // horizontal pull
  | "pull-v" // vertical pull
  | "olympic"
  | "carry"
  | "core"
  | "isolation"
  | "plyo";

/** Picker/muscle-group headings (extends the admin library's category set). */
export type GymCategory =
  | "Chest"
  | "Back"
  | "Shoulders"
  | "Traps & Forearms"
  | "Quads & Glutes"
  | "Hamstrings & Glutes"
  | "Calves"
  | "Biceps"
  | "Triceps"
  | "Abs & Core"
  | "Olympic & Power"
  | "Carries & Conditioning";

export interface GymExercise {
  name: string;
  category: GymCategory;
  pattern: GymPattern;
  /** Prime movers (order = importance). */
  primary: Muscle[];
  /** Assisting muscles. */
  secondary: Muscle[];
  equipment: GymEquipment;
  mechanics: Mechanics;
  /** One side at a time (lunges, single-arm rows, suitcase carries…). */
  unilateral?: boolean;
  loadMode: LoadMode;
  measure: Measure;
  /** Typical intermediate working load, kg (null for bodyweight/holds) — feeds
   *  the engine Movement so prescription has a starting anchor. */
  baseLoad: number | null;
}

// Compact author helper — defaults cover the common case (bilateral external
// compound counted in reps); opts override per exercise.
const E = (
  name: string,
  category: GymCategory,
  pattern: GymPattern,
  primary: Muscle[],
  secondary: Muscle[],
  equipment: GymEquipment,
  baseLoad: number | null,
  opts: Partial<Pick<GymExercise, "mechanics" | "unilateral" | "loadMode" | "measure">> = {},
): GymExercise => ({
  name,
  category,
  pattern,
  primary,
  secondary,
  equipment,
  baseLoad,
  mechanics: opts.mechanics ?? "compound",
  loadMode: opts.loadMode ?? (equipment === "bodyweight" ? "bodyweight" : "external"),
  measure: opts.measure ?? "reps",
  ...(opts.unilateral ? { unilateral: true } : {}),
});

const ISO = { mechanics: "isolation" as const };
const UNI = { unilateral: true };
const BWPLUS = { loadMode: "bodyweight-plus" as const };
const TIME = { measure: "time" as const };
const DIST = { measure: "distance" as const };

export const GYM_EXERCISES: GymExercise[] = [
  // ---- Chest ----
  E("Bench Press", "Chest", "push-h", ["chest"], ["triceps", "front-delts"], "barbell", 100),
  E("Incline Bench Press", "Chest", "push-h", ["chest", "front-delts"], ["triceps"], "barbell", 85),
  E("Decline Bench Press", "Chest", "push-h", ["chest"], ["triceps"], "barbell", 100),
  E("Close-Grip Bench Press", "Chest", "push-h", ["triceps", "chest"], ["front-delts"], "barbell", 85),
  E("Smith Bench Press", "Chest", "push-h", ["chest"], ["triceps", "front-delts"], "smith", 90),
  E("DB Bench Press", "Chest", "push-h", ["chest"], ["triceps", "front-delts"], "dumbbell", 30),
  E("Incline DB Press", "Chest", "push-h", ["chest", "front-delts"], ["triceps"], "dumbbell", 26),
  E("Decline DB Press", "Chest", "push-h", ["chest"], ["triceps"], "dumbbell", 30),
  E("Machine Chest Press", "Chest", "push-h", ["chest"], ["triceps", "front-delts"], "machine", 60),
  E("DB Fly", "Chest", "isolation", ["chest"], ["front-delts"], "dumbbell", 14, ISO),
  E("Incline DB Fly", "Chest", "isolation", ["chest"], ["front-delts"], "dumbbell", 12, ISO),
  E("Cable Fly", "Chest", "isolation", ["chest"], ["front-delts"], "cable", 15, ISO),
  E("Pec Deck", "Chest", "isolation", ["chest"], [], "machine", 50, ISO),
  E("Push-Up", "Chest", "push-h", ["chest"], ["triceps", "front-delts", "abs"], "bodyweight", null),
  E("Weighted Push-Up", "Chest", "push-h", ["chest"], ["triceps", "front-delts"], "bodyweight", null, BWPLUS),
  E("Deficit Push-Up", "Chest", "push-h", ["chest"], ["triceps", "front-delts"], "bodyweight", null),
  // Chest dips (forward lean, elbows flared → chest-primary). Triceps dips live
  // under Triceps. Both count bodyweight toward tonnage (loadMode bodyweight);
  // the weighted variants add the entered plate on top (bodyweight-plus).
  E("Chest Dip", "Chest", "push-v", ["chest"], ["triceps", "front-delts"], "bodyweight", null),
  E("Weighted Chest Dip", "Chest", "push-v", ["chest"], ["triceps", "front-delts"], "bodyweight", null, BWPLUS),
  E("Ring Push-Up", "Chest", "push-h", ["chest"], ["triceps", "abs"], "bodyweight", null),
  E("Landmine Press", "Chest", "push-h", ["chest", "front-delts"], ["triceps", "abs"], "landmine", 30, UNI),
  E("Svend Press", "Chest", "isolation", ["chest"], ["front-delts"], "other", 10, ISO),

  // ---- Back ----
  E("Deadlift", "Back", "hinge", ["hamstrings", "glutes", "lower-back"], ["lats", "traps", "forearms"], "barbell", 140),
  E("Sumo Deadlift", "Back", "hinge", ["glutes", "hamstrings", "adductors"], ["lower-back", "traps"], "barbell", 140),
  E("Trap-Bar Deadlift", "Back", "hinge", ["glutes", "quads", "hamstrings"], ["lower-back", "traps", "forearms"], "trap-bar", 150),
  E("Deficit Deadlift", "Back", "hinge", ["hamstrings", "glutes", "lower-back"], ["lats", "traps"], "barbell", 120),
  E("Rack Pull", "Back", "hinge", ["lower-back", "traps"], ["hamstrings", "glutes", "forearms"], "barbell", 160),
  E("Barbell Row", "Back", "pull-h", ["lats", "upper-back"], ["biceps", "rear-delts", "lower-back"], "barbell", 80),
  E("Pendlay Row", "Back", "pull-h", ["lats", "upper-back"], ["biceps", "lower-back"], "barbell", 75),
  E("T-Bar Row", "Back", "pull-h", ["lats", "upper-back"], ["biceps", "rear-delts"], "landmine", 60),
  E("DB Row", "Back", "pull-h", ["lats", "upper-back"], ["biceps", "rear-delts"], "dumbbell", 30, UNI),
  E("Meadows Row", "Back", "pull-h", ["lats", "upper-back"], ["biceps", "rear-delts"], "landmine", 25, UNI),
  E("Chest-Supported Row", "Back", "pull-h", ["upper-back", "lats"], ["biceps", "rear-delts"], "dumbbell", 24),
  E("Seal Row", "Back", "pull-h", ["upper-back", "lats"], ["biceps"], "barbell", 60),
  E("Cable Row", "Back", "pull-h", ["lats", "upper-back"], ["biceps", "rear-delts"], "cable", 60),
  E("Machine Row", "Back", "pull-h", ["lats", "upper-back"], ["biceps"], "machine", 60),
  E("Inverted Row", "Back", "pull-h", ["lats", "upper-back"], ["biceps", "abs"], "bodyweight", null),
  E("Pull-Up", "Back", "pull-v", ["lats"], ["biceps", "upper-back", "forearms"], "bodyweight", null),
  E("Chin-Up", "Back", "pull-v", ["lats", "biceps"], ["upper-back", "forearms"], "bodyweight", null),
  E("Weighted Chin-Up", "Back", "pull-v", ["lats", "biceps"], ["upper-back", "forearms"], "bodyweight", null, BWPLUS),
  E("Weighted Pull-Up", "Back", "pull-v", ["lats"], ["biceps", "upper-back"], "bodyweight", null, BWPLUS),
  E("Assisted Pull-Up", "Back", "pull-v", ["lats"], ["biceps", "upper-back"], "machine", null, { loadMode: "assisted" }),
  E("Muscle-Up", "Back", "pull-v", ["lats", "chest"], ["biceps", "triceps", "abs"], "bodyweight", null),
  E("Lat Pulldown", "Back", "pull-v", ["lats"], ["biceps", "upper-back"], "cable", 55),
  E("Neutral-Grip Pulldown", "Back", "pull-v", ["lats"], ["biceps"], "cable", 55),
  E("Straight-Arm Pulldown", "Back", "isolation", ["lats"], ["triceps"], "cable", 25, ISO),
  E("Good Morning", "Back", "hinge", ["hamstrings", "lower-back"], ["glutes"], "barbell", 50),
  E("Back Extension", "Back", "hinge", ["lower-back", "glutes"], ["hamstrings"], "bodyweight", null),
  E("Reverse Hyper", "Back", "hinge", ["glutes", "lower-back"], ["hamstrings"], "machine", 40),

  // ---- Shoulders ----
  E("Overhead Press", "Shoulders", "push-v", ["front-delts", "side-delts"], ["triceps", "traps", "abs"], "barbell", 60),
  E("Push Press", "Shoulders", "push-v", ["front-delts", "side-delts"], ["triceps", "quads", "glutes"], "barbell", 70),
  E("DB Overhead Press", "Shoulders", "push-v", ["front-delts", "side-delts"], ["triceps"], "dumbbell", 22),
  E("Seated DB Shoulder Press", "Shoulders", "push-v", ["front-delts", "side-delts"], ["triceps"], "dumbbell", 24),
  E("Arnold Press", "Shoulders", "push-v", ["front-delts", "side-delts"], ["triceps"], "dumbbell", 18),
  E("Z Press", "Shoulders", "push-v", ["front-delts"], ["triceps", "abs"], "barbell", 40),
  E("Machine Shoulder Press", "Shoulders", "push-v", ["front-delts", "side-delts"], ["triceps"], "machine", 45),
  E("Handstand Push-Up", "Shoulders", "push-v", ["front-delts", "side-delts"], ["triceps", "traps"], "bodyweight", null),
  E("Pike Push-Up", "Shoulders", "push-v", ["front-delts", "side-delts"], ["triceps"], "bodyweight", null),
  E("Lateral Raise", "Shoulders", "isolation", ["side-delts"], [], "dumbbell", 8, ISO),
  E("Cable Lateral Raise", "Shoulders", "isolation", ["side-delts"], [], "cable", 7, ISO),
  E("Front Raise", "Shoulders", "isolation", ["front-delts"], [], "dumbbell", 8, ISO),
  E("Rear Delt Fly", "Shoulders", "isolation", ["rear-delts"], ["upper-back"], "dumbbell", 8, ISO),
  E("Face Pull", "Shoulders", "isolation", ["rear-delts", "upper-back"], ["traps"], "cable", 20, ISO),
  E("Upright Row", "Shoulders", "pull-v", ["side-delts", "traps"], ["biceps"], "barbell", 35),

  // ---- Traps & Forearms ----
  E("Barbell Shrug", "Traps & Forearms", "isolation", ["traps"], ["forearms"], "barbell", 100, ISO),
  E("DB Shrug", "Traps & Forearms", "isolation", ["traps"], ["forearms"], "dumbbell", 30, ISO),
  E("Wrist Curl", "Traps & Forearms", "isolation", ["forearms"], [], "barbell", 20, ISO),
  E("Reverse Wrist Curl", "Traps & Forearms", "isolation", ["forearms"], [], "barbell", 12, ISO),
  E("Reverse Curl", "Traps & Forearms", "isolation", ["forearms", "biceps"], [], "ez-bar", 25, ISO),
  E("Dead Hang", "Traps & Forearms", "isolation", ["forearms"], ["lats"], "bodyweight", null, { ...ISO, ...TIME }),
  E("Farmer Hold", "Traps & Forearms", "carry", ["forearms", "traps"], ["abs"], "dumbbell", 32, TIME),
  E("Plate Pinch", "Traps & Forearms", "isolation", ["forearms"], [], "other", 10, { ...ISO, ...TIME }),

  // ---- Quads & Glutes ----
  E("Back Squat", "Quads & Glutes", "squat", ["quads", "glutes"], ["hamstrings", "lower-back", "abs"], "barbell", 100),
  E("Front Squat", "Quads & Glutes", "squat", ["quads"], ["glutes", "abs", "upper-back"], "barbell", 85),
  E("Box Squat", "Quads & Glutes", "squat", ["glutes", "quads"], ["hamstrings", "lower-back"], "barbell", 95),
  E("Pause Squat", "Quads & Glutes", "squat", ["quads", "glutes"], ["abs"], "barbell", 85),
  E("Overhead Squat", "Quads & Glutes", "squat", ["quads", "glutes"], ["side-delts", "abs", "upper-back"], "barbell", 50),
  E("Zercher Squat", "Quads & Glutes", "squat", ["quads", "glutes"], ["abs", "biceps"], "barbell", 70),
  E("Goblet Squat", "Quads & Glutes", "squat", ["quads", "glutes"], ["abs"], "dumbbell", 40),
  E("Smith Squat", "Quads & Glutes", "squat", ["quads", "glutes"], [], "smith", 90),
  E("Hack Squat", "Quads & Glutes", "squat", ["quads"], ["glutes"], "machine", 100),
  E("Leg Press", "Quads & Glutes", "squat", ["quads", "glutes"], ["hamstrings"], "machine", 160),
  E("Belt Squat", "Quads & Glutes", "squat", ["quads", "glutes"], [], "machine", 80),
  E("Bodyweight Squat", "Quads & Glutes", "squat", ["quads", "glutes"], [], "bodyweight", null),
  E("Cyclist Squat", "Quads & Glutes", "squat", ["quads"], ["glutes"], "barbell", 60),
  E("Sissy Squat", "Quads & Glutes", "isolation", ["quads"], ["hip-flexors"], "bodyweight", null, ISO),
  E("Pistol Squat", "Quads & Glutes", "squat", ["quads", "glutes"], ["abs"], "bodyweight", null, UNI),
  E("Bulgarian Split Squat", "Quads & Glutes", "lunge", ["quads", "glutes"], ["hamstrings", "adductors"], "dumbbell", 20, UNI),
  E("Split Squat", "Quads & Glutes", "lunge", ["quads", "glutes"], ["hamstrings"], "dumbbell", 20, UNI),
  E("Walking Lunge", "Quads & Glutes", "lunge", ["quads", "glutes"], ["hamstrings", "abs"], "dumbbell", 16, UNI),
  E("Reverse Lunge", "Quads & Glutes", "lunge", ["glutes", "quads"], ["hamstrings"], "dumbbell", 16, UNI),
  E("Lateral Lunge", "Quads & Glutes", "lunge", ["adductors", "glutes"], ["quads"], "dumbbell", 12, UNI),
  E("Step-Up", "Quads & Glutes", "lunge", ["quads", "glutes"], ["hamstrings"], "dumbbell", 16, UNI),
  E("Leg Extension", "Quads & Glutes", "isolation", ["quads"], [], "machine", 40, ISO),
  E("Hip Abduction Machine", "Quads & Glutes", "isolation", ["abductors", "glutes"], [], "machine", 40, ISO),
  E("Hip Adduction Machine", "Quads & Glutes", "isolation", ["adductors"], [], "machine", 40, ISO),
  E("Wall Sit", "Quads & Glutes", "squat", ["quads"], ["glutes"], "bodyweight", null, TIME),

  // ---- Hamstrings & Glutes ----
  E("Romanian Deadlift", "Hamstrings & Glutes", "hinge", ["hamstrings", "glutes"], ["lower-back", "forearms"], "barbell", 90),
  E("DB Romanian Deadlift", "Hamstrings & Glutes", "hinge", ["hamstrings", "glutes"], ["lower-back"], "dumbbell", 30),
  E("Stiff-Leg Deadlift", "Hamstrings & Glutes", "hinge", ["hamstrings"], ["lower-back", "glutes"], "barbell", 80),
  E("Single-Leg RDL", "Hamstrings & Glutes", "hinge", ["hamstrings", "glutes"], ["abs"], "dumbbell", 16, UNI),
  E("Hip Thrust", "Hamstrings & Glutes", "hinge", ["glutes"], ["hamstrings", "quads"], "barbell", 100),
  E("Glute Bridge", "Hamstrings & Glutes", "hinge", ["glutes"], ["hamstrings"], "bodyweight", null),
  E("Barbell Glute Bridge", "Hamstrings & Glutes", "hinge", ["glutes"], ["hamstrings"], "barbell", 80),
  E("Nordic Curl", "Hamstrings & Glutes", "isolation", ["hamstrings"], ["glutes"], "bodyweight", null, ISO),
  E("Glute-Ham Raise", "Hamstrings & Glutes", "isolation", ["hamstrings", "glutes"], ["lower-back"], "bodyweight", null, ISO),
  E("Lying Leg Curl", "Hamstrings & Glutes", "isolation", ["hamstrings"], [], "machine", 35, ISO),
  E("Seated Leg Curl", "Hamstrings & Glutes", "isolation", ["hamstrings"], [], "machine", 40, ISO),
  E("Cable Pull-Through", "Hamstrings & Glutes", "hinge", ["glutes", "hamstrings"], ["lower-back"], "cable", 30),
  E("KB Swing", "Hamstrings & Glutes", "hinge", ["glutes", "hamstrings"], ["lower-back", "abs", "forearms"], "kettlebell", 24),
  E("Heavy KB Swing", "Hamstrings & Glutes", "hinge", ["glutes", "hamstrings"], ["lower-back", "forearms"], "kettlebell", 32),

  // ---- Calves ----
  E("Standing Calf Raise", "Calves", "isolation", ["calves"], [], "machine", 60, ISO),
  E("Seated Calf Raise", "Calves", "isolation", ["calves"], [], "machine", 40, ISO),
  E("Single-Leg Calf Raise", "Calves", "isolation", ["calves"], [], "bodyweight", null, { ...ISO, ...UNI }),
  E("Donkey Calf Raise", "Calves", "isolation", ["calves"], [], "machine", 60, ISO),

  // ---- Biceps ----
  E("Barbell Curl", "Biceps", "isolation", ["biceps"], ["forearms"], "barbell", 30, ISO),
  E("EZ-Bar Curl", "Biceps", "isolation", ["biceps"], ["forearms"], "ez-bar", 27, ISO),
  E("DB Curl", "Biceps", "isolation", ["biceps"], ["forearms"], "dumbbell", 12, ISO),
  E("Hammer Curl", "Biceps", "isolation", ["biceps", "forearms"], [], "dumbbell", 12, ISO),
  E("Incline DB Curl", "Biceps", "isolation", ["biceps"], [], "dumbbell", 10, ISO),
  E("Preacher Curl", "Biceps", "isolation", ["biceps"], ["forearms"], "ez-bar", 22, ISO),
  E("Concentration Curl", "Biceps", "isolation", ["biceps"], [], "dumbbell", 10, { ...ISO, ...UNI }),
  E("Cable Curl", "Biceps", "isolation", ["biceps"], ["forearms"], "cable", 25, ISO),
  E("Spider Curl", "Biceps", "isolation", ["biceps"], [], "ez-bar", 20, ISO),

  // ---- Triceps ----
  E("Skull Crusher", "Triceps", "isolation", ["triceps"], [], "ez-bar", 25, ISO),
  E("Triceps Pushdown", "Triceps", "isolation", ["triceps"], [], "cable", 25, ISO),
  E("Rope Pushdown", "Triceps", "isolation", ["triceps"], [], "cable", 22, ISO),
  E("Overhead Triceps Extension", "Triceps", "isolation", ["triceps"], [], "dumbbell", 20, ISO),
  E("Cable Kickback", "Triceps", "isolation", ["triceps"], [], "cable", 8, { ...ISO, ...UNI }),
  E("JM Press", "Triceps", "push-h", ["triceps"], ["chest", "front-delts"], "barbell", 50),
  E("Close-Grip Push-Up", "Triceps", "push-h", ["triceps", "chest"], ["front-delts"], "bodyweight", null),
  // Triceps dips (upright torso, elbows tucked → triceps-primary) plus the
  // weighted variant (bodyweight-plus). Chest-focused dips live under Chest.
  E("Dip", "Triceps", "push-v", ["triceps"], ["chest", "front-delts"], "bodyweight", null),
  E("Weighted Dip", "Triceps", "push-v", ["triceps"], ["chest", "front-delts"], "bodyweight", null, BWPLUS),
  E("Bench Dip", "Triceps", "push-v", ["triceps"], ["chest", "front-delts"], "bodyweight", null),

  // ---- Abs & Core ----
  E("Plank", "Abs & Core", "core", ["abs"], ["obliques", "lower-back"], "bodyweight", null, TIME),
  E("Side Plank", "Abs & Core", "core", ["obliques"], ["abs"], "bodyweight", null, { ...TIME, ...UNI }),
  E("Hollow Hold", "Abs & Core", "core", ["abs"], ["hip-flexors"], "bodyweight", null, TIME),
  E("L-Sit", "Abs & Core", "core", ["abs", "hip-flexors"], ["triceps"], "bodyweight", null, TIME),
  E("Copenhagen Plank", "Abs & Core", "core", ["adductors", "obliques"], ["abs"], "bodyweight", null, { ...TIME, ...UNI }),
  E("Hanging Leg Raise", "Abs & Core", "core", ["abs", "hip-flexors"], ["forearms"], "bodyweight", null),
  E("Hanging Knee Raise", "Abs & Core", "core", ["abs", "hip-flexors"], ["forearms"], "bodyweight", null),
  E("Toes-to-Bar", "Abs & Core", "core", ["abs", "hip-flexors"], ["lats", "forearms"], "bodyweight", null),
  E("Ab Wheel Rollout", "Abs & Core", "core", ["abs"], ["lats", "obliques"], "other", null, { loadMode: "bodyweight" }),
  E("Crunch", "Abs & Core", "core", ["abs"], [], "bodyweight", null, ISO),
  E("Cable Crunch", "Abs & Core", "core", ["abs"], ["obliques"], "cable", 30, ISO),
  E("Sit-Up", "Abs & Core", "core", ["abs", "hip-flexors"], [], "bodyweight", null),
  E("V-Up", "Abs & Core", "core", ["abs", "hip-flexors"], [], "bodyweight", null),
  E("Russian Twist", "Abs & Core", "core", ["obliques"], ["abs"], "medball", 8),
  E("Pallof Press", "Abs & Core", "core", ["obliques", "abs"], [], "cable", 15, UNI),
  E("Dead Bug", "Abs & Core", "core", ["abs"], ["hip-flexors"], "bodyweight", null),
  E("Bird Dog", "Abs & Core", "core", ["lower-back", "abs"], ["glutes"], "bodyweight", null),
  E("Dragon Flag", "Abs & Core", "core", ["abs"], ["obliques", "lats"], "bodyweight", null),

  // ---- Olympic & Power ----
  E("Snatch", "Olympic & Power", "olympic", ["glutes", "quads", "traps"], ["hamstrings", "side-delts", "abs"], "barbell", 70),
  E("Power Snatch", "Olympic & Power", "olympic", ["glutes", "quads", "traps"], ["hamstrings", "side-delts"], "barbell", 65),
  E("Hang Power Snatch", "Olympic & Power", "olympic", ["glutes", "traps"], ["quads", "side-delts"], "barbell", 60),
  E("Clean & Jerk", "Olympic & Power", "olympic", ["glutes", "quads", "traps"], ["hamstrings", "front-delts", "triceps"], "barbell", 90),
  E("Clean", "Olympic & Power", "olympic", ["glutes", "quads", "traps"], ["hamstrings", "upper-back"], "barbell", 90),
  E("Power Clean", "Olympic & Power", "olympic", ["glutes", "quads", "traps"], ["hamstrings", "upper-back"], "barbell", 80),
  E("Hang Clean", "Olympic & Power", "olympic", ["glutes", "traps"], ["quads", "upper-back"], "barbell", 75),
  E("Hang Power Clean", "Olympic & Power", "olympic", ["glutes", "traps"], ["quads", "upper-back"], "barbell", 70),
  E("Clean Pull", "Olympic & Power", "olympic", ["glutes", "traps", "hamstrings"], ["lower-back", "forearms"], "barbell", 100),
  E("Snatch Pull", "Olympic & Power", "olympic", ["glutes", "traps", "hamstrings"], ["lower-back"], "barbell", 90),
  E("Snatch-Grip Deadlift", "Olympic & Power", "hinge", ["hamstrings", "glutes", "traps"], ["lower-back", "forearms"], "barbell", 110),
  E("Push Jerk", "Olympic & Power", "push-v", ["front-delts", "quads"], ["triceps", "glutes"], "barbell", 80),
  E("Split Jerk", "Olympic & Power", "push-v", ["front-delts", "quads"], ["triceps", "glutes"], "barbell", 85),
  E("Thruster", "Olympic & Power", "squat", ["quads", "front-delts"], ["glutes", "triceps"], "barbell", 50),
  E("KB Snatch", "Olympic & Power", "olympic", ["glutes", "hamstrings"], ["side-delts", "forearms"], "kettlebell", 20, UNI),
  E("KB Clean", "Olympic & Power", "olympic", ["glutes", "hamstrings"], ["biceps", "forearms"], "kettlebell", 20, UNI),
  E("KB Clean & Press", "Olympic & Power", "olympic", ["glutes", "front-delts"], ["hamstrings", "triceps"], "kettlebell", 20, UNI),
  E("Seesaw KB Press", "Olympic & Power", "push-v", ["front-delts", "side-delts"], ["triceps", "abs"], "kettlebell", 16),
  E("Turkish Get-Up", "Olympic & Power", "core", ["abs", "front-delts"], ["glutes", "obliques"], "kettlebell", 16, UNI),
  E("Box Jump", "Olympic & Power", "plyo", ["quads", "glutes"], ["calves"], "bodyweight", null),
  E("Broad Jump", "Olympic & Power", "plyo", ["glutes", "quads"], ["hamstrings", "calves"], "bodyweight", null),
  E("Depth Jump", "Olympic & Power", "plyo", ["quads", "calves"], ["glutes"], "bodyweight", null),
  E("Med-Ball Slam", "Olympic & Power", "plyo", ["abs", "lats"], ["front-delts"], "medball", 8),
  E("Wall Ball", "Olympic & Power", "squat", ["quads", "front-delts"], ["glutes"], "medball", 9),

  // ---- Carries & Conditioning ----
  E("Farmer Carry", "Carries & Conditioning", "carry", ["forearms", "traps"], ["abs", "glutes"], "dumbbell", 32, DIST),
  E("Suitcase Carry", "Carries & Conditioning", "carry", ["obliques", "forearms"], ["traps", "abs"], "kettlebell", 24, { ...DIST, ...UNI }),
  E("Overhead Carry", "Carries & Conditioning", "carry", ["side-delts", "abs"], ["traps", "forearms"], "kettlebell", 16, { ...DIST, ...UNI }),
  E("Front Rack Carry", "Carries & Conditioning", "carry", ["abs", "upper-back"], ["biceps", "forearms"], "kettlebell", 20, DIST),
  E("Sandbag Carry", "Carries & Conditioning", "carry", ["abs", "upper-back"], ["glutes", "forearms"], "other", 40, DIST),
  E("Yoke Carry", "Carries & Conditioning", "carry", ["traps", "abs"], ["glutes", "quads"], "other", 120, DIST),
  E("Sled Push", "Carries & Conditioning", "carry", ["quads", "glutes"], ["calves", "chest"], "sled", 80, DIST),
  E("Sled Drag", "Carries & Conditioning", "carry", ["hamstrings", "glutes"], ["quads", "calves"], "sled", 60, DIST),
  E("Bear Crawl", "Carries & Conditioning", "core", ["abs", "front-delts"], ["quads", "obliques"], "bodyweight", null, DIST),
  E("Battle Ropes", "Carries & Conditioning", "plyo", ["front-delts", "abs"], ["forearms", "obliques"], "other", null, { loadMode: "bodyweight", measure: "time" }),
  E("Jump Rope", "Carries & Conditioning", "plyo", ["calves"], ["forearms", "quads"], "other", null, { loadMode: "bodyweight", measure: "time" }),
  E("Burpee", "Carries & Conditioning", "plyo", ["quads", "chest"], ["glutes", "abs", "triceps"], "bodyweight", null),
  E("Tire Flip", "Carries & Conditioning", "hinge", ["glutes", "hamstrings"], ["upper-back", "biceps"], "other", 100),
];

/** The DB keyed by name — O(1) case-sensitive lookup (use `gymExercise`). */
export const GYM_EXERCISE_MAP: Record<string, GymExercise> = Object.fromEntries(
  GYM_EXERCISES.map((e) => [e.name, e]),
);

/** Look up a gym exercise by name (case-insensitive), or undefined. */
export function gymExercise(name: string): GymExercise | undefined {
  const direct = GYM_EXERCISE_MAP[name];
  if (direct) return direct;
  const lower = name.trim().toLowerCase();
  return GYM_EXERCISES.find((e) => e.name.toLowerCase() === lower);
}

/** Every exercise of a category, in authored order. */
export function gymExercisesByCategory(category: GymCategory): GymExercise[] {
  return GYM_EXERCISES.filter((e) => e.category === category);
}

/** Every exercise that works `muscle` (primary first, then secondary). */
export function gymExercisesByMuscle(muscle: Muscle): GymExercise[] {
  return [
    ...GYM_EXERCISES.filter((e) => e.primary.includes(muscle)),
    ...GYM_EXERCISES.filter((e) => !e.primary.includes(muscle) && e.secondary.includes(muscle)),
  ];
}

/** Every exercise using `equipment`. */
export function gymExercisesByEquipment(equipment: GymEquipment): GymExercise[] {
  return GYM_EXERCISES.filter((e) => e.equipment === equipment);
}

/** name → picker heading, for exercisesByCategory's muscle-group grouping. */
export const GYM_CATEGORY_BY_NAME: Record<string, string> = Object.fromEntries(
  GYM_EXERCISES.map((e) => [e.name, e.category]),
);

// ---- Engine bridge -----------------------------------------------------------
// Map the fine-grained muscles onto the engine's 7 fatigue groups. Coarse by
// design: arm/grip work attributes to "back" (pulling musculature), trunk and
// calves to "posterior" (the trunk/posterior-chain bucket) — the engine has no
// finer home for them, and a rough attribution beats none.

const ENGINE_GROUP: Record<Muscle, MuscleGroup> = {
  chest: "chest",
  lats: "back",
  "upper-back": "back",
  "lower-back": "back",
  traps: "back",
  "front-delts": "shoulders",
  "side-delts": "shoulders",
  "rear-delts": "shoulders",
  biceps: "back",
  triceps: "triceps",
  forearms: "back",
  quads: "quads",
  hamstrings: "posterior",
  glutes: "glutes",
  adductors: "glutes",
  abductors: "glutes",
  calves: "posterior",
  abs: "posterior",
  obliques: "posterior",
  "hip-flexors": "quads",
};

/** A derived engine Movement for every DB entry (fatigue/volume attribution). */
export const GYM_MOVEMENTS: Record<string, Movement> = Object.fromEntries(
  GYM_EXERCISES.map((e) => {
    const muscles = [...new Set([...e.primary, ...e.secondary].map((m) => ENGINE_GROUP[m]))].slice(0, 3);
    return [e.name, { pattern: e.pattern, muscles, baseLoad: e.baseLoad, system: null } satisfies Movement];
  }),
);
