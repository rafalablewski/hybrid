/**
 * @hybrid/core — sport-driven training data + pure logic.
 *
 * Ported verbatim from the React prototype (reference/HybridApp.jsx).
 * No React/JSX here — data and helpers only.
 */

import { MOVEMENTS } from "./engines/movements";
import { bestE1rmByLift, type LoggedSession } from "./engines/session";

// ============================================================
//  Types
// ============================================================

export interface SportMarker {
  label: string;
  ph: string;
}

export interface PoolExercise {
  name: string;
  demand: string;
  lvl: number;
  why: string;
}

export interface Sport {
  icon: string;
  family: string;
  marker: SportMarker;
  demands: string[];
  pool: PoolExercise[];
}

export interface SportBlock {
  name: string;
  demand: string;
  /** display scheme — "4×6 @ 90kg" when loaded, "4×6" when bodyweight/tempo */
  scheme: string;
  sets: number;
  reps: number;
  /** working load in kg, when the movement is loadable and we can estimate it */
  load?: number;
  /** where the load came from — the athlete's e1RM, or a starting estimate */
  loadBasis?: string;
  /** true when no external load applies (bodyweight / plyometric / isometric / skill) */
  bodyweight?: boolean;
}

export interface SportPrescription {
  sport: Sport;
  ranked: PoolExercise[];
  blocks: SportBlock[];
  /** base rep scheme for the level (sets×reps) */
  setScheme: string;
  /** true when at least one block's load came from the athlete's logged lifts */
  personalized: boolean;
}

// ============================================================
//  SPORT-DRIVEN TRAINING
//  Pick a sport + level → the engine prescribes the S&C work
//  that makes you better AT that sport. Sport is the goal;
//  exercises are the means.
// ============================================================

export const LEVELS: string[] = ["Beginner", "Intermediate", "Advanced", "Elite"];

// Each sport: physical demands (ranked), a performance marker, and an
// exercise pool tagged by which demand it trains + the level it suits.
// lvl = min level index (0=Beginner) the exercise is appropriate from.
export const SPORTS: Record<string, Sport> = {
  Running: {
    icon: "🏃", family: "Endurance",
    marker: { label: "Current 5k time", ph: "e.g. 24:30" },
    demands: ["Unilateral leg strength", "Posterior chain", "Ankle/tendon stiffness", "Running economy"],
    pool: [
      { name: "Bulgarian Split Squat", demand: "Unilateral leg strength", lvl: 0, why: "Fixes left-right imbalance — the #1 cause of running injury." },
      { name: "Romanian Deadlift", demand: "Posterior chain", lvl: 0, why: "Stronger hamstrings/glutes drive a more powerful stride." },
      { name: "Calf Raise (slow)", demand: "Ankle/tendon stiffness", lvl: 0, why: "Builds the Achilles resilience runners chronically lack." },
      { name: "Pogo Hops", demand: "Ankle/tendon stiffness", lvl: 1, why: "Trains reactive stiffness — free speed via better energy return." },
      { name: "Box Jumps", demand: "Running economy", lvl: 1, why: "Develops the explosive power that lowers ground-contact time." },
      { name: "Depth Jumps", demand: "Running economy", lvl: 2, why: "Advanced plyometric for elastic, reactive running mechanics." },
    ],
  },
  Climbing: {
    icon: "🧗", family: "Outdoor",
    marker: { label: "Hardest redpoint grade", ph: "e.g. 6c+ / V5" },
    demands: ["Pulling strength", "Grip / finger strength", "Core tension", "Shoulder stability"],
    pool: [
      { name: "Pull-up", demand: "Pulling strength", lvl: 0, why: "Foundational pulling power for steeper terrain." },
      { name: "Hollow Body Hold", demand: "Core tension", lvl: 0, why: "The body tension that keeps your feet on overhangs." },
      { name: "Scapular Pull-up", demand: "Shoulder stability", lvl: 0, why: "Protects shoulders from the climber's chronic injuries." },
      { name: "Hangboard Repeaters", demand: "Grip / finger strength", lvl: 1, why: "The single highest-return exercise above intermediate." },
      { name: "Weighted Pull-up", demand: "Pulling strength", lvl: 2, why: "Max-strength pulling for hard, powerful moves." },
      { name: "Front Lever Progression", demand: "Core tension", lvl: 2, why: "Elite tension for steep, cutting-loose climbing." },
    ],
  },
  BJJ: {
    icon: "🥋", family: "Combat",
    marker: { label: "Belt / years", ph: "e.g. Blue, 2 yrs" },
    demands: ["Grip endurance", "Hip power", "Isometric strength", "Conditioning"],
    pool: [
      { name: "Deadlift", demand: "Hip power", lvl: 0, why: "Hip drive for sweeps, bridges, and takedowns." },
      { name: "Towel Pull-up Hold", demand: "Grip endurance", lvl: 0, why: "Grip that survives the whole round — gi or no-gi." },
      { name: "Farmer's Carry", demand: "Grip endurance", lvl: 0, why: "Crushing grip endurance plus full-body tension." },
      { name: "Bear Crawl Intervals", demand: "Conditioning", lvl: 1, why: "Scramble-specific conditioning in grappling positions." },
      { name: "Zercher Squat", demand: "Isometric strength", lvl: 1, why: "Trains the clinch-and-hold isometric demand of grappling." },
      { name: "Power Clean", demand: "Hip power", lvl: 2, why: "Explosive triple extension for takedowns and throws." },
    ],
  },
  Cycling: {
    icon: "🚴", family: "Endurance",
    marker: { label: "FTP (watts)", ph: "e.g. 240" },
    demands: ["Leg strength", "Posterior chain", "Single-leg power", "Core"],
    pool: [
      { name: "Back Squat", demand: "Leg strength", lvl: 0, why: "Raw leg strength raises your sustainable power floor." },
      { name: "Romanian Deadlift", demand: "Posterior chain", lvl: 0, why: "Balances quad-dominant cyclists, protects the lower back." },
      { name: "Step-up", demand: "Single-leg power", lvl: 0, why: "Mirrors the single-leg pedal drive directly." },
      { name: "Plank Series", demand: "Core", lvl: 0, why: "A stable core transfers leg power to the pedals." },
      { name: "Trap Bar Jump", demand: "Single-leg power", lvl: 2, why: "Explosive power for sprints and breakaways." },
    ],
  },
  Boxing: {
    icon: "🥊", family: "Combat",
    marker: { label: "Bouts / experience", ph: "e.g. amateur, 10 bouts" },
    demands: ["Rotational power", "Shoulder endurance", "Conditioning", "Leg drive"],
    pool: [
      { name: "Med Ball Rotational Throw", demand: "Rotational power", lvl: 0, why: "Hip-to-fist rotational power — where punch force comes from." },
      { name: "Push-up Variations", demand: "Shoulder endurance", lvl: 0, why: "Shoulders that don't drop in the later rounds." },
      { name: "Assault Bike Intervals", demand: "Conditioning", lvl: 0, why: "Round-specific anaerobic conditioning." },
      { name: "Jump Squat", demand: "Leg drive", lvl: 1, why: "Explosive legs for footwork and punching off the back foot." },
      { name: "Landmine Punch Press", demand: "Rotational power", lvl: 2, why: "Loaded punch-pattern power for advanced fighters." },
    ],
  },
  Swimming: {
    icon: "🏊", family: "Endurance",
    marker: { label: "100m time", ph: "e.g. 1:25" },
    demands: ["Lat / pulling strength", "Shoulder stability", "Core", "Posterior chain"],
    pool: [
      { name: "Lat Pulldown", demand: "Lat / pulling strength", lvl: 0, why: "The catch-and-pull is everything — build the lats behind it." },
      { name: "Band Pull-apart", demand: "Shoulder stability", lvl: 0, why: "Bulletproofs the swimmer's most-injured joint." },
      { name: "Hollow Body Hold", demand: "Core", lvl: 0, why: "Streamline body position lives in the core." },
      { name: "Pull-up", demand: "Lat / pulling strength", lvl: 1, why: "Bodyweight pulling power that transfers to the stroke." },
      { name: "Cable Straight-arm Pulldown", demand: "Lat / pulling strength", lvl: 2, why: "Mimics the exact freestyle pull path under load." },
    ],
  },
};

export const SPORT_NAMES: string[] = Object.keys(SPORTS);

// per-level dosing: fewer reps at a higher % of 1RM as the athlete advances
const LEVEL_SETS = [3, 4, 4, 5];
const LEVEL_REPS = [8, 6, 5, 3];
const LEVEL_PCT = [0.7, 0.75, 0.8, 0.85];

// ---- the prescription engine: sport + level (+ the athlete's real logs) ----
// Ranks the transferable exercises, then doses today's working set from the
// athlete's OWN logged lifts: the working load is a level-appropriate % of their
// best e1RM for that movement. With no log yet it shows a starting estimate (for
// barbell lifts we know a base load for) or a bodyweight/tempo scheme — never a
// fabricated number.
export function prescribeForSport(
  sportName: string,
  levelIdx: number,
  opts: { sessions?: LoggedSession[] } = {},
): SportPrescription {
  const sport = SPORTS[sportName]!;
  // exercises appropriate for this level, ranked by demand priority order
  const eligible = sport.pool.filter((e) => e.lvl <= levelIdx);
  const ranked = [...eligible].sort((a, b) => sport.demands.indexOf(a.demand) - sport.demands.indexOf(b.demand));
  // build today's session: top exercise from each of the first 3 demands
  const seen = new Set<string>();
  const picks: PoolExercise[] = [];
  for (const d of sport.demands) {
    const ex = ranked.find((e) => e.demand === d && !seen.has(e.name));
    if (ex) { seen.add(ex.name); picks.push(ex); }
    if (picks.length >= 3) break;
  }

  const sets = LEVEL_SETS[levelIdx] ?? 4;
  const reps = LEVEL_REPS[levelIdx] ?? 6;
  const pct = LEVEL_PCT[levelIdx] ?? 0.75;
  const setScheme = `${sets}×${reps}`;

  // the athlete's best e1RM per lift, from their REAL logged sessions
  const e1rmByLift = new Map(bestE1rmByLift(opts.sessions ?? []).map((p) => [p.lift, p.e1rm]));

  let personalized = false;
  const blocks: SportBlock[] = picks.map((p) => {
    const logged = e1rmByLift.get(p.name);
    const mv = MOVEMENTS[p.name];
    const loadable = logged != null || mv?.baseLoad != null;
    if (loadable) {
      const oneRm = logged ?? mv!.baseLoad! * 1.2;
      const load = Math.round((oneRm * pct) / 2.5) * 2.5;
      if (logged != null) personalized = true;
      return {
        name: p.name,
        demand: p.demand,
        sets,
        reps,
        load,
        scheme: `${sets}×${reps} @ ${load}kg`,
        loadBasis:
          logged != null
            ? `${Math.round(pct * 100)}% of your ${Math.round(logged)}kg e1RM`
            : `starting estimate — log ${p.name} to tune this`,
      };
    }
    return { name: p.name, demand: p.demand, sets, reps, scheme: setScheme, bodyweight: true };
  });

  return { sport, ranked, blocks, setScheme, personalized };
}
