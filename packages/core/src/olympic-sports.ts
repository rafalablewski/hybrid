/**
 * @hybrid/core — THE single sport database for the whole app.
 *
 * ONE catalog, two jobs (unified July 2026 — there used to be two lists that
 * drifted; a sport could be prescribable but not loggable, or vice versa):
 *
 *  1. MANUAL sport-session logging — every entry is a sport an athlete can log
 *     as a session they actually did, even with no wearable: pick the sport,
 *     fill the parameters it tracks (duration always; distance + derived pace
 *     for the endurance sports), saved as a normal cardio activity named after
 *     the sport (so pace, PRs, history and the log read it with zero
 *     special-casing).
 *  2. The S&C TRANSFER ENGINE — the subset of sports the app can prescribe
 *     strength & conditioning for ("what gym work makes me better at this
 *     sport") carry an optional `sc` block (family + performance marker +
 *     ranked demands + a level-tagged exercise pool). sports.ts derives its
 *     SPORTS/SPORT_NAMES + prescribeForSport view from exactly these entries,
 *     so the engine and the logger can never again disagree on what a sport is.
 *
 * No React/JSX here — data + pure helpers only, consumed by BOTH clients so the
 * two clients offer the same sports with the same parameters.
 */

import { kmValue } from "./distance";

/**
 * A parameter a sport session can carry. `duration` (minutes) applies to every
 * sport; `distance` (km) + `pace` (derived per-km) apply to the endurance sports
 * where they're meaningful. `pace` always implies `distance` + `duration`.
 */
export type SportMetric = "duration" | "distance" | "pace";

/** Broad grouping for the picker — keeps a long list scannable. */
export type SportCategory =
  | "Athletics"
  | "Aquatics"
  | "Cycling"
  | "Combat"
  | "Racket"
  | "Team"
  | "Gymnastics"
  | "Target"
  | "Outdoor"
  | "Strength"
  | "Winter"
  | "Multisport";

/** A sport's performance marker — the number the athlete tracks to gauge it. */
export interface SportMarker {
  label: string;
  ph: string;
}

/**
 * ONE RUNG of a sport's record ladder — a distance the sport is conventionally
 * measured at, so "what do you run 5 km in" has somewhere to live.
 *
 * The distance is in KM because km is the storage unit everywhere; a 100 m swim
 * is `0.1`. Display converts through the sport's own `distanceUnit`, so the
 * rung is stated in the unit the athlete uses without the catalog holding two.
 */
export interface SportBenchmark {
  /** The distance, in km. */
  km: number;
  /** A proper name, for the distances that have one instead of a figure. */
  name?: "half" | "marathon";
  /** True for the rung this sport's `sc.marker` states — the typed figure fills
   *  it when nothing measured has, and the page states this rung large. */
  marker?: boolean;
}

/** A transferable S&C exercise, tagged by the demand it trains + the min level. */
export interface PoolExercise {
  name: string;
  demand: string;
  /** min level index (0 = Beginner) this exercise is appropriate from. */
  lvl: number;
  why: string;
}

/**
 * The S&C transfer-engine payload — present ONLY on sports the app can
 * prescribe strength & conditioning for. When set, sports.ts surfaces the sport
 * in SPORTS/SPORT_NAMES and prescribeForSport can dose a session for it.
 */
export interface SportSC {
  /** Coarse S&C grouping shown on the Sport screen (Endurance, Combat, …). */
  family: string;
  /** The performance marker the athlete enters (e.g. "Current 5k time"). */
  marker: SportMarker;
  /** Physical demands, ranked by training priority. */
  demands: string[];
  /** The exercise pool, tagged by demand + level. */
  pool: PoolExercise[];
}

export interface OlympicSport {
  name: string;
  icon: string;
  category: SportCategory;
  /** Which parameters this sport actually tracks (always includes "duration"). */
  metrics: SportMetric[];
  /**
   * The unit the sport's distance is naturally entered/shown in. Defaults to
   * "km" (running, cycling, …). Pool/ergometer sports use "m" (swimming,
   * rowing). Storage is ALWAYS km — this only drives display + input, so the
   * shared pace/PR/recap math never sees a mixed unit.
   */
  distanceUnit?: "km" | "m";
  /**
   * Pace split, in METRES, for "m" sports (e.g. 100 → "/100m" for swimming,
   * 500 → "/500m" for rowing). Ignored for "km" sports (always "/km").
   */
  pacePer?: number;
  /**
   * THE RECORD LADDER — the distances this sport keeps personal bests at,
   * ascending. Present ONLY where the sport has conventional race distances:
   * a runner's 5 km and a swimmer's 100 m are real benchmarks, a mountain
   * biker's "25 km" is a number somebody made up. A sport with no ladder shows
   * no records section rather than one padded with invented rungs — the same
   * discipline the rest of this catalog holds about metrics a sport lacks.
   *
   * Read by sportRecords() in sport-page.ts. See that file for the matching
   * rule and, importantly, for what this CANNOT do: a device recording is a
   * workout summary with no laps or route, so a rung is an effort logged AT
   * the distance, never a segment extracted from a longer one.
   */
  records?: SportBenchmark[];
  /**
   * S&C transfer-engine data — set only for the sports the app prescribes gym
   * work for (sports.ts / prescribeForSport read it). Absent = loggable but not
   * yet a prescribable S&C sport.
   */
  sc?: SportSC;
}

// Shorthand metric sets — most sports are timed only; endurance sports add
// distance (and a meaningful per-distance pace).
const TIME: SportMetric[] = ["duration"];
const PACED: SportMetric[] = ["duration", "distance", "pace"];

// Shared record ladders — the road and the pool both have a canonical set, and
// two sports that race the same distances must not disagree about them.
const ROAD: SportBenchmark[] = [
  { km: 1 },
  { km: 5, marker: true },
  { km: 10 },
  { km: 21.0975, name: "half" },
  { km: 42.195, name: "marathon" },
];
const POOL: SportBenchmark[] = [{ km: 0.1, marker: true }, { km: 0.4 }, { km: 1.5 }];
const ERG: SportBenchmark[] = [{ km: 0.5 }, { km: 2 }, { km: 5 }];

/**
 * The catalog — Summer + Winter Olympic sports/disciplines an athlete would log
 * as a session. Endurance sports carry distance + pace; everything else is
 * timed. Keyed list lives below in OLYMPIC_SPORTS for O(1) lookup by name.
 */
const CATALOG: OlympicSport[] = [
  // ---- Athletics ----
  {
    name: "Running", icon: "🏃", category: "Athletics", metrics: PACED, records: ROAD,
    sc: {
      family: "Endurance",
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
  },
  { name: "Marathon", icon: "🏅", category: "Athletics", metrics: PACED, records: ROAD },
  { name: "Race Walking", icon: "🚶", category: "Athletics", metrics: PACED, records: [{ km: 5 }, { km: 10 }, { km: 20 }] },
  { name: "Track & Field", icon: "🏟️", category: "Athletics", metrics: TIME },

  // ---- Aquatics ----
  {
    name: "Swimming", icon: "🏊", category: "Aquatics", metrics: PACED, distanceUnit: "m", pacePer: 100, records: POOL,
    sc: {
      family: "Endurance",
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
  },
  { name: "Open Water Swimming", icon: "🌊", category: "Aquatics", metrics: PACED },
  { name: "Diving", icon: "🤿", category: "Aquatics", metrics: TIME },
  { name: "Artistic Swimming", icon: "🩰", category: "Aquatics", metrics: TIME },
  { name: "Water Polo", icon: "🤽", category: "Aquatics", metrics: TIME },
  { name: "Rowing", icon: "🚣", category: "Aquatics", metrics: PACED, distanceUnit: "m", pacePer: 500, records: ERG },
  { name: "Canoe Sprint", icon: "🛶", category: "Aquatics", metrics: PACED, distanceUnit: "m", pacePer: 500, records: [{ km: 0.2 }, { km: 0.5 }, { km: 1 }] },
  { name: "Canoe Slalom", icon: "🛶", category: "Aquatics", metrics: TIME },
  { name: "Sailing", icon: "⛵", category: "Aquatics", metrics: TIME },
  { name: "Surfing", icon: "🏄", category: "Aquatics", metrics: TIME },

  // ---- Cycling ----
  // FTP is watts, not a time, so the cycling marker fills no rung — the ladder
  // is distances, and the typed FTP keeps the line above it.
  {
    name: "Cycling", icon: "🚴", category: "Cycling", metrics: PACED, records: [{ km: 10 }, { km: 40 }, { km: 100 }],
    sc: {
      family: "Endurance",
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
  },
  // The kilo and the pursuit, in km like the rest of this sport. The flying 200 m
  // is a real track benchmark and is deliberately NOT here: this catalog entry
  // reads in km, so it would render as "0.2 km" — a benchmark nobody calls that.
  { name: "Track Cycling", icon: "🚲", category: "Cycling", metrics: PACED, records: [{ km: 1 }, { km: 4 }] },
  { name: "Mountain Biking", icon: "🚵", category: "Cycling", metrics: PACED },
  { name: "BMX", icon: "🚲", category: "Cycling", metrics: TIME },

  // ---- Combat ----
  {
    name: "Boxing", icon: "🥊", category: "Combat", metrics: TIME,
    sc: {
      family: "Combat",
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
  },
  {
    name: "BJJ", icon: "🥋", category: "Combat", metrics: TIME,
    sc: {
      family: "Combat",
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
  },
  { name: "Judo", icon: "🥋", category: "Combat", metrics: TIME },
  { name: "Karate", icon: "🥋", category: "Combat", metrics: TIME },
  { name: "Taekwondo", icon: "🥋", category: "Combat", metrics: TIME },
  { name: "Wrestling", icon: "🤼", category: "Combat", metrics: TIME },
  { name: "Fencing", icon: "🤺", category: "Combat", metrics: TIME },

  // ---- Racket ----
  { name: "Tennis", icon: "🎾", category: "Racket", metrics: TIME },
  { name: "Table Tennis", icon: "🏓", category: "Racket", metrics: TIME },
  { name: "Badminton", icon: "🏸", category: "Racket", metrics: TIME },
  {
    name: "Squash", icon: "🎾", category: "Racket", metrics: TIME,
    sc: {
      family: "Racquet",
      marker: { label: "Playing level", ph: "e.g. club league, div 3" },
      demands: ["Lunge strength & stability", "Change-of-direction power", "Repeat-sprint conditioning", "Rotational power"],
      pool: [
        { name: "Bulgarian Split Squat", demand: "Lunge strength & stability", lvl: 0, why: "The deep front-corner lunge is squash's signature move — own it under load." },
        { name: "Lateral Bound", demand: "Change-of-direction power", lvl: 0, why: "Trains the explosive side-push and single-leg landing that plant-and-redirect demands." },
        { name: "Shuttle Sprints", demand: "Repeat-sprint conditioning", lvl: 0, why: "Court-length repeats build the anaerobic engine that outlasts long rallies." },
        { name: "Med Ball Rotational Throw", demand: "Rotational power", lvl: 0, why: "Hip-to-racquet rotation — where a heavy, deceptive swing comes from." },
        { name: "Reverse Lunge", demand: "Lunge strength & stability", lvl: 1, why: "Loaded stepping strength that carries your lunges deeper into a long match." },
        { name: "Depth Jump", demand: "Change-of-direction power", lvl: 2, why: "Advanced reactive plyometric for elite first-step quickness off the T." },
      ],
    },
  },

  // ---- Team ----
  { name: "Football", icon: "⚽", category: "Team", metrics: TIME },
  { name: "Basketball", icon: "🏀", category: "Team", metrics: TIME },
  { name: "Volleyball", icon: "🏐", category: "Team", metrics: TIME },
  { name: "Beach Volleyball", icon: "🏖️", category: "Team", metrics: TIME },
  { name: "Handball", icon: "🤾", category: "Team", metrics: TIME },
  { name: "Field Hockey", icon: "🏑", category: "Team", metrics: TIME },
  { name: "Rugby Sevens", icon: "🏉", category: "Team", metrics: TIME },
  { name: "Baseball", icon: "⚾", category: "Team", metrics: TIME },
  { name: "Softball", icon: "🥎", category: "Team", metrics: TIME },

  // ---- Gymnastics ----
  { name: "Artistic Gymnastics", icon: "🤸", category: "Gymnastics", metrics: TIME },
  { name: "Rhythmic Gymnastics", icon: "🎗️", category: "Gymnastics", metrics: TIME },
  { name: "Trampoline", icon: "🤸", category: "Gymnastics", metrics: TIME },
  { name: "Breaking", icon: "🕺", category: "Gymnastics", metrics: TIME },

  // ---- Target ----
  { name: "Archery", icon: "🏹", category: "Target", metrics: TIME },
  { name: "Shooting", icon: "🎯", category: "Target", metrics: TIME },
  { name: "Golf", icon: "⛳", category: "Target", metrics: TIME },

  // ---- Outdoor ----
  {
    name: "Climbing", icon: "🧗", category: "Outdoor", metrics: TIME,
    sc: {
      family: "Outdoor",
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
  },
  { name: "Skateboarding", icon: "🛹", category: "Outdoor", metrics: TIME },
  { name: "Equestrian", icon: "🏇", category: "Outdoor", metrics: TIME },

  // ---- Strength ----
  { name: "Weightlifting", icon: "🏋️", category: "Strength", metrics: TIME },

  // ---- Multisport ----
  { name: "Triathlon", icon: "🏊‍♂️", category: "Multisport", metrics: PACED },
  { name: "Modern Pentathlon", icon: "🤺", category: "Multisport", metrics: TIME },

  // ---- Winter ----
  { name: "Cross-Country Skiing", icon: "⛷️", category: "Winter", metrics: PACED },
  { name: "Biathlon", icon: "🎿", category: "Winter", metrics: PACED },
  { name: "Speed Skating", icon: "⛸️", category: "Winter", metrics: PACED },
  { name: "Short Track", icon: "⛸️", category: "Winter", metrics: PACED },
  { name: "Alpine Skiing", icon: "🎿", category: "Winter", metrics: TIME },
  { name: "Freestyle Skiing", icon: "🎿", category: "Winter", metrics: TIME },
  { name: "Ski Jumping", icon: "🎿", category: "Winter", metrics: TIME },
  { name: "Snowboarding", icon: "🏂", category: "Winter", metrics: TIME },
  { name: "Figure Skating", icon: "⛸️", category: "Winter", metrics: TIME },
  { name: "Ice Hockey", icon: "🏒", category: "Winter", metrics: TIME },
  { name: "Curling", icon: "🥌", category: "Winter", metrics: TIME },
  { name: "Bobsleigh", icon: "🛷", category: "Winter", metrics: TIME },
  { name: "Luge", icon: "🛷", category: "Winter", metrics: TIME },
  { name: "Skeleton", icon: "🛷", category: "Winter", metrics: TIME },
];

/** The catalog keyed by sport name — O(1) lookup. */
export const OLYMPIC_SPORTS: Record<string, OlympicSport> = Object.fromEntries(
  CATALOG.map((s) => [s.name, s]),
);

/** Every sport name, in catalog order. */
export const OLYMPIC_SPORT_NAMES: string[] = CATALOG.map((s) => s.name);

/** The catalog's categories, in first-appearance order. */
export const SPORT_CATEGORIES: SportCategory[] = [...new Set(CATALOG.map((s) => s.category))];

/** Look up a sport by name (case-insensitive), or undefined if unknown. */
export function olympicSport(name: string): OlympicSport | undefined {
  const direct = OLYMPIC_SPORTS[name];
  if (direct) return direct;
  const lower = name.trim().toLowerCase();
  return CATALOG.find((s) => s.name.toLowerCase() === lower);
}

/**
 * True when a sport tracks distance (and therefore a derived pace) — running,
 * swimming, cycling, rowing, … — so the logger shows the distance field. Timed
 * sports (tennis, judo, gymnastics, …) and unknown names show duration only.
 */
export function sportTracksDistance(name: string): boolean {
  return olympicSport(name)?.metrics.includes("distance") ?? false;
}

/**
 * True when a cardio activity should show DURATION ONLY (no distance/pace) — its
 * name is a KNOWN Olympic sport that doesn't track distance (tennis, judo, …).
 * Generic/custom cardio (a typed-in "Run", "Bike") is unknown to the catalog, so
 * this is false and the distance + minutes grid stays. Shared by both clients'
 * editors so web and mobile can't drift on which sports hide the field.
 */
export function timedSportOnly(name: string): boolean {
  return !!olympicSport(name) && !sportTracksDistance(name);
}

/** The sports grouped by category, for a scannable picker. */
export function olympicSportsByCategory(): { category: SportCategory; sports: OlympicSport[] }[] {
  return SPORT_CATEGORIES.map((category) => ({
    category,
    sports: CATALOG.filter((s) => s.category === category),
  }));
}

// ---- Distance / pace units --------------------------------------------------
// Storage is ALWAYS kilometres so the shared pace/PR/recap math is single-unit.
// These helpers convert ONLY for per-effort DISPLAY + input, in the sport's
// natural unit (metres for pool/ergo sports, km for the rest).

/** The unit a sport's distance is shown/entered in ("km" unless flagged "m"). */
export function sportDistanceUnit(name: string): "km" | "m" {
  return olympicSport(name)?.distanceUnit ?? "km";
}

/** The pace split in METRES — 1000 (per km) for km sports, else the sport's pacePer (default 100). */
export function sportPacePerMeters(name: string): number {
  const s = olympicSport(name);
  if (s?.distanceUnit === "m") return s.pacePer ?? 100;
  return 1000;
}

/** Stored km → the value shown in the sport's distance unit (e.g. 0.4 → "400" for swimming). */
export function displaySportDistance(km: number | undefined | null, name: string): string {
  if (km == null || !Number.isFinite(km)) return "";
  // Metre sports read to the metre; km sports to the shared two decimals (10 m
  // — see distance.ts). The cap matters now that measured distances reach here
  // unrounded — a watch's 10.234 km would otherwise print all three decimals,
  // and 0.51 km of pool swimming has to stay 510 m rather than collapse to 500.
  return sportDistanceUnit(name) === "m" ? String(Math.round(km * 1000)) : kmValue(km);
}

/** A typed distance value (in the sport's unit) → stored km, or undefined if blank/NaN. */
export function parseSportDistance(value: string, name: string): number | undefined {
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return undefined;
  return sportDistanceUnit(name) === "m" ? n / 1000 : n;
}

/** Stored km → a labelled distance string in the sport's unit (e.g. "400 m" / "8 km"). */
export function formatSportDistance(km: number | undefined | null, name: string): string {
  const v = displaySportDistance(km, name);
  return v ? `${v} ${sportDistanceUnit(name)}` : "";
}

// ---- Suggested sports (recent + defaults) -----------------------------------

import type { LoggedSession } from "./engines/session";

// Shown to a brand-new athlete (or to top up a short history) so the quick-log
// widget always offers a few one-tap chips before "More…".
const DEFAULT_SUGGESTED = ["Running", "Cycling", "Swimming", "Tennis", "Football"];

/**
 * The athlete's go-to sports for a quick-log shortlist — the Olympic sports they
 * most recently logged (cardio activities, newest first, de-duped), topped up
 * with sensible defaults so there are always chips to tap. Names not in the
 * catalog (custom cardio like a generic "Run") are ignored here; the full picker
 * still covers everything.
 */
export function suggestedSports(sessions: LoggedSession[], limit = 6): string[] {
  const sorted = [...sessions].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );
  const out: string[] = [];
  for (const s of sorted)
    for (const b of s.blocks)
      if (b.kind === "cardio" && olympicSport(b.name) && !out.includes(b.name)) out.push(b.name);
  for (const d of DEFAULT_SUGGESTED) if (out.length < limit && !out.includes(d)) out.push(d);
  return out.slice(0, limit);
}
