/**
 * @hybrid/core — plans data + pure logic.
 *
 * Ported verbatim from the React prototype (reference/HybridApp.jsx).
 * No React/JSX here — data and helpers only.
 */

// Brand color constants used by the goal tree (hex literals).
const VIOLET = "#c9a9f0";
const LIME = "#c4f035";
const BLUE = "#7fd4e8";
const AMBER = "#f0b45e";

// ============================================================
//  Types
// ============================================================

export interface GoalPlan {
  id: string;
  name: string;
  weeks: number;
  sessions: number;
  tag: string;
  desc: string;
  focus: string[];
  hot?: boolean;
}

/** Broad family a goal belongs to — used to group goals in the UI. */
export type GoalCategory = "Strength" | "Physique" | "Endurance" | "Functional & Sport" | "Health";

/** Display order for goal categories. */
export const GOAL_CATEGORIES: GoalCategory[] = [
  "Strength",
  "Physique",
  "Endurance",
  "Functional & Sport",
  "Health",
];

export interface GoalNode {
  id: string;
  name: string;
  icon: string;
  color: string;
  blurb: string;
  category: GoalCategory;
  plans: GoalPlan[];
}

export interface PlanSampleItem {
  name: string;
  sr: string;
  rest: string;
  rpe: string;
}

export interface PlanSample {
  day: string;
  items: PlanSampleItem[];
}

export interface PlanDetail {
  level: string;
  forWho: string;
  outcome: string;
  sessionLength: string;
  equipment: string;
  split: string[];
  /** Every training day in the plan, each fully spec'd. */
  days: PlanSample[];
  progression: string;
}

// ============================================================
//  GOAL TREE — choose a goal, then see the plans built for it.
// ============================================================

// NOTE: the demo placeholder plans have been removed. The goals below are kept;
// real plans will be uploaded per goal. Each goal's `plans` array is intentionally
// empty until then.
export const GOAL_TREE: GoalNode[] = [
  // ---- Strength ----
  { id: "power", name: "Powerlifting", icon: "▬", color: VIOLET, category: "Strength", blurb: "One goal: a bigger squat, bench, and deadlift total.",
    plans: [
      { id: "pl-4day", name: "4-Day Intermediate", weeks: 12, sessions: 4, tag: "4 Days", desc: "The sweet spot for most lifters. A heavy day for each lift plus a volume day — top sets at RPE 8 with percentage back-offs.", focus: ["Strength", "Power"], hot: true },
      { id: "pl-3day", name: "3-Day Beginner", weeks: 8, sessions: 3, tag: "Full Body", desc: "Squat, bench, and deadlift every week with percentage-based main work and supporting accessories. The simplest way to start building your total.", focus: ["Strength"] },
      { id: "pl-5day", name: "5-Day Powerbuilding", weeks: 12, sessions: 5, tag: "Powerbuilding", desc: "Three heavy main-lift days, a volume day, and a dedicated upper-body day. Maximal strength with the muscle to back it up.", focus: ["Strength", "Hypertrophy"], hot: true },
    ] },
  { id: "oly", name: "Olympic Weightlifting", icon: "◢", color: AMBER, category: "Strength", blurb: "Snatch and clean & jerk. Explosive power, mobility, and technical precision.",
    plans: [] },
  { id: "strongman", name: "Strongman", icon: "◤", color: VIOLET, category: "Strength", blurb: "Carry, press, and pull heavy odd objects. Raw, full-body, real-world strength.",
    plans: [] },
  // ---- Physique ----
  { id: "bb", name: "Bodybuilding", icon: "■", color: VIOLET, category: "Physique", blurb: "Maximize muscle. Train splits, chase volume and progressive overload.",
    plans: [
      { id: "bb-fb4", name: "4-Day Full Body", weeks: 12, sessions: 4, tag: "Full Body", desc: "The recommended pick. Two strength days, two hypertrophy days, every muscle hit 4×/week.", focus: ["Strength", "Hypertrophy"], hot: true },
      { id: "bb-fb3", name: "3-Day Full Body", weeks: 8, sessions: 3, tag: "Full Body", desc: "Hit everything three times a week. The most time-efficient way to grow on a busy schedule.", focus: ["Hypertrophy"] },
      { id: "bb-ul4", name: "4-Day Upper / Lower", weeks: 10, sessions: 4, tag: "Upper/Lower", desc: "The classic 4-day split — each half of the body trained twice, balancing strength and volume.", focus: ["Strength", "Hypertrophy"] },
      { id: "bb-ul3", name: "3-Day Upper / Lower", weeks: 8, sessions: 3, tag: "Upper/Lower", desc: "Upper / Lower / Upper rotation. Full coverage in three sessions with built-in recovery.", focus: ["Hypertrophy"] },
      { id: "bb-ppl3", name: "3-Day Push Pull Legs", weeks: 8, sessions: 3, tag: "PPL", desc: "Push, pull, legs — the timeless split. Clean movement grouping, easy to recover from.", focus: ["Hypertrophy"] },
      { id: "bb-split5", name: "5-Day Bodybuilding Split", weeks: 8, sessions: 5, tag: "Bro Split", desc: "One muscle group per day. Maximum volume and focus for the dedicated lifter.", focus: ["Hypertrophy"], hot: true },
    ] },
  { id: "fatloss", name: "Fat Loss", icon: "◐", color: AMBER, category: "Physique", blurb: "Drop fat and keep the muscle. Train hard, recover smart, recomp the right way.",
    plans: [] },
  // ---- Endurance ----
  { id: "tri", name: "Triathlon", icon: "◆", color: BLUE, category: "Endurance", blurb: "Swim-bike-run endurance. Strength work that supports, not sabotages.",
    plans: [] },
  { id: "run", name: "Running", icon: "▶", color: BLUE, category: "Endurance", blurb: "Get faster over 5k, 10k, half or full. Build the aerobic engine and durable legs.",
    plans: [] },
  { id: "cycling", name: "Cycling", icon: "◉", color: LIME, category: "Endurance", blurb: "More power on the bike — road, gravel, or indoor. Strength that drives the pedal stroke.",
    plans: [] },
  { id: "swim", name: "Swimming", icon: "◑", color: BLUE, category: "Endurance", blurb: "Faster in the water — dryland strength, mobility, and shoulder durability.",
    plans: [] },
  // ---- Functional & Sport ----
  { id: "hyrox", name: "Hyrox", icon: "●", color: LIME, category: "Functional & Sport", blurb: "Race the 8-station functional fitness event. Compromised running is everything.",
    plans: [] },
  { id: "crossfit", name: "CrossFit", icon: "✚", color: AMBER, category: "Functional & Sport", blurb: "Constantly varied, high-intensity functional fitness. Be ready for anything.",
    plans: [] },
  { id: "hybrid", name: "Hybrid Athlete", icon: "▲", color: LIME, category: "Functional & Sport", blurb: "Lift heavy and train your sport. Strength that carries over to running, combat, court, or crag.",
    plans: [] },
  { id: "calisthenics", name: "Calisthenics", icon: "◯", color: LIME, category: "Functional & Sport", blurb: "Master your bodyweight — pull-ups, dips, levers, and the big skills.",
    plans: [] },
  { id: "kettlebell", name: "Kettlebell", icon: "◔", color: AMBER, category: "Functional & Sport", blurb: "Swing, snatch, and get-up. One tool, full-body strength and conditioning.",
    plans: [] },
  { id: "tactical", name: "Tactical & Military", icon: "◣", color: VIOLET, category: "Functional & Sport", blurb: "Ruck, carry, and work capacity under load. Built to pass the test and do the job.",
    plans: [] },
  { id: "sport", name: "Sport Performance", icon: "★", color: VIOLET, category: "Functional & Sport", blurb: "Speed, power, and agility for field- and court-sport athletes.",
    plans: [] },
  // ---- Health ----
  { id: "fitness", name: "General Fitness", icon: "✦", color: BLUE, category: "Health", blurb: "Look, feel, and move better. Balanced strength, conditioning, and lasting health.",
    plans: [] },
  { id: "mobility", name: "Mobility & Longevity", icon: "◇", color: BLUE, category: "Health", blurb: "Move freely and stay durable for decades. Mobility, stability, and prehab.",
    plans: [] },
  { id: "prenatal", name: "Pre & Postnatal", icon: "◍", color: LIME, category: "Health", blurb: "Train safely and strong through pregnancy and the return after.",
    plans: [] },
];

// flat list still used by the landing carousel (top plan per goal).
// Skips goals that have no plans yet.
export const PLANS: (GoalPlan & { color: string })[] = GOAL_TREE.flatMap((g) =>
  g.plans[0] ? [{ ...g.plans[0], color: g.color }] : [],
);

/** The named library plans for a goal (matched by GoalNode name, e.g.
 *  "Bodybuilding"). Empty when that goal has no uploaded plans yet (most don't
 *  — see the `plans-lib` capability). Powers the coach's named-plan picker. */
export function plansForGoal(goalName: string): GoalPlan[] {
  return GOAL_TREE.find((g) => g.name === goalName)?.plans ?? [];
}

export interface GoalGroup {
  category: GoalCategory;
  goals: GoalNode[];
}

/** GOAL_TREE grouped by category, in display order (empty groups dropped). */
export const GOAL_GROUPS: GoalGroup[] = GOAL_CATEGORIES.map((category) => ({
  category,
  goals: GOAL_TREE.filter((g) => g.category === category),
})).filter((group) => group.goals.length > 0);

// ============================================================
//  PLAN DETAIL — every plan gets a full workout summary:
//  level, who it's for, outcome, duration/frequency, split,
//  a fully-spec'd sample session, progression, equipment.
// ============================================================

export const PLAN_DETAIL: Record<string, PlanDetail> = {
  // ---- Powerlifting ----
  // Intensity column carries the program's prescription: a % of 1RM where the
  // main work is percentage-based, an RPE target where it's RPE-based, "—" where
  // the lift is taken to a hard but unprescribed effort (accessories, AMRAP).
  "pl-3day": {
    level: "Beginner",
    forWho: "New-to-intermediate lifters training 3 days/week who want a simple, percentage-based squat/bench/deadlift base.",
    outcome: "A bigger squat, bench, and deadlift total — each competition lift trained weekly with accessory work to fill the gaps.",
    sessionLength: "60–75 min",
    equipment: "Full gym (barbell, power rack, bench, dumbbells, cables)",
    split: ["Day 1", "Rest", "Day 2", "Rest", "Day 3", "Rest", "Rest"],
    days: [
      { day: "Day 1 — Squat + Bench", items: [
        { name: "Competition Squat", sr: "5 × 5", rest: "3:00", rpe: "75%" },
        { name: "Competition Bench", sr: "5 × 5", rest: "3:00", rpe: "75%" },
        { name: "Romanian Deadlift", sr: "3 × 8", rest: "2:30", rpe: "8" },
        { name: "Chest Supported Row", sr: "4 × 10", rest: "2:00", rpe: "8" },
        { name: "Walking Lunge", sr: "3 × 12 / leg", rest: "2:00", rpe: "8" },
        { name: "Plank", sr: "3 × 60 sec", rest: "1:00", rpe: "—" },
      ] },
      { day: "Day 2 — Deadlift", items: [
        { name: "Competition Deadlift", sr: "5 × 3", rest: "3:00", rpe: "80%" },
        { name: "Pause Squat", sr: "3 × 5", rest: "3:00", rpe: "8" },
        { name: "Overhead Press", sr: "4 × 6", rest: "2:30", rpe: "8" },
        { name: "Pull-Up", sr: "4 × AMRAP", rest: "2:00", rpe: "—" },
        { name: "Hamstring Curl", sr: "3 × 12", rest: "1:30", rpe: "9" },
        { name: "Hanging Leg Raise", sr: "3 × 15", rest: "1:00", rpe: "9" },
      ] },
      { day: "Day 3 — Bench Focus", items: [
        { name: "Competition Bench", sr: "6 × 4", rest: "3:00", rpe: "77%" },
        { name: "Close-Grip Bench", sr: "4 × 6", rest: "2:30", rpe: "8" },
        { name: "Barbell Row", sr: "4 × 8", rest: "2:00", rpe: "8" },
        { name: "Incline Dumbbell Press", sr: "3 × 10", rest: "2:00", rpe: "8" },
        { name: "Face Pull", sr: "4 × 15", rest: "1:00", rpe: "9" },
        { name: "Cable Crunch", sr: "3 × 15", rest: "1:00", rpe: "9" },
      ] },
    ],
    progression: "Warm up every session: 5 min cardio + hip/arm circles + bodyweight squats, then ramp the first main lift (empty bar ×10, 40% ×5, 55% ×5, 70% ×3) before the work sets. Percentages are off your current 1RM — add a small load each week when you hit every prescribed rep. Deload every 6th week: cut volume ~50% and intensity 10–15% (e.g. 3 × 5 @ 60–65% in place of 5 × 5 @ 75%).",
  },
  "pl-4day": {
    level: "Intermediate",
    forWho: "Lifters with a year-plus under the bar who can train 4 days/week — the recommended pick for most powerlifters.",
    outcome: "Maximal squat, bench, and deadlift strength from a heavy day per lift plus a dedicated volume day, balancing intensity and tonnage.",
    sessionLength: "75–90 min",
    equipment: "Full gym (barbell, power rack, bench, dumbbells, cables, machines)",
    split: ["Day 1", "Day 2", "Rest", "Day 3", "Day 4", "Rest", "Rest"],
    days: [
      { day: "Day 1 — Heavy Squat", items: [
        { name: "Competition Squat — Top Set", sr: "1 × 5", rest: "3:00", rpe: "8" },
        { name: "Competition Squat — Back-Off", sr: "4 × 5", rest: "3:00", rpe: "75%" },
        { name: "Paused Squat", sr: "3 × 4", rest: "2:30", rpe: "8" },
        { name: "Leg Press", sr: "3 × 12", rest: "2:00", rpe: "8" },
        { name: "Leg Curl", sr: "4 × 12", rest: "1:30", rpe: "9" },
        { name: "Calf Raise", sr: "4 × 15", rest: "1:00", rpe: "9" },
        { name: "Weighted Plank", sr: "3 × 60 sec", rest: "1:00", rpe: "—" },
      ] },
      { day: "Day 2 — Heavy Bench", items: [
        { name: "Competition Bench — Top Set", sr: "1 × 5", rest: "3:00", rpe: "8" },
        { name: "Competition Bench — Back-Off", sr: "5 × 5", rest: "3:00", rpe: "7" },
        { name: "Close-Grip Bench", sr: "4 × 6", rest: "2:30", rpe: "8" },
        { name: "Chest Supported Row", sr: "4 × 10", rest: "2:00", rpe: "8" },
        { name: "Lat Pulldown", sr: "4 × 12", rest: "2:00", rpe: "8" },
        { name: "Triceps Pushdown", sr: "4 × 12", rest: "1:30", rpe: "9" },
        { name: "Lateral Raise", sr: "4 × 15", rest: "1:00", rpe: "9" },
      ] },
      { day: "Day 3 — Heavy Deadlift", items: [
        { name: "Competition Deadlift — Top Set", sr: "1 × 3", rest: "3:00", rpe: "8" },
        { name: "Competition Deadlift — Back-Off", sr: "4 × 3", rest: "3:00", rpe: "80%" },
        { name: "Front Squat", sr: "4 × 5", rest: "2:30", rpe: "8" },
        { name: "Romanian Deadlift", sr: "3 × 8", rest: "2:00", rpe: "8" },
        { name: "Pull-Up", sr: "4 × AMRAP", rest: "2:00", rpe: "—" },
        { name: "Hanging Leg Raise", sr: "4 × 12", rest: "1:00", rpe: "9" },
      ] },
      { day: "Day 4 — Volume Bench + Squat", items: [
        { name: "Bench Press", sr: "6 × 6", rest: "2:30", rpe: "70%" },
        { name: "Back Squat", sr: "5 × 5", rest: "3:00", rpe: "70%" },
        { name: "Incline Dumbbell Bench", sr: "3 × 10", rest: "2:00", rpe: "8" },
        { name: "Row Variation", sr: "4 × 10", rest: "2:00", rpe: "8" },
        { name: "Face Pull", sr: "4 × 15", rest: "1:00", rpe: "9" },
        { name: "Biceps Curl", sr: "3 × 12", rest: "1:00", rpe: "9" },
      ] },
    ],
    progression: "Warm up every session: 5 min cardio + hip/arm circles + bodyweight squats, then ramp the first main lift (empty bar ×10, 40% ×5, 55% ×5, 70% ×3) into the work sets. Drive the top set to the prescribed RPE, then load the back-off sets off your 1RM percentage; nudge the top-set load up when RPE 8 starts feeling easy. Deload every 6th week: cut volume ~50% and intensity 10–15%.",
  },
  "pl-5day": {
    level: "Advanced",
    forWho: "Experienced lifters who can recover from 5 sessions/week and want maximal strength with added muscle ('powerbuilding').",
    outcome: "A higher total plus visible size — heavy main-lift work three days a week, a volume day, and a full upper-body day for hypertrophy.",
    sessionLength: "75–105 min",
    equipment: "Full gym (barbell, power rack, bench, dumbbells, cables, machines)",
    split: ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Rest", "Rest"],
    days: [
      { day: "Day 1 — Heavy Squat", items: [
        { name: "Back Squat", sr: "5 × 3", rest: "3:00", rpe: "8" },
        { name: "Pause Squat", sr: "4 × 4", rest: "2:30", rpe: "8" },
        { name: "Leg Press", sr: "4 × 12", rest: "2:00", rpe: "9" },
        { name: "Leg Curl", sr: "4 × 12", rest: "1:30", rpe: "9" },
        { name: "Calf Raise", sr: "5 × 15", rest: "1:00", rpe: "9" },
      ] },
      { day: "Day 2 — Heavy Bench", items: [
        { name: "Bench Press", sr: "5 × 3", rest: "3:00", rpe: "8" },
        { name: "Spoto Press", sr: "4 × 5", rest: "2:30", rpe: "8" },
        { name: "Incline Dumbbell Press", sr: "4 × 10", rest: "2:00", rpe: "8" },
        { name: "Barbell Row", sr: "5 × 10", rest: "2:00", rpe: "8" },
        { name: "Triceps Pushdown", sr: "4 × 12", rest: "1:30", rpe: "9" },
      ] },
      { day: "Day 3 — Heavy Deadlift", items: [
        { name: "Deadlift", sr: "5 × 2", rest: "3:00", rpe: "8" },
        { name: "Deficit Deadlift", sr: "3 × 5", rest: "3:00", rpe: "8" },
        { name: "Front Squat", sr: "4 × 5", rest: "2:30", rpe: "8" },
        { name: "Pull-Up", sr: "5 × AMRAP", rest: "2:00", rpe: "—" },
        { name: "Hanging Leg Raise", sr: "4 × 15", rest: "1:00", rpe: "9" },
      ] },
      { day: "Day 4 — Volume Squat + Bench", items: [
        { name: "Back Squat", sr: "6 × 5", rest: "2:30", rpe: "7" },
        { name: "Bench Press", sr: "6 × 6", rest: "2:30", rpe: "7" },
        { name: "Bulgarian Split Squat", sr: "3 × 10", rest: "2:00", rpe: "8" },
        { name: "Dumbbell Press", sr: "3 × 12", rest: "2:00", rpe: "8" },
        { name: "Face Pull", sr: "4 × 15", rest: "1:00", rpe: "9" },
      ] },
      { day: "Day 5 — Upper Body", items: [
        { name: "Pull-Up", sr: "4 × AMRAP", rest: "2:00", rpe: "—" },
        { name: "Chest Supported Row", sr: "4 × 10", rest: "2:00", rpe: "8" },
        { name: "Lat Pulldown", sr: "3 × 12", rest: "2:00", rpe: "8" },
        { name: "Overhead Press", sr: "4 × 6", rest: "2:30", rpe: "8" },
        { name: "Lateral Raise", sr: "4 × 15", rest: "1:00", rpe: "9" },
        { name: "Barbell Curl", sr: "4 × 10", rest: "1:00", rpe: "9" },
        { name: "Skullcrusher", sr: "4 × 10", rest: "1:00", rpe: "9" },
        { name: "Hanging Leg Raise", sr: "4 × 15", rest: "1:00", rpe: "9" },
      ] },
    ],
    progression: "Warm up every session: 5 min cardio + hip/arm circles + bodyweight squats, then ramp the first main lift (empty bar ×10, 40% ×5, 55% ×5, 70% ×3) into the work sets. Push the heavy main lifts to RPE 8 and add load when all reps move well; keep the volume day around RPE 7 to bank tonnage without burning out. Deload every 6th week: cut volume ~50% and intensity 10–15%.",
  },
  // ---- Bodybuilding ----
  "bb-fb4": {
    level: "Intermediate",
    forWho: "Lifters with 6+ months under the bar who can train 4 days/week and want the best all-round driver of size and strength.",
    outcome: "Strength on the big lifts and visible muscle everywhere — every group trained 4×/week for maximum weekly stimulus.",
    sessionLength: "60–75 min",
    equipment: "Full gym (barbell, dumbbells, cables, machines)",
    split: ["Day 1", "Day 2", "Rest", "Day 3", "Day 4", "Rest", "Rest"],
    days: [
      { day: "Day 1 — Strength", items: [
        { name: "Back Squat", sr: "5 × 5", rest: "3:00", rpe: "8" },
        { name: "Bench Press", sr: "5 × 5", rest: "3:00", rpe: "8" },
        { name: "Weighted Pull-Up", sr: "4 × 8", rest: "2:30", rpe: "8" },
        { name: "Leg Curl", sr: "3 × 15", rest: "1:30", rpe: "9" },
        { name: "Plank", sr: "3 × 60 sec", rest: "1:00", rpe: "—" },
      ] },
      { day: "Day 2 — Hypertrophy", items: [
        { name: "Romanian Deadlift", sr: "4 × 10", rest: "2:00", rpe: "8" },
        { name: "Incline DB Press", sr: "4 × 12", rest: "2:00", rpe: "8" },
        { name: "Cable Row", sr: "4 × 12", rest: "2:00", rpe: "8" },
        { name: "Lateral Raise", sr: "4 × 20", rest: "1:00", rpe: "9" },
        { name: "EZ Curl", sr: "3 × 15", rest: "1:00", rpe: "9" },
        { name: "Rope Pushdown", sr: "3 × 15", rest: "1:00", rpe: "9" },
      ] },
      { day: "Day 3 — Strength", items: [
        { name: "Deadlift", sr: "4 × 5", rest: "3:00", rpe: "8" },
        { name: "Overhead Press", sr: "5 × 5", rest: "3:00", rpe: "8" },
        { name: "Weighted Chin-Up", sr: "4 × 8", rest: "2:30", rpe: "8" },
        { name: "Walking Lunge", sr: "3 × 10", rest: "2:00", rpe: "8" },
        { name: "Hanging Leg Raise", sr: "3 × 15", rest: "1:00", rpe: "9" },
      ] },
      { day: "Day 4 — Hypertrophy", items: [
        { name: "Leg Press", sr: "4 × 15", rest: "2:00", rpe: "9" },
        { name: "Machine Chest Press", sr: "4 × 12", rest: "2:00", rpe: "8" },
        { name: "Seated Row", sr: "4 × 12", rest: "2:00", rpe: "8" },
        { name: "Rear Delt Fly", sr: "4 × 20", rest: "1:00", rpe: "9" },
        { name: "Incline Curl", sr: "3 × 15", rest: "1:00", rpe: "9" },
        { name: "Overhead Triceps Extension", sr: "3 × 15", rest: "1:00", rpe: "9" },
      ] },
    ],
    progression: "Double progression on the hypertrophy days — add reps within the range, then load. On strength days add a small load each week when you hit all reps. Deload every 4th week.",
  },
  "bb-fb3": {
    level: "Beginner–Intermediate",
    forWho: "Anyone training 3 days/week who wants full-body frequency — great for busy schedules or for building a base.",
    outcome: "Balanced size and strength gains hitting every muscle three times a week.",
    sessionLength: "60–75 min",
    equipment: "Full gym (barbell, dumbbells, cables, machines)",
    split: ["Day A", "Rest", "Day B", "Rest", "Day C", "Rest", "Rest"],
    days: [
      { day: "Day A", items: [
        { name: "Back Squat", sr: "4 × 8", rest: "2:30", rpe: "8" },
        { name: "Bench Press", sr: "4 × 8", rest: "2:30", rpe: "8" },
        { name: "Pull-Ups / Lat Pulldown", sr: "4 × 12", rest: "2:00", rpe: "9" },
        { name: "Romanian Deadlift", sr: "3 × 10", rest: "2:00", rpe: "8" },
        { name: "Lateral Raise", sr: "3 × 15", rest: "1:00", rpe: "9" },
        { name: "Cable Crunch", sr: "3 × 15", rest: "1:00", rpe: "9" },
      ] },
      { day: "Day B", items: [
        { name: "Deadlift", sr: "3 × 5", rest: "3:00", rpe: "8" },
        { name: "Incline Dumbbell Press", sr: "4 × 12", rest: "2:00", rpe: "8" },
        { name: "Chest Supported Row", sr: "4 × 12", rest: "2:00", rpe: "8" },
        { name: "Bulgarian Split Squat", sr: "3 × 12", rest: "2:00", rpe: "8" },
        { name: "Face Pull", sr: "3 × 15", rest: "1:00", rpe: "9" },
        { name: "Hanging Leg Raise", sr: "3 × 15", rest: "1:00", rpe: "9" },
      ] },
      { day: "Day C", items: [
        { name: "Front Squat / Leg Press", sr: "4 × 12", rest: "2:30", rpe: "8" },
        { name: "Overhead Press", sr: "4 × 10", rest: "2:00", rpe: "8" },
        { name: "Seated Cable Row", sr: "4 × 12", rest: "2:00", rpe: "8" },
        { name: "Hip Thrust", sr: "3 × 12", rest: "2:00", rpe: "8" },
        { name: "EZ Curl", sr: "3 × 15", rest: "1:00", rpe: "9" },
        { name: "Triceps Pushdown", sr: "3 × 15", rest: "1:00", rpe: "9" },
      ] },
    ],
    progression: "Double progression — add reps within the range, then add load when you reach the top. Rotate the three days through the week; deload every 4th week.",
  },
  "bb-ul4": {
    level: "Intermediate",
    forWho: "Lifters training 4 days/week who want each half of the body trained twice with a clean strength-then-hypertrophy structure.",
    outcome: "Strength on the main lifts plus balanced upper- and lower-body size across two upper and two lower days.",
    sessionLength: "60–75 min",
    equipment: "Full gym (barbell, dumbbells, cables, machines)",
    split: ["Upper A", "Lower A", "Rest", "Upper B", "Lower B", "Rest", "Rest"],
    days: [
      { day: "Upper A", items: [
        { name: "Bench Press", sr: "4 × 8", rest: "2:30", rpe: "8" },
        { name: "Pull-Up", sr: "4 × 10", rest: "2:30", rpe: "8" },
        { name: "Incline Press", sr: "3 × 12", rest: "2:00", rpe: "8" },
        { name: "Cable Row", sr: "3 × 12", rest: "2:00", rpe: "8" },
        { name: "Lateral Raise", sr: "4 × 20", rest: "1:00", rpe: "9" },
        { name: "Pushdown", sr: "3 × 15", rest: "1:00", rpe: "9" },
      ] },
      { day: "Lower A", items: [
        { name: "Squat", sr: "4 × 8", rest: "2:30", rpe: "8" },
        { name: "Romanian Deadlift", sr: "4 × 10", rest: "2:00", rpe: "8" },
        { name: "Leg Curl", sr: "3 × 15", rest: "1:30", rpe: "9" },
        { name: "Calf Raise", sr: "4 × 20", rest: "1:00", rpe: "9" },
      ] },
      { day: "Upper B", items: [
        { name: "Overhead Press", sr: "4 × 8", rest: "2:30", rpe: "8" },
        { name: "Chin-Up", sr: "4 × 10", rest: "2:30", rpe: "8" },
        { name: "Chest Press", sr: "3 × 12", rest: "2:00", rpe: "8" },
        { name: "Seated Row", sr: "3 × 12", rest: "2:00", rpe: "8" },
        { name: "Rear Delt Fly", sr: "4 × 20", rest: "1:00", rpe: "9" },
        { name: "Curl", sr: "3 × 15", rest: "1:00", rpe: "9" },
      ] },
      { day: "Lower B", items: [
        { name: "Deadlift", sr: "3 × 5", rest: "3:00", rpe: "8" },
        { name: "Leg Press", sr: "4 × 15", rest: "2:00", rpe: "9" },
        { name: "Bulgarian Split Squat", sr: "3 × 12", rest: "2:00", rpe: "8" },
        { name: "Leg Extension", sr: "3 × 15", rest: "1:30", rpe: "9" },
        { name: "Hanging Leg Raise", sr: "3 × 15", rest: "1:00", rpe: "9" },
      ] },
    ],
    progression: "Add load on the heavy compounds (5–8 range) as reps allow; double-progress the accessory work. Deload every 4th week.",
  },
  "bb-ul3": {
    level: "Beginner–Intermediate",
    forWho: "Lifters who can train 3 days/week and want upper/lower frequency with a built-in extra upper day.",
    outcome: "Solid all-round hypertrophy with the Upper / Lower / Upper rotation rolling through the week.",
    sessionLength: "60–70 min",
    equipment: "Full gym (barbell, dumbbells, cables, machines)",
    split: ["Upper A", "Rest", "Lower", "Rest", "Upper B", "Rest", "Rest"],
    days: [
      { day: "Upper A", items: [
        { name: "Bench Press", sr: "4 × 8", rest: "2:30", rpe: "8" },
        { name: "Pull-Up", sr: "4 × 10", rest: "2:30", rpe: "8" },
        { name: "Overhead Press", sr: "3 × 10", rest: "2:00", rpe: "8" },
        { name: "Barbell Row", sr: "3 × 12", rest: "2:00", rpe: "8" },
        { name: "Curl", sr: "3 × 15", rest: "1:00", rpe: "9" },
        { name: "Pushdown", sr: "3 × 15", rest: "1:00", rpe: "9" },
      ] },
      { day: "Lower", items: [
        { name: "Squat", sr: "4 × 8", rest: "2:30", rpe: "8" },
        { name: "Romanian Deadlift", sr: "4 × 10", rest: "2:00", rpe: "8" },
        { name: "Leg Press", sr: "3 × 15", rest: "2:00", rpe: "9" },
        { name: "Leg Curl", sr: "3 × 15", rest: "1:30", rpe: "9" },
        { name: "Calf Raise", sr: "4 × 20", rest: "1:00", rpe: "9" },
      ] },
      { day: "Upper B", items: [
        { name: "Incline Press", sr: "4 × 12", rest: "2:00", rpe: "8" },
        { name: "Chin-Up", sr: "4 × 10", rest: "2:30", rpe: "8" },
        { name: "DB Shoulder Press", sr: "3 × 12", rest: "2:00", rpe: "8" },
        { name: "Cable Row", sr: "3 × 12", rest: "2:00", rpe: "8" },
        { name: "Curl", sr: "3 × 15", rest: "1:00", rpe: "9" },
        { name: "Skullcrusher", sr: "3 × 15", rest: "1:00", rpe: "9" },
      ] },
    ],
    progression: "Double progression across the board; alternate which upper day leads the week if you train on fixed days. Deload every 4th week.",
  },
  "bb-ppl3": {
    level: "Beginner–Intermediate",
    forWho: "Lifters training 3 days/week who like grouping movements by pattern — push, pull, then legs.",
    outcome: "Balanced hypertrophy with clean movement grouping and easy recovery between sessions.",
    sessionLength: "60–70 min",
    equipment: "Full gym (barbell, dumbbells, cables, machines)",
    split: ["Push", "Rest", "Pull", "Rest", "Legs", "Rest", "Rest"],
    days: [
      { day: "Push", items: [
        { name: "Bench Press", sr: "4 × 8", rest: "2:30", rpe: "8" },
        { name: "Incline DB Press", sr: "4 × 12", rest: "2:00", rpe: "8" },
        { name: "Overhead Press", sr: "3 × 10", rest: "2:00", rpe: "8" },
        { name: "Lateral Raise", sr: "4 × 20", rest: "1:00", rpe: "9" },
        { name: "Rope Pushdown", sr: "3 × 15", rest: "1:00", rpe: "9" },
      ] },
      { day: "Pull", items: [
        { name: "Pull-Up", sr: "4 × 10", rest: "2:30", rpe: "8" },
        { name: "Barbell Row", sr: "4 × 10", rest: "2:00", rpe: "8" },
        { name: "Lat Pulldown", sr: "3 × 12", rest: "2:00", rpe: "8" },
        { name: "Face Pull", sr: "4 × 20", rest: "1:00", rpe: "9" },
        { name: "EZ Curl", sr: "3 × 15", rest: "1:00", rpe: "9" },
        { name: "Hammer Curl", sr: "3 × 15", rest: "1:00", rpe: "9" },
      ] },
      { day: "Legs", items: [
        { name: "Back Squat", sr: "4 × 8", rest: "2:30", rpe: "8" },
        { name: "Romanian Deadlift", sr: "4 × 10", rest: "2:00", rpe: "8" },
        { name: "Leg Press", sr: "3 × 15", rest: "2:00", rpe: "9" },
        { name: "Leg Curl", sr: "3 × 15", rest: "1:30", rpe: "9" },
        { name: "Standing Calf Raise", sr: "4 × 20", rest: "1:00", rpe: "9" },
      ] },
    ],
    progression: "Double progression — add reps then load. Run twice through the week (6 days) once recovery allows. Deload every 4th week.",
  },
  "bb-split5": {
    level: "Intermediate–Advanced",
    forWho: "Dedicated lifters who can train 5 days/week and want maximum volume and focus on one muscle group per session.",
    outcome: "High-volume hypertrophy with each muscle given a full session — hits the weekly volume targets for advanced growth.",
    sessionLength: "60–75 min",
    equipment: "Full gym (barbell, dumbbells, cables, machines)",
    split: ["Chest", "Back", "Legs", "Shoulders", "Arms", "Rest", "Rest"],
    days: [
      { day: "Chest", items: [
        { name: "Bench Press", sr: "4 × 8", rest: "2:30", rpe: "8" },
        { name: "Incline DB Press", sr: "4 × 12", rest: "2:00", rpe: "8" },
        { name: "Machine Chest Press", sr: "3 × 15", rest: "1:30", rpe: "9" },
        { name: "Cable Fly", sr: "3 × 15", rest: "1:00", rpe: "9" },
      ] },
      { day: "Back", items: [
        { name: "Pull-Up", sr: "4 × 10", rest: "2:30", rpe: "8" },
        { name: "Barbell Row", sr: "4 × 10", rest: "2:00", rpe: "8" },
        { name: "Lat Pulldown", sr: "3 × 12", rest: "2:00", rpe: "8" },
        { name: "Seated Row", sr: "3 × 12", rest: "2:00", rpe: "8" },
      ] },
      { day: "Legs", items: [
        { name: "Squat", sr: "4 × 8", rest: "2:30", rpe: "8" },
        { name: "Romanian Deadlift", sr: "4 × 10", rest: "2:00", rpe: "8" },
        { name: "Leg Press", sr: "3 × 15", rest: "2:00", rpe: "9" },
        { name: "Leg Curl", sr: "3 × 15", rest: "1:30", rpe: "9" },
        { name: "Calf Raise", sr: "4 × 20", rest: "1:00", rpe: "9" },
      ] },
      { day: "Shoulders", items: [
        { name: "Overhead Press", sr: "4 × 10", rest: "2:00", rpe: "8" },
        { name: "Lateral Raise", sr: "4 × 20", rest: "1:00", rpe: "9" },
        { name: "Rear Delt Fly", sr: "4 × 20", rest: "1:00", rpe: "9" },
        { name: "Cable Y-Raise", sr: "3 × 15", rest: "1:00", rpe: "9" },
      ] },
      { day: "Arms", items: [
        { name: "EZ Curl", sr: "4 × 12", rest: "1:30", rpe: "9" },
        { name: "Incline Curl", sr: "3 × 15", rest: "1:00", rpe: "9" },
        { name: "Hammer Curl", sr: "3 × 15", rest: "1:00", rpe: "9" },
        { name: "Skullcrusher", sr: "4 × 12", rest: "1:30", rpe: "9" },
        { name: "Rope Pushdown", sr: "3 × 15", rest: "1:00", rpe: "9" },
        { name: "Overhead Extension", sr: "3 × 15", rest: "1:00", rpe: "9" },
      ] },
    ],
    progression: "Double progression on every exercise. Aim for the intermediate weekly-volume targets — chest 12–18, back 14–22, quads 10–18, hamstrings 8–16, shoulders 12–20, biceps 8–15, triceps 8–15 sets. Deload every 4th–6th week.",
  },
};

// resolve a plan id to its full detail, filling any gaps with sane defaults
export function planDetail(id: string, _plan?: unknown): PlanDetail {
  const d = PLAN_DETAIL[id] || ({} as Partial<PlanDetail>);
  return {
    level: d.level || "All levels",
    forWho: d.forWho || "Suitable for most trainees at the stated level.",
    outcome: d.outcome || "Consistent progress toward your goal.",
    sessionLength: d.sessionLength || "60 min",
    equipment: d.equipment || "Basic gym",
    split: d.split || ["Train", "Rest", "Train", "Rest", "Train", "Rest", "Rest"],
    days: Array.isArray(d.days) && d.days.length ? d.days : [{ day: "Sample day", items: [{ name: "—", sr: "—", rest: "—", rpe: "—" }] }],
    progression: d.progression || "Progressive overload week to week, with a deload every 4th week.",
  };
}
