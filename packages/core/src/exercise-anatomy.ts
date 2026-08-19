import { gymExercise, type GymExercise, type Muscle } from "./exercise-db";
import { exerciseArchetype, type AnimArchetype } from "./exercise-animation";

// EXERCISE ANATOMY — the per-exercise "what works" model (muscles + stabilizers
// + form cues), written once in core and rendered on BOTH clients (web + mobile)
// on the exercise page. The MOVEMENT ANIMATION lives separately in
// exercise-animation.ts, so the demo can be swapped (procedural → professional
// sketch) without touching any of this. Everything here is derived from the
// exercise DB so all ~190 gym lifts are covered with no per-exercise authoring:
//
//   1. MUSCLE ACTIVATION — the DB already carries each lift's `primary` and
//      `secondary` muscles (order = importance). We turn that into a ranked
//      list with a share-of-effort PERCENTAGE per muscle (primary muscles take
//      the bulk, weighted by order; secondary muscles split the remainder) and
//      a High/Moderate/Low activation tier — the "Pectoralis major — main
//      driver … triceps ~22-25%" breakdown, computed, not hand-typed.
//   2. STABILIZERS — the trunk/scapular/grip muscles that brace but don't drive,
//      keyed off the movement archetype (pressing → rotator cuff + serratus +
//      core; hinging → erectors + grip; …).
//   3. FORM CUES + an emphasis line — the step-by-step "how it's done" text, also
//      keyed off the archetype.
//
// Pure + shared. The clients only render — no anatomy logic lives client-side.

// ── 1. Muscle display names ─────────────────────────────────────────────────

/** Anatomical + plain-language label per fine-grained muscle. */
export const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: "Pectoralis major (chest)",
  lats: "Latissimus dorsi (lats)",
  "upper-back": "Rhomboids & mid-traps (upper back)",
  "lower-back": "Erector spinae (lower back)",
  traps: "Trapezius (traps)",
  "front-delts": "Anterior deltoid (front shoulder)",
  "side-delts": "Lateral deltoid (side shoulder)",
  "rear-delts": "Posterior deltoid (rear shoulder)",
  biceps: "Biceps brachii",
  triceps: "Triceps brachii",
  forearms: "Forearms & grip",
  quads: "Quadriceps (front thigh)",
  hamstrings: "Hamstrings (rear thigh)",
  glutes: "Gluteus maximus (glutes)",
  adductors: "Adductors (inner thigh)",
  abductors: "Abductors (outer hip)",
  calves: "Calves (gastrocnemius/soleus)",
  abs: "Rectus abdominis (abs)",
  obliques: "Obliques",
  "hip-flexors": "Hip flexors",
};

/**
 * The i18n key for a fine-grained muscle's short name.
 *
 * MUSCLE_SHORT is English source text — fine for a legend beside an English
 * anatomical label, wrong the moment a muscle name is the whole content of a
 * row (the session body panel, the share deck's muscle split). The `muscleFine.`
 * namespace is deliberately separate from the engine's seven-bucket `muscle.`
 * keys: "chest" means one thing in each and they are not the same list.
 */
export const muscleLabelKey = (m: Muscle): string => `muscleFine.${m}`;

/** Short label (no parenthetical) — for tight rows/legends. */
export const MUSCLE_SHORT: Record<Muscle, string> = {
  chest: "Chest",
  lats: "Lats",
  "upper-back": "Upper back",
  "lower-back": "Lower back",
  traps: "Traps",
  "front-delts": "Front delts",
  "side-delts": "Side delts",
  "rear-delts": "Rear delts",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  quads: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  adductors: "Adductors",
  abductors: "Abductors",
  calves: "Calves",
  abs: "Abs",
  obliques: "Obliques",
  "hip-flexors": "Hip flexors",
};

// ── 2. Activation percentages ───────────────────────────────────────────────

export type ActivationTier = "primary" | "secondary";
export type ActivationLevel = "high" | "moderate" | "low";

export interface MuscleActivation {
  muscle: Muscle;
  label: string;
  short: string;
  tier: ActivationTier;
  /** share of total muscular effort, whole-number % (all rows sum to 100). */
  pct: number;
  level: ActivationLevel;
}

// Prime movers take the bulk of the effort, weighted by their authored order
// (the first primary is the main driver). Assisting muscles split what's left.
const primaryWeight = (i: number): number => Math.max(1.7, 3.4 - i * 0.75);
const secondaryWeight = (j: number): number => Math.max(0.5, 1.25 - j * 0.28);

/** The activation LEVEL band for a tier + share. Exported so the session-wide
 *  muscle map (session-muscle-map.ts) bands its rows by the same rule a single
 *  lift's rows are banded by, rather than re-deriving the thresholds. */
export const levelFor = (tier: ActivationTier, pct: number): ActivationLevel =>
  tier === "primary" ? (pct >= 22 ? "high" : "moderate") : pct >= 12 ? "moderate" : "low";

/** Ranked muscle activation for a lift — primary first, each with a share-of-
 *  effort %. The %s are a transparent model over the DB's primary/secondary
 *  ordering (not a lab EMG figure), and always sum to 100. */
export function muscleActivation(e: GymExercise): MuscleActivation[] {
  const raw: { muscle: Muscle; tier: ActivationTier; w: number }[] = [
    ...e.primary.map((muscle, i) => ({ muscle, tier: "primary" as const, w: primaryWeight(i) })),
    ...e.secondary.map((muscle, j) => ({ muscle, tier: "secondary" as const, w: secondaryWeight(j) })),
  ];
  const total = raw.reduce((s, r) => s + r.w, 0) || 1;
  const rows = raw.map((r) => ({
    muscle: r.muscle,
    label: MUSCLE_LABEL[r.muscle],
    short: MUSCLE_SHORT[r.muscle],
    tier: r.tier,
    pct: Math.round((r.w / total) * 100),
    level: "low" as ActivationLevel,
  }));
  // Fix rounding drift so the column reads as a clean 100%.
  const drift = 100 - rows.reduce((s, r) => s + r.pct, 0);
  if (rows.length > 0 && drift !== 0) rows[0]!.pct += drift;
  for (const r of rows) r.level = levelFor(r.tier, r.pct);
  return rows;
}

// ── 3. Stabilizers + cues + emphasis note, per movement archetype ───────────

interface ArchetypeInfo {
  /** the trunk/scapular/grip muscles that brace but don't drive. */
  stabilizers: string[];
  /** ordered form cues — the "how it's done" steps. */
  cues: string[];
  /** one plain-language line on where the force goes (the bench-style note). */
  emphasis: string;
}

const CORE = "Core (abs & obliques)";
const ERECTORS = "Erector spinae (spinal bracing)";
const GRIP = "Forearms & grip";
const CUFF = "Rotator cuff";
const SERRATUS = "Serratus anterior";
const SCAP = "Scapular stabilizers";
const UPTRAP = "Upper trapezius";

const ARCHETYPE_INFO: Record<AnimArchetype, ArchetypeInfo> = {
  squat: {
    stabilizers: [CORE, ERECTORS, "Adductors"],
    cues: [
      "Brace the core and set the bar across your upper back.",
      "Break at the hips and knees together, sitting between your legs.",
      "Descend until hip crease passes the knee, knees tracking over toes.",
      "Drive through mid-foot to stand tall, hips and chest rising together.",
    ],
    emphasis: "The knee (quads) and hip (glutes) extensors share the load; the trunk braces to keep the bar over mid-foot.",
  },
  lunge: {
    stabilizers: [CORE, "Abductors (hip stability)", ERECTORS],
    cues: [
      "Take a split stance, torso tall, weight in each hand or on your back.",
      "Lower straight down until the back knee nears the floor.",
      "Keep the front shin near vertical and the knee over the foot.",
      "Push through the front heel to return to the start.",
    ],
    emphasis: "The front-leg quad and glute do most of the work; the trunk and hip abductors fight the side-to-side wobble.",
  },
  hinge: {
    stabilizers: [CORE, ERECTORS, GRIP, UPTRAP],
    cues: [
      "Stand with the bar over mid-foot, brace, and set a flat back.",
      "Push the hips back, letting the bar travel down the legs.",
      "Keep the bar close and the spine neutral throughout.",
      "Drive the hips forward to stand, squeezing the glutes at the top.",
    ],
    emphasis: "The posterior chain drives it — hamstrings and glutes extend the hip while the erectors hold the spine rigid.",
  },
  hipThrust: {
    stabilizers: [CORE, "Adductors", "Hamstrings (co-contraction)"],
    cues: [
      "Set your upper back on a bench, bar over the hips, feet planted.",
      "Tuck the chin and brace the core.",
      "Drive through the heels to lift the hips to full extension.",
      "Squeeze the glutes hard at the top, then lower under control.",
    ],
    emphasis: "Near-pure hip extension: the glutes are the main driver, hamstrings assist, and the core prevents over-arching.",
  },
  pressH: {
    stabilizers: [CUFF, SERRATUS, SCAP, CORE],
    cues: [
      "Set your shoulder blades back and down; grip just wider than shoulders.",
      "Lower the bar to the lower chest with elbows ~45° from the torso.",
      "Keep wrists stacked over elbows and forearms vertical.",
      "Press up and slightly back to lockout over the shoulders.",
    ],
    emphasis: "The shoulder joint (chest + front delts) contributes most of the force (~75%); the triceps finish the lockout (~25%).",
  },
  pressV: {
    stabilizers: [CUFF, SERRATUS, UPTRAP, "Core (anti-extension)"],
    cues: [
      "Start with the bar at the shoulders, elbows slightly in front.",
      "Brace the glutes and abs so the ribs don't flare.",
      "Press overhead, moving the head 'through the window' as the bar clears.",
      "Finish with the bar stacked over mid-foot, biceps by the ears.",
    ],
    emphasis: "The shoulders (front + side delts) drive the press; the triceps lock it out and the trunk resists leaning back.",
  },
  dip: {
    stabilizers: [CUFF, SCAP, CORE],
    cues: [
      "Support yourself on the bars, arms straight, shoulders down.",
      "Lower by bending the elbows until the shoulders reach elbow height.",
      "Lean the torso forward for chest, stay upright for triceps.",
      "Press back up to a strong, locked-out top.",
    ],
    emphasis: "A vertical push: the chest and front delts share the descent, and the triceps drive the lockout.",
  },
  pullH: {
    stabilizers: [CUFF, CORE, ERECTORS, GRIP],
    cues: [
      "Hinge to a flat-back position, arms hanging under the shoulders.",
      "Lead with the elbows, pulling the bar toward the lower ribs.",
      "Squeeze the shoulder blades together at the top.",
      "Lower under control to a full stretch without rounding.",
    ],
    emphasis: "The lats and mid-back muscles row the load; the biceps assist and the erectors hold the hinged spine.",
  },
  pullV: {
    stabilizers: [CUFF, CORE, GRIP, "Lower trapezius"],
    cues: [
      "Hang from the bar, shoulders active (not fully shrugged).",
      "Pull the elbows down and back, driving the chest to the bar.",
      "Bring the chin over the bar without kipping.",
      "Lower all the way to straight arms under control.",
    ],
    emphasis: "The lats are the prime mover in this vertical pull; the biceps and mid-back assist through the top half.",
  },
  curl: {
    stabilizers: [SCAP, "Wrist flexors"],
    cues: [
      "Stand tall, elbows pinned to your sides.",
      "Curl the weight up by flexing the elbow only.",
      "Keep the upper arm still — no swinging.",
      "Lower slowly to a full stretch at the bottom.",
    ],
    emphasis: "A single-joint elbow flexion: the biceps (and brachialis) do the work, forearms assist grip and supination.",
  },
  extension: {
    stabilizers: [SCAP, "Wrist extensors"],
    cues: [
      "Fix the upper arm in place, elbow as the only moving joint.",
      "Extend the forearm until the elbow is straight.",
      "Squeeze the triceps hard at lockout.",
      "Return under control without letting the elbow drift.",
    ],
    emphasis: "A single-joint elbow extension isolating the triceps; the wrist and shoulder only stabilize.",
  },
  raise: {
    stabilizers: [CUFF, UPTRAP, SCAP],
    cues: [
      "Start with the weights at your sides, a soft bend in the elbows.",
      "Raise the arms out to about shoulder height, leading with the elbows.",
      "Keep the movement smooth — no heaving with the torso.",
      "Lower slowly, resisting the whole way down.",
    ],
    emphasis: "The targeted deltoid head raises the arm; the rotator cuff and traps stabilize the shoulder blade.",
  },
  calf: {
    stabilizers: ["Ankle stabilizers", "Tibialis anterior"],
    cues: [
      "Balls of the feet on the platform, heels free to drop.",
      "Lower the heels for a full stretch at the bottom.",
      "Drive up onto the toes as high as possible.",
      "Pause at the top, then lower slowly.",
    ],
    emphasis: "Pure ankle plantar-flexion: the calves (gastrocnemius/soleus) raise the body onto the toes.",
  },
  plank: {
    stabilizers: [ERECTORS, "Glutes", "Shoulder stabilizers"],
    cues: [
      "Set forearms (or hands) under the shoulders, body in one line.",
      "Brace the abs and squeeze the glutes.",
      "Keep the hips level — no sagging, no piking.",
      "Breathe steadily and hold the tension.",
    ],
    emphasis: "An anti-movement hold: the abs and deep core resist the spine extending under gravity.",
  },
  crunch: {
    stabilizers: ["Hip flexors", "Obliques"],
    cues: [
      "Lie back with the lower back supported.",
      "Curl the ribcage toward the pelvis, not just the neck.",
      "Exhale and squeeze the abs at the top of the curl.",
      "Lower slowly, keeping tension on the abs.",
    ],
    emphasis: "Spinal flexion driven by the rectus abdominis; the obliques and hip flexors assist.",
  },
  hangingLeg: {
    stabilizers: [GRIP, "Lats", "Obliques"],
    cues: [
      "Hang from the bar, shoulders active, legs together.",
      "Tilt the pelvis and raise the legs by curling the hips up.",
      "Avoid swinging — control the descent.",
      "Lower to a dead hang without arching the lower back.",
    ],
    emphasis: "The lower abs and hip flexors raise the legs; the grip and lats keep the body stable on the bar.",
  },
  twist: {
    stabilizers: [ERECTORS, "Abs", "Hip stabilizers"],
    cues: [
      "Set a tall, braced trunk and grip the load at the chest.",
      "Rotate from the ribcage, not the arms.",
      "Move under control to each side (or resist rotation for anti-rotation).",
      "Keep the hips facing forward and the core tight.",
    ],
    emphasis: "The obliques drive (or resist) the rotation; the deep core and erectors keep the spine safe.",
  },
  jump: {
    stabilizers: [CORE, "Calves", "Ankle stabilizers"],
    cues: [
      "Start tall, then dip quickly into a quarter squat.",
      "Swing the arms and drive explosively through the floor.",
      "Extend the hips, knees and ankles fully in the air.",
      "Land softly with bent knees to absorb the force.",
    ],
    emphasis: "Explosive triple-extension: the glutes and quads generate power and the calves finish the drive.",
  },
  carry: {
    stabilizers: [CORE, UPTRAP, GRIP, ERECTORS],
    cues: [
      "Pick up the load with a flat back and stand tall.",
      "Keep the shoulders packed and the ribs stacked over the hips.",
      "Walk with short, controlled steps, not letting the trunk sway.",
      "Set the load down with the same flat-back hinge.",
    ],
    emphasis: "A loaded carry: the grip and traps hold the weight while the core resists the trunk bending sideways.",
  },
  olympic: {
    stabilizers: [CORE, ERECTORS, GRIP, UPTRAP],
    cues: [
      "Set up over the bar with a flat back and shoulders over the bar.",
      "Push the floor away, keeping the bar close as it passes the knees.",
      "Explosively extend the hips, knees and ankles, then pull under.",
      "Receive the bar in a stable rack or overhead position.",
    ],
    emphasis: "A full-body power lift: the legs and hips generate the drive, the traps finish the pull, and the whole trunk braces.",
  },
  generic: {
    stabilizers: [CORE],
    cues: [
      "Set a stable, braced starting position.",
      "Move through a full range of motion under control.",
      "Keep tension on the working muscles throughout.",
      "Return to the start without losing position.",
    ],
    emphasis: "The listed prime movers drive the lift while the trunk stabilizes.",
  },
};

// ── 4. The public resolver ──────────────────────────────────────────────────

export interface ExerciseAnatomy {
  name: string;
  category: string;
  equipment: string;
  mechanics: "compound" | "isolation";
  /** the movement archetype (shared with the animation module). */
  archetype: AnimArchetype;
  /** ranked muscle activation, primary first, %s summing to 100. */
  activation: MuscleActivation[];
  primary: MuscleActivation[];
  secondary: MuscleActivation[];
  stabilizers: string[];
  cues: string[];
  emphasis: string;
}

/**
 * The muscles/stabilizers/cues model for a gym lift, or null for a name the DB
 * doesn't know (custom lifts, cardio sports — those pages skip the section).
 * The movement ANIMATION is resolved separately via exerciseAnimation() in
 * exercise-animation.ts, so the demo can be swapped without touching this.
 */
export function exerciseAnatomy(name: string): ExerciseAnatomy | null {
  const e = gymExercise(name);
  if (!e) return null;
  const archetype = exerciseArchetype(e);
  const info = ARCHETYPE_INFO[archetype];
  const activation = muscleActivation(e);
  return {
    name: e.name,
    category: e.category,
    equipment: e.equipment,
    mechanics: e.mechanics,
    archetype,
    activation,
    primary: activation.filter((a) => a.tier === "primary"),
    secondary: activation.filter((a) => a.tier === "secondary"),
    stabilizers: info.stabilizers,
    cues: info.cues,
    emphasis: info.emphasis,
  };
}
