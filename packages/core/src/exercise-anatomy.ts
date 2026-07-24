import { gymExercise, type GymExercise, type Muscle } from "./exercise-db";

// EXERCISE ANATOMY — the per-exercise "how it's done" + "what works" model,
// written once in core and rendered on BOTH clients (web + mobile) on the
// exercise page. Three things live here, all derived from the exercise DB so
// every one of the ~190 gym lifts is covered with no per-exercise authoring:
//
//   1. MUSCLE ACTIVATION — the DB already carries each lift's `primary` and
//      `secondary` muscles (order = importance). We turn that into a ranked
//      list with a share-of-effort PERCENTAGE per muscle (primary muscles take
//      the bulk, weighted by order; secondary muscles split the remainder) and
//      a High/Moderate/Low activation tier — the "Pectoralis major — main
//      driver … triceps ~22-25%" breakdown, computed, not hand-typed.
//   2. STABILIZERS — the trunk/scapular/grip muscles that brace but don't drive,
//      keyed off the movement pattern (pressing → rotator cuff + serratus + core;
//      hinging → erectors + grip; …).
//   3. THE ANIMATION — a schematic side-profile stick-figure that LOOPS through
//      the rep, so "how it's done" is shown, not just told. The demo-VIDEO
//      library is blocked on a licensed clip catalog (see capabilities), so this
//      procedural animation is the unblocked, offline, zero-asset way to show
//      the movement. Each exercise maps to a movement ARCHETYPE (squat, hinge,
//      press, pull, curl, …); the archetype carries 2-3 skeleton keyframes and
//      the clients ping-pong through them. `skeletonAt()` does the interpolation
//      so web and mobile render the exact same motion.
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

const levelFor = (tier: ActivationTier, pct: number): ActivationLevel =>
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

// ── 3. Movement archetypes (drive stabilizers, cues and the animation) ──────

export type AnimArchetype =
  | "squat"
  | "lunge"
  | "hinge"
  | "hipThrust"
  | "pressH"
  | "pressV"
  | "dip"
  | "pullH"
  | "pullV"
  | "curl"
  | "extension"
  | "raise"
  | "calf"
  | "plank"
  | "crunch"
  | "hangingLeg"
  | "twist"
  | "jump"
  | "carry"
  | "olympic"
  | "generic";

const has = (name: string, ...needles: string[]): boolean => {
  const l = name.toLowerCase();
  return needles.some((n) => l.includes(n));
};

/** Which movement archetype a lift animates as — pattern-first, refined by
 *  category/name so a curl, a lateral raise and a triceps pushdown (all
 *  "isolation") each get the right motion. */
export function exerciseArchetype(e: GymExercise): AnimArchetype {
  const n = e.name;
  switch (e.pattern) {
    case "squat":
      return "squat";
    case "lunge":
      return "lunge";
    case "hinge":
      return has(n, "hip thrust", "glute bridge") ? "hipThrust" : "hinge";
    case "push-h":
      return "pressH";
    case "push-v":
      return has(n, "dip") ? "dip" : "pressV";
    case "pull-h":
      return "pullH";
    case "pull-v":
      return has(n, "upright row") ? "raise" : "pullV";
    case "olympic":
      return "olympic";
    case "carry":
      return "carry";
    case "plyo":
      return has(n, "slam", "ball", "rope") ? "twist" : "jump";
    case "core":
      if (has(n, "plank", "hold", "dead bug", "bird dog", "l-sit", "rollout", "bear crawl", "get-up")) return "plank";
      if (has(n, "twist", "pallof", "wood")) return "twist";
      if (has(n, "hanging", "toes-to-bar", "knee raise", "leg raise")) return "hangingLeg";
      return "crunch";
    case "isolation":
      if (e.category === "Calves" || has(n, "calf")) return "calf";
      if (e.category === "Biceps" || has(n, "curl")) return "curl";
      if (e.category === "Triceps" || has(n, "pushdown", "extension", "kickback", "skull", "jm")) return "extension";
      if (has(n, "raise", "fly", "face pull", "delt", "upright")) return "raise";
      if (e.category === "Abs & Core") return "crunch";
      return "curl";
  }
}

// ── 4. Stabilizers + cues + emphasis note, per archetype ────────────────────

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

// ── 5. The animation skeleton ───────────────────────────────────────────────

export interface Pt {
  x: number;
  y: number;
}

/** A side-profile stick-figure pose in a 0-100 box (x → right, y → down,
 *  ground ≈ 94). The figure faces right; `bar` is where the implement sits. */
export interface Skeleton {
  head: Pt;
  shoulder: Pt;
  elbow: Pt;
  hand: Pt;
  hip: Pt;
  knee: Pt;
  ankle: Pt;
  bar: Pt;
}

/** How the implement is drawn at `bar`. */
export type LoadGlyph = "barbell" | "dumbbell" | "kettlebell" | "bodyweight" | "fixed";

const p = (x: number, y: number): Pt => ({ x, y });
const S = (
  head: Pt, shoulder: Pt, elbow: Pt, hand: Pt, hip: Pt, knee: Pt, ankle: Pt, bar: Pt,
): Skeleton => ({ head, shoulder, elbow, hand, hip, knee, ankle, bar });

// Two (or three) keyframes per archetype; the clients ping-pong through them so
// the rep loops start → end → start. Hand-tuned schematic geometry — reads as
// the movement, not an anatomy render.
const KEYFRAMES: Record<AnimArchetype, Skeleton[]> = {
  squat: [
    S(p(50, 14), p(50, 29), p(42, 37), p(46, 30), p(50, 52), p(50, 73), p(50, 93), p(46, 29)),
    S(p(57, 31), p(53, 42), p(45, 50), p(48, 43), p(43, 64), p(60, 74), p(50, 93), p(49, 43)),
  ],
  lunge: [
    S(p(50, 13), p(50, 28), p(50, 40), p(50, 52), p(50, 50), p(52, 70), p(52, 92), p(50, 53)),
    S(p(50, 25), p(50, 40), p(50, 52), p(50, 64), p(50, 62), p(58, 74), p(52, 92), p(50, 65)),
  ],
  hinge: [
    S(p(50, 14), p(50, 29), p(52, 41), p(53, 54), p(50, 52), p(50, 73), p(50, 92), p(53, 55)),
    S(p(64, 30), p(58, 36), p(58, 52), p(57, 66), p(42, 55), p(52, 73), p(50, 92), p(57, 68)),
  ],
  hipThrust: [
    S(p(24, 50), p(30, 54), p(34, 62), p(38, 68), p(50, 70), p(66, 66), p(70, 86), p(50, 66)),
    S(p(24, 50), p(30, 54), p(34, 60), p(38, 64), p(50, 56), p(66, 62), p(70, 86), p(50, 52)),
  ],
  pressH: [
    S(p(26, 56), p(38, 58), p(40, 50), p(39, 46), p(66, 60), p(78, 70), p(86, 86), p(39, 44)),
    S(p(26, 56), p(38, 58), p(38, 46), p(38, 34), p(66, 60), p(78, 70), p(86, 86), p(38, 32)),
  ],
  pressV: [
    S(p(50, 15), p(50, 29), p(56, 38), p(52, 26), p(50, 52), p(50, 73), p(50, 92), p(50, 25)),
    S(p(49, 16), p(50, 28), p(51, 18), p(50, 8), p(50, 52), p(50, 73), p(50, 92), p(50, 6)),
  ],
  dip: [
    S(p(50, 18), p(50, 30), p(52, 42), p(52, 44), p(52, 54), p(54, 72), p(54, 90), p(52, 44)),
    S(p(52, 30), p(50, 42), p(58, 48), p(52, 44), p(52, 62), p(54, 78), p(54, 92), p(52, 44)),
  ],
  pullH: [
    S(p(64, 32), p(58, 38), p(60, 50), p(60, 64), p(42, 56), p(52, 72), p(50, 92), p(60, 66)),
    S(p(64, 32), p(58, 38), p(52, 44), p(56, 50), p(42, 56), p(52, 72), p(50, 92), p(56, 52)),
  ],
  pullV: [
    S(p(53, 26), p(50, 36), p(50, 25), p(50, 10), p(50, 58), p(50, 76), p(50, 90), p(50, 8)),
    S(p(53, 16), p(50, 26), p(50, 16), p(50, 10), p(50, 48), p(50, 66), p(50, 80), p(50, 8)),
  ],
  curl: [
    S(p(50, 14), p(50, 28), p(52, 42), p(54, 55), p(50, 53), p(50, 73), p(50, 92), p(54, 56)),
    S(p(50, 14), p(50, 28), p(52, 42), p(50, 33), p(50, 53), p(50, 73), p(50, 92), p(50, 32)),
  ],
  extension: [
    S(p(50, 14), p(50, 28), p(52, 42), p(52, 33), p(50, 53), p(50, 73), p(50, 92), p(52, 32)),
    S(p(50, 14), p(50, 28), p(52, 42), p(53, 54), p(50, 53), p(50, 73), p(50, 92), p(53, 55)),
  ],
  raise: [
    S(p(50, 14), p(50, 28), p(52, 40), p(53, 52), p(50, 53), p(50, 73), p(50, 92), p(53, 53)),
    S(p(50, 14), p(50, 28), p(58, 30), p(66, 28), p(50, 53), p(50, 73), p(50, 92), p(66, 28)),
  ],
  calf: [
    S(p(50, 15), p(50, 30), p(50, 42), p(50, 54), p(50, 54), p(50, 74), p(50, 92), p(50, 54)),
    S(p(50, 11), p(50, 26), p(50, 38), p(50, 50), p(50, 50), p(50, 70), p(50, 88), p(50, 50)),
  ],
  plank: [
    S(p(20, 54), p(30, 56), p(30, 62), p(24, 66), p(58, 60), p(74, 64), p(88, 68), p(24, 66)),
    S(p(20, 55), p(30, 57), p(30, 63), p(24, 67), p(58, 61), p(74, 65), p(88, 69), p(24, 67)),
  ],
  crunch: [
    S(p(22, 60), p(32, 62), p(30, 56), p(26, 52), p(64, 64), p(74, 54), p(80, 66), p(26, 52)),
    S(p(34, 52), p(40, 56), p(36, 50), p(32, 46), p(64, 64), p(74, 54), p(80, 66), p(32, 46)),
  ],
  hangingLeg: [
    S(p(50, 20), p(50, 30), p(50, 20), p(50, 10), p(50, 52), p(50, 70), p(50, 88), p(50, 8)),
    S(p(50, 20), p(50, 30), p(50, 20), p(50, 10), p(50, 50), p(64, 44), p(70, 34), p(50, 8)),
  ],
  twist: [
    S(p(50, 22), p(50, 34), p(54, 42), p(60, 46), p(50, 58), p(48, 74), p(48, 92), p(60, 46)),
    S(p(50, 22), p(50, 34), p(46, 42), p(40, 46), p(50, 58), p(52, 74), p(52, 92), p(40, 46)),
  ],
  jump: [
    S(p(50, 14), p(50, 28), p(44, 40), p(40, 48), p(50, 52), p(50, 73), p(50, 92), p(40, 48)),
    S(p(54, 26), p(52, 36), p(42, 48), p(36, 56), p(44, 58), p(58, 72), p(50, 92), p(36, 56)),
    S(p(50, 8), p(50, 22), p(52, 14), p(54, 6), p(50, 46), p(50, 64), p(50, 82), p(54, 6)),
  ],
  carry: [
    S(p(50, 14), p(50, 29), p(50, 42), p(50, 55), p(50, 53), p(54, 72), p(56, 92), p(50, 56)),
    S(p(50, 14), p(50, 29), p(50, 42), p(50, 55), p(50, 53), p(46, 72), p(44, 92), p(50, 56)),
  ],
  olympic: [
    S(p(62, 30), p(56, 36), p(58, 52), p(57, 70), p(44, 58), p(56, 70), p(50, 90), p(57, 72)),
    S(p(50, 12), p(50, 26), p(52, 38), p(53, 50), p(50, 50), p(50, 70), p(50, 88), p(53, 50)),
    S(p(49, 16), p(50, 28), p(51, 17), p(50, 7), p(50, 52), p(52, 64), p(50, 90), p(50, 6)),
  ],
  generic: [
    S(p(50, 14), p(50, 29), p(50, 42), p(50, 54), p(50, 52), p(50, 73), p(50, 92), p(50, 55)),
    S(p(50, 16), p(50, 31), p(50, 44), p(50, 56), p(50, 54), p(50, 74), p(50, 93), p(50, 57)),
  ],
};

const LOAD_GLYPH = (e: GymExercise): LoadGlyph => {
  switch (e.equipment) {
    case "barbell":
    case "ez-bar":
    case "trap-bar":
    case "smith":
    case "landmine":
      return "barbell";
    case "dumbbell":
      return "dumbbell";
    case "kettlebell":
      return "kettlebell";
    case "bodyweight":
      return "bodyweight";
    case "cable":
    case "machine":
    case "band":
      return "fixed";
    default:
      return "barbell";
  }
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const lerpPt = (a: Pt, b: Pt, t: number): Pt => p(lerp(a.x, b.x, t), lerp(a.y, b.y, t));
const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/**
 * The skeleton at cycle phase `phase` ∈ [0, 1). The phase is mapped to a
 * triangle wave so the rep goes start → end → start on a loop (for a 3-keyframe
 * archetype: start → mid → end → mid → start). Eased so it holds briefly at the
 * turnarounds like a real rep. Pure — both clients feed a time-driven phase and
 * render the returned points identically.
 */
export function skeletonAt(frames: Skeleton[], phase: number): Skeleton {
  if (frames.length === 1) return frames[0]!;
  const tri = phase < 0.5 ? phase * 2 : (1 - phase) * 2; // 0→1→0
  const u = easeInOut(Math.max(0, Math.min(1, tri)));
  const segs = frames.length - 1;
  const scaled = u * segs;
  const i = Math.min(segs - 1, Math.floor(scaled));
  const t = scaled - i;
  const a = frames[i]!, b = frames[i + 1]!;
  return S(
    lerpPt(a.head, b.head, t),
    lerpPt(a.shoulder, b.shoulder, t),
    lerpPt(a.elbow, b.elbow, t),
    lerpPt(a.hand, b.hand, t),
    lerpPt(a.hip, b.hip, t),
    lerpPt(a.knee, b.knee, t),
    lerpPt(a.ankle, b.ankle, t),
    lerpPt(a.bar, b.bar, t),
  );
}

export interface ExerciseAnimation {
  archetype: AnimArchetype;
  frames: Skeleton[];
  load: LoadGlyph;
  /** milliseconds for one full rep loop. */
  cycleMs: number;
}

/** Cardio/plyo reps are quicker; grinding barbell reps are slower. */
const cycleMsFor = (a: AnimArchetype): number =>
  a === "jump" || a === "twist" || a === "carry" ? 1600 : a === "olympic" ? 2600 : a === "plank" ? 3200 : 2200;

// ── 6. The public resolver ──────────────────────────────────────────────────

export interface ExerciseAnatomy {
  name: string;
  category: string;
  equipment: string;
  mechanics: "compound" | "isolation";
  /** ranked muscle activation, primary first, %s summing to 100. */
  activation: MuscleActivation[];
  primary: MuscleActivation[];
  secondary: MuscleActivation[];
  stabilizers: string[];
  cues: string[];
  emphasis: string;
  animation: ExerciseAnimation;
}

/** The full anatomy model for a gym lift, or null for a name the DB doesn't
 *  know (custom lifts, cardio sports — those pages skip the anatomy block). */
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
    activation,
    primary: activation.filter((a) => a.tier === "primary"),
    secondary: activation.filter((a) => a.tier === "secondary"),
    stabilizers: info.stabilizers,
    cues: info.cues,
    emphasis: info.emphasis,
    animation: { archetype, frames: KEYFRAMES[archetype], load: LOAD_GLYPH(e), cycleMs: cycleMsFor(archetype) },
  };
}
