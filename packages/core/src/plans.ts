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

export interface GoalNode {
  id: string;
  name: string;
  icon: string;
  color: string;
  blurb: string;
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
  sample: PlanSample;
  progression: string;
}

// ============================================================
//  GOAL TREE — choose a goal, then see the plans built for it.
// ============================================================

export const GOAL_TREE: GoalNode[] = [
  { id: "bb", name: "Bodybuilding", icon: "■", color: VIOLET, blurb: "Maximize muscle. Train splits, chase volume and progressive overload.",
    plans: [
      { id: "bb1", name: "Push / Pull / Legs", weeks: 8, sessions: 6, tag: "PPL", desc: "The classic 6-day hypertrophy split. High volume, full coverage.", focus: ["Hypertrophy"], hot: true },
      { id: "bb2", name: "Upper / Lower", weeks: 8, sessions: 4, tag: "U/L", desc: "4-day split balancing frequency and recovery. Great for naturals.", focus: ["Hypertrophy", "Strength"] },
      { id: "bb3", name: "Full Body (FBW)", weeks: 6, sessions: 3, tag: "FBW", desc: "3-day full-body. Maximum frequency per muscle, time-efficient.", focus: ["Hypertrophy"] },
      { id: "bb4", name: "Powerbuilding", weeks: 9, sessions: 4, tag: "Hybrid", desc: "Bigger and stronger — heavy compounds plus hypertrophy accessories.", focus: ["Strength", "Hypertrophy"] },
    ]},
  { id: "hyrox", name: "Hyrox", icon: "●", color: LIME, blurb: "Race the 8-station functional fitness event. Compromised running is everything.",
    plans: [
      { id: "hx1", name: "Hyrox Race Prep", weeks: 10, sessions: 5, tag: "Race", desc: "Compromised running, sled push/pull, and all 8 stations dialed in.", focus: ["Engine", "Strength-Endurance"], hot: true },
      { id: "hx2", name: "Hyrox Base Builder", weeks: 8, sessions: 4, tag: "Base", desc: "Aerobic base and strength-endurance for first-time competitors.", focus: ["Engine", "Strength"] },
      { id: "hx3", name: "Hyrox Peak", weeks: 6, sessions: 5, tag: "Peak", desc: "Sharpen for race day — pacing, transitions, station efficiency.", focus: ["Race"] },
    ]},
  { id: "tri", name: "Triathlon", icon: "◆", color: BLUE, blurb: "Swim-bike-run endurance. Strength work that supports, not sabotages.",
    plans: [
      { id: "tri1", name: "Strength for Triathletes", weeks: 12, sessions: 2, tag: "Support", desc: "Low-volume, high-value lifting to bulletproof joints without adding fatigue.", focus: ["Strength"], hot: true },
      { id: "tri2", name: "Off-Season Power", weeks: 8, sessions: 3, tag: "Base", desc: "Build raw strength in the off-season before sport-specific volume ramps.", focus: ["Strength", "Power"] },
      { id: "tri3", name: "In-Season Maintenance", weeks: 10, sessions: 2, tag: "Maintain", desc: "Keep strength while swim-bike-run volume peaks. Minimal interference.", focus: ["Strength"] },
    ]},
  { id: "hybrid", name: "Hybrid Athlete", icon: "▲", color: LIME, blurb: "Lift heavy and train your sport. Strength that carries over to running, combat, court, or crag.",
    plans: [
      { id: "hy1", name: "Hybrid Base", weeks: 8, sessions: 4, tag: "Foundation", desc: "Build a squat and a sub-8:00 2k in parallel. The on-ramp for everyone.", focus: ["Strength", "Engine"], hot: true },
      { id: "hy2", name: "Lift + Run", weeks: 10, sessions: 5, tag: "Endurance", desc: "Concurrent strength and running without the legs-feel-dead interference tax.", focus: ["Strength", "Running"] },
      { id: "hy3", name: "Strength for Combat", weeks: 12, sessions: 4, tag: "Combat", desc: "Power, grip, and conditioning for BJJ / boxing / MMA — built around your mat time.", focus: ["Strength", "Power", "Combat"] },
      { id: "hy4", name: "Climb + Strength", weeks: 8, sessions: 4, tag: "Outdoor", desc: "Pulling strength and core for climbers, programmed around sessions on the wall.", focus: ["Strength", "Climbing"] },
      { id: "hy5", name: "Tactical Operator", weeks: 12, sessions: 5, tag: "Tactical", desc: "Load-bearing strength, rucking, and work capacity under fatigue.", focus: ["Strength", "Conditioning", "Ruck"] },
    ]},
  { id: "power", name: "Powerlifting", icon: "▬", color: VIOLET, blurb: "One goal: a bigger squat, bench, and deadlift total.",
    plans: [
      { id: "pl1", name: "Linear Progression", weeks: 12, sessions: 3, tag: "Novice", desc: "Add weight every session. The fastest path for newer lifters.", focus: ["Strength"], hot: true },
      { id: "pl2", name: "Block Periodization", weeks: 16, sessions: 4, tag: "Advanced", desc: "Volume, intensity, and peak blocks toward a meet day.", focus: ["Strength", "Power"] },
    ]},
];

// flat list still used by the landing carousel (top plan per goal)
export const PLANS: (GoalPlan & { color: string })[] = GOAL_TREE.map((g) => ({ ...g.plans[0]!, color: g.color }));

// ============================================================
//  PLAN DETAIL — every plan gets a full workout summary:
//  level, who it's for, outcome, duration/frequency, split,
//  a fully-spec'd sample session, progression, equipment.
// ============================================================

export const PLAN_DETAIL: Record<string, PlanDetail> = {
  // ---------- BODYBUILDING ----------
  bb1: { level: "Intermediate", forWho: "Lifters with 1+ yr training who can train 6 days/wk. Suits all; higher volume favors those recovering well.", outcome: "Visible muscle gain across all groups; +2–4 kg lean mass over the block done right.", sessionLength: "60–75 min", equipment: "Full gym (barbell, dumbbells, cables, machines)",
    split: ["Push", "Pull", "Legs", "Push", "Pull", "Legs", "Rest"],
    sample: { day: "Push day", items: [
      { name: "Bench Press", sr: "4 × 6–8", rest: "2:30", rpe: "8" },
      { name: "Incline DB Press", sr: "3 × 10", rest: "2:00", rpe: "8" },
      { name: "Overhead Press", sr: "3 × 8", rest: "2:00", rpe: "8" },
      { name: "Cable Fly", sr: "3 × 12–15", rest: "1:30", rpe: "9" },
      { name: "Lateral Raise", sr: "4 × 15", rest: "1:00", rpe: "9" },
      { name: "Tricep Pushdown", sr: "3 × 12", rest: "1:00", rpe: "9" },
    ] },
    progression: "Double progression: add reps within the range, then add load when you hit the top. Volume rises weeks 1–3, deload week 4." },
  bb2: { level: "Beginner–Intermediate", forWho: "Great for naturals and anyone wanting strength + size on 4 days/wk. Sex-neutral.", outcome: "Balanced size and strength; strong base before specializing.", sessionLength: "60 min", equipment: "Barbell, dumbbells, basic machines",
    split: ["Upper", "Lower", "Rest", "Upper", "Lower", "Rest", "Rest"],
    sample: { day: "Upper day", items: [
      { name: "Bench Press", sr: "4 × 6", rest: "2:30", rpe: "8" },
      { name: "Barbell Row", sr: "4 × 8", rest: "2:00", rpe: "8" },
      { name: "Overhead Press", sr: "3 × 8", rest: "2:00", rpe: "8" },
      { name: "Lat Pulldown", sr: "3 × 10", rest: "1:30", rpe: "8" },
      { name: "DB Curl", sr: "3 × 12", rest: "1:00", rpe: "9" },
    ] },
    progression: "Linear: add 2.5kg to main lifts each week while reps hold. Reset 10% and rebuild if a lift stalls twice." },
  bb3: { level: "Beginner", forWho: "New lifters or anyone time-limited to 3 days/wk. Highest frequency per muscle — ideal for learning movements.", outcome: "Fast early strength and size; movement competence on the main lifts.", sessionLength: "45–60 min", equipment: "Barbell, dumbbells",
    split: ["Full Body", "Rest", "Full Body", "Rest", "Full Body", "Rest", "Rest"],
    sample: { day: "Full body", items: [
      { name: "Back Squat", sr: "3 × 5", rest: "3:00", rpe: "7" },
      { name: "Bench Press", sr: "3 × 5", rest: "2:30", rpe: "7" },
      { name: "Barbell Row", sr: "3 × 8", rest: "2:00", rpe: "8" },
      { name: "Romanian Deadlift", sr: "3 × 8", rest: "2:00", rpe: "8" },
      { name: "Plank", sr: "3 × 45s", rest: "1:00", rpe: "—" },
    ] },
    progression: "Add 2.5kg every session you hit all reps. The simplest, fastest beginner progression." },
  bb4: { level: "Intermediate–Advanced", forWho: "Lifters who want to look strong and be strong. Assumes solid technique on the big three.", outcome: "Bigger lifts + more muscle; the best of both worlds.", sessionLength: "70–85 min", equipment: "Full gym",
    split: ["Lower (Strength)", "Upper (Strength)", "Rest", "Lower (Hypertrophy)", "Upper (Hypertrophy)", "Rest", "Rest"],
    sample: { day: "Lower (Strength)", items: [
      { name: "Back Squat", sr: "5 × 3", rest: "3:00", rpe: "8" },
      { name: "Deadlift", sr: "3 × 3", rest: "3:00", rpe: "8" },
      { name: "Leg Press", sr: "3 × 10", rest: "2:00", rpe: "8" },
      { name: "Leg Curl", sr: "3 × 12", rest: "1:30", rpe: "9" },
      { name: "Calf Raise", sr: "4 × 12", rest: "1:00", rpe: "9" },
    ] },
    progression: "Strength days: linear load on triples. Hypertrophy days: double progression. Deload every 4th week." },

  // ---------- HYROX ----------
  hx1: { level: "Intermediate–Advanced", forWho: "Athletes with an aerobic base targeting a Hyrox race. Demands consistent running.", outcome: "Race-ready: faster compromised running, stronger stations, dialed pacing.", sessionLength: "60–90 min", equipment: "Sled, ski erg, rower, kettlebells, wall ball, sandbag",
    split: ["Run + Strength", "Stations", "Easy Run", "Compromised Running", "Strength", "Long Run / Sim", "Rest"],
    sample: { day: "Compromised running", items: [
      { name: "Run", sr: "4 × 1 km @ race pace", rest: "—", rpe: "8" },
      { name: "Sled Push", sr: "4 × 25 m", rest: "between runs", rpe: "9" },
      { name: "Wall Balls", sr: "4 × 25", rest: "—", rpe: "8" },
      { name: "Row", sr: "4 × 500 m", rest: "—", rpe: "8" },
    ] },
    progression: "Build run volume + station load weeks 1–8, sharpen pacing weeks 9–10, taper into race week." },
  hx2: { level: "Beginner", forWho: "First-time Hyrox athletes building the engine and base strength. All welcome.", outcome: "The aerobic base and strength-endurance to complete your first Hyrox strong.", sessionLength: "45–60 min", equipment: "Rower, kettlebells, basic strength kit",
    split: ["Zone 2 Run", "Full Body Strength", "Rest", "Intervals", "Strength-Endurance", "Easy Long Run", "Rest"],
    sample: { day: "Strength-endurance", items: [
      { name: "Goblet Squat", sr: "4 × 15", rest: "1:30", rpe: "8" },
      { name: "KB Swing", sr: "4 × 20", rest: "1:30", rpe: "8" },
      { name: "Walking Lunge", sr: "3 × 20", rest: "1:30", rpe: "8" },
      { name: "Row", sr: "3 × 500 m", rest: "2:00", rpe: "7" },
    ] },
    progression: "Mostly volume: extend Z2 runs and circuit rounds weekly. Intensity stays moderate to build the base safely." },
  hx3: { level: "Advanced", forWho: "Experienced Hyrox racers peaking for a target event in the next 6 weeks.", outcome: "Peak race performance — sharpened pacing, station efficiency, fast transitions.", sessionLength: "60–75 min", equipment: "Full Hyrox station kit",
    split: ["Race-Pace Run", "Station Speed", "Easy Run", "Full Sim", "Recovery", "Pacing Run", "Rest"],
    sample: { day: "Full simulation", items: [
      { name: "8 × (1km Run + 1 Station)", sr: "race format", rest: "as per race", rpe: "9" },
    ] },
    progression: "Volume drops, intensity holds. Each week sharpens race execution; final week is a full taper." },

  // ---------- TRIATHLON ----------
  tri1: { level: "All levels", forWho: "Triathletes who want injury-proofing without adding fatigue. Low time cost — 2 days/wk.", outcome: "Stronger, more durable, more economical — without compromising swim/bike/run volume.", sessionLength: "40–45 min", equipment: "Barbell, dumbbells",
    split: ["Strength A", "Rest", "Rest", "Strength B", "Rest", "Rest", "Rest"],
    sample: { day: "Strength A", items: [
      { name: "Back Squat", sr: "3 × 5", rest: "2:30", rpe: "7" },
      { name: "Romanian Deadlift", sr: "3 × 8", rest: "2:00", rpe: "7" },
      { name: "Single-leg Step-up", sr: "3 × 10/leg", rest: "1:30", rpe: "7" },
      { name: "Plank", sr: "3 × 45s", rest: "1:00", rpe: "—" },
    ] },
    progression: "Low volume, quality load. Add small load while keeping RPE ≤ 8 so it never interferes with sport training." },
  tri2: { level: "Intermediate", forWho: "Triathletes in the off-season ready to build raw strength before sport volume ramps.", outcome: "A higher strength ceiling that carries into the season as power and durability.", sessionLength: "55 min", equipment: "Barbell, dumbbells, plyo box",
    split: ["Lower Power", "Rest", "Upper + Core", "Rest", "Full Body", "Rest", "Rest"],
    sample: { day: "Lower power", items: [
      { name: "Back Squat", sr: "4 × 4", rest: "3:00", rpe: "8" },
      { name: "Trap Bar Jump", sr: "4 × 3", rest: "2:30", rpe: "7" },
      { name: "Romanian Deadlift", sr: "3 × 6", rest: "2:00", rpe: "8" },
      { name: "Calf Raise", sr: "3 × 12", rest: "1:00", rpe: "8" },
    ] },
    progression: "Off-season build: load climbs over 3-week blocks with a deload, before sport-specific volume takes priority." },
  tri3: { level: "All levels", forWho: "Triathletes mid-season needing to keep strength while race volume peaks. Minimal interference.", outcome: "Maintain the strength you built without stealing recovery from key sessions.", sessionLength: "30–35 min", equipment: "Barbell or dumbbells",
    split: ["Maintenance A", "Rest", "Rest", "Maintenance B", "Rest", "Rest", "Rest"],
    sample: { day: "Maintenance A", items: [
      { name: "Back Squat", sr: "2 × 4", rest: "2:30", rpe: "7" },
      { name: "Bench or Push-up", sr: "2 × 6", rest: "2:00", rpe: "7" },
      { name: "Single-leg RDL", sr: "2 × 8/leg", rest: "1:30", rpe: "7" },
    ] },
    progression: "Hold load, low volume — just enough stimulus to retain strength. Never to failure in-season." },

  // ---------- HYBRID ----------
  hy1: { level: "Beginner–Intermediate", forWho: "Anyone wanting to lift and condition at once. The default on-ramp for hybrid athletes.", outcome: "A real squat and a sub-8:00 2k row — strength and engine, built together.", sessionLength: "60 min", equipment: "Barbell, rower, basic kit",
    split: ["Strength + Engine", "Easy Run", "Rest", "Strength + Engine", "Intervals", "Long Easy", "Rest"],
    sample: { day: "Strength + Engine", items: [
      { name: "Back Squat", sr: "4 × 5", rest: "2:30", rpe: "8" },
      { name: "Bench Press", sr: "3 × 8", rest: "2:00", rpe: "8" },
      { name: "Row Intervals", sr: "8 × 40s/20s", rest: "built-in", rpe: "8" },
    ] },
    progression: "Strength climbs linearly; conditioning volume rises weekly. Concurrent training kept low-interference." },
  hy2: { level: "Intermediate", forWho: "Runners who lift, or lifters adding running. Manages the interference effect directly.", outcome: "Hold (or build) strength while running improves — the hybrid holy grail.", sessionLength: "60–70 min", equipment: "Barbell, running route",
    split: ["Heavy Lower", "Easy Run", "Upper", "Tempo Run", "Power", "Long Run", "Rest"],
    sample: { day: "Heavy lower", items: [
      { name: "Back Squat", sr: "5 × 3", rest: "3:00", rpe: "8" },
      { name: "Romanian Deadlift", sr: "3 × 6", rest: "2:30", rpe: "8" },
      { name: "Walking Lunge", sr: "3 × 12", rest: "1:30", rpe: "8" },
    ] },
    progression: "Lifting and running kept on separate days where possible; hard runs away from heavy legs to limit interference." },
  hy3: { level: "Intermediate–Advanced", forWho: "Combat athletes (BJJ/boxing/MMA) wanting strength that carries to the mat, around their training.", outcome: "More power, grip, and conditioning — without overtraining alongside sport sessions.", sessionLength: "50–60 min", equipment: "Barbell, kettlebells, pull-up bar",
    split: ["Power", "Sport (own)", "Strength", "Sport (own)", "Conditioning", "Sport (own)", "Rest"],
    sample: { day: "Power", items: [
      { name: "Power Clean", sr: "5 × 2", rest: "2:30", rpe: "8" },
      { name: "Trap Bar Deadlift", sr: "4 × 4", rest: "2:30", rpe: "8" },
      { name: "Farmer's Carry", sr: "4 × 40 m", rest: "1:30", rpe: "8" },
    ] },
    progression: "Strength work autoregulated around mat fatigue — RPE-capped so sport always comes first." },
  hy4: { level: "Intermediate", forWho: "Climbers wanting pulling strength and core without bulking. Built around wall sessions.", outcome: "Stronger pulls and tension for harder routes, programmed around your climbing.", sessionLength: "45–55 min", equipment: "Pull-up bar, hangboard, barbell",
    split: ["Climb (own)", "Pull Strength", "Climb (own)", "Core + Antagonist", "Climb (own)", "Rest", "Rest"],
    sample: { day: "Pull strength", items: [
      { name: "Weighted Pull-up", sr: "4 × 5", rest: "3:00", rpe: "8" },
      { name: "Hangboard Repeaters", sr: "6 × 7s", rest: "3:00", rpe: "8" },
      { name: "Front Lever Progression", sr: "4 × 10s", rest: "2:00", rpe: "8" },
    ] },
    progression: "Finger and pulling load build slowly to protect tendons; antagonist work prevents climber's imbalances." },
  hy5: { level: "Advanced", forWho: "Tactical / military / first-responder athletes needing strength + work capacity under load.", outcome: "Carry heavy, move far, recover fast — durable all-round capability.", sessionLength: "70–80 min", equipment: "Barbell, ruck, sled, kettlebells",
    split: ["Strength", "Ruck", "Conditioning", "Strength", "Work Capacity", "Long Ruck", "Rest"],
    sample: { day: "Work capacity", items: [
      { name: "Front Squat", sr: "4 × 5", rest: "2:30", rpe: "8" },
      { name: "Sandbag Clean", sr: "5 × 5", rest: "2:00", rpe: "8" },
      { name: "Ruck Intervals", sr: "6 × 400 m @ 20kg", rest: "1:1", rpe: "8" },
    ] },
    progression: "Strength and load-carry volume rise together; periodic test weeks (ruck time, max carry) gauge readiness." },

  // ---------- POWERLIFTING ----------
  pl1: { level: "Beginner", forWho: "New lifters who want a bigger squat/bench/deadlift total fast. Sex-neutral; the fastest path early on.", outcome: "Rapid total gains — often +30–50kg on the combined total in the first block.", sessionLength: "60 min", equipment: "Barbell, rack, bench",
    split: ["Squat + Bench", "Rest", "Deadlift + OHP", "Rest", "Squat + Bench", "Rest", "Rest"],
    sample: { day: "Squat + Bench", items: [
      { name: "Back Squat", sr: "3 × 5", rest: "3:00", rpe: "8" },
      { name: "Bench Press", sr: "3 × 5", rest: "3:00", rpe: "8" },
      { name: "Accessory (chosen)", sr: "3 × 8–10", rest: "1:30", rpe: "8" },
    ] },
    progression: "Add 2.5kg (upper) / 5kg (lower) every session. Reset 10% and rebuild after a failed week — classic linear progression." },
  pl2: { level: "Advanced", forWho: "Experienced powerlifters peaking for a meet. Requires a known 1RM on each lift.", outcome: "A peaked total on meet day via accumulation → intensification → realization.", sessionLength: "75–90 min", equipment: "Full powerlifting setup, competition kit",
    split: ["Squat (main)", "Bench (main)", "Rest", "Deadlift (main)", "Bench (volume)", "Rest", "Rest"],
    sample: { day: "Squat (main)", items: [
      { name: "Back Squat", sr: "5 × 3 @ 80%", rest: "3:30", rpe: "8" },
      { name: "Paused Squat", sr: "3 × 3 @ 70%", rest: "3:00", rpe: "8" },
      { name: "Leg Press", sr: "3 × 10", rest: "2:00", rpe: "8" },
    ] },
    progression: "Block periodization: volume (wks 1–6) → intensity (7–12) → peak/taper (13–16). %1RM rises as reps fall toward meet day." },
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
    sample: d.sample || { day: "Sample day", items: [{ name: "—", sr: "—", rest: "—", rpe: "—" }] },
    progression: d.progression || "Progressive overload week to week, with a deload every 4th week.",
  };
}
