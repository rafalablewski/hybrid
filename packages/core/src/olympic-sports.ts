/**
 * @hybrid/core — the Olympic sports catalog for MANUAL sport-session logging.
 *
 * Distinct from sports.ts (the S&C transfer ENGINE — "what strength work makes
 * me better at this sport"). THIS is the list of sports an athlete can log as a
 * session they actually did, even with no wearable connected: pick the sport,
 * fill the parameters it actually tracks (duration always; distance + derived
 * pace for the endurance sports), and it's saved as a normal activity (a cardio
 * block named after the sport — so pace, PRs, history and the training log all
 * read it with zero special-casing).
 *
 * No React/JSX here — data + pure helpers only, consumed by BOTH clients so the
 * two loggers offer the same sports with the same parameters.
 */

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

export interface OlympicSport {
  name: string;
  icon: string;
  category: SportCategory;
  /** Which parameters this sport actually tracks (always includes "duration"). */
  metrics: SportMetric[];
  /**
   * The unit the sport's distance is naturally entered/shown in. Defaults to
   * "km" (running, road cycling, …). Pool/ergometer sports use "m" (swimming,
   * rowing). Storage is ALWAYS km — this only drives display + input, so the
   * shared pace/PR/recap math never sees a mixed unit.
   */
  distanceUnit?: "km" | "m";
  /**
   * Pace split, in METRES, for "m" sports (e.g. 100 → "/100m" for swimming,
   * 500 → "/500m" for rowing). Ignored for "km" sports (always "/km").
   */
  pacePer?: number;
}

// Shorthand metric sets — most sports are timed only; endurance sports add
// distance (and a meaningful per-distance pace).
const TIME: SportMetric[] = ["duration"];
const PACED: SportMetric[] = ["duration", "distance", "pace"];

/**
 * The catalog — Summer + Winter Olympic sports/disciplines an athlete would log
 * as a session. Endurance sports carry distance + pace; everything else is
 * timed. Keyed list lives below in OLYMPIC_SPORTS for O(1) lookup by name.
 */
const CATALOG: OlympicSport[] = [
  // ---- Athletics ----
  { name: "Running", icon: "🏃", category: "Athletics", metrics: PACED },
  { name: "Marathon", icon: "🏅", category: "Athletics", metrics: PACED },
  { name: "Race Walking", icon: "🚶", category: "Athletics", metrics: PACED },
  { name: "Track & Field", icon: "🏟️", category: "Athletics", metrics: TIME },

  // ---- Aquatics ----
  { name: "Swimming", icon: "🏊", category: "Aquatics", metrics: PACED, distanceUnit: "m", pacePer: 100 },
  { name: "Open Water Swimming", icon: "🌊", category: "Aquatics", metrics: PACED },
  { name: "Diving", icon: "🤿", category: "Aquatics", metrics: TIME },
  { name: "Artistic Swimming", icon: "🩰", category: "Aquatics", metrics: TIME },
  { name: "Water Polo", icon: "🤽", category: "Aquatics", metrics: TIME },
  { name: "Rowing", icon: "🚣", category: "Aquatics", metrics: PACED, distanceUnit: "m", pacePer: 500 },
  { name: "Canoe Sprint", icon: "🛶", category: "Aquatics", metrics: PACED, distanceUnit: "m", pacePer: 500 },
  { name: "Canoe Slalom", icon: "🛶", category: "Aquatics", metrics: TIME },
  { name: "Sailing", icon: "⛵", category: "Aquatics", metrics: TIME },
  { name: "Surfing", icon: "🏄", category: "Aquatics", metrics: TIME },

  // ---- Cycling ----
  { name: "Road Cycling", icon: "🚴", category: "Cycling", metrics: PACED },
  { name: "Track Cycling", icon: "🚲", category: "Cycling", metrics: PACED },
  { name: "Mountain Biking", icon: "🚵", category: "Cycling", metrics: PACED },
  { name: "BMX", icon: "🚲", category: "Cycling", metrics: TIME },

  // ---- Combat ----
  { name: "Boxing", icon: "🥊", category: "Combat", metrics: TIME },
  { name: "Judo", icon: "🥋", category: "Combat", metrics: TIME },
  { name: "Karate", icon: "🥋", category: "Combat", metrics: TIME },
  { name: "Taekwondo", icon: "🥋", category: "Combat", metrics: TIME },
  { name: "Wrestling", icon: "🤼", category: "Combat", metrics: TIME },
  { name: "Fencing", icon: "🤺", category: "Combat", metrics: TIME },

  // ---- Racket ----
  { name: "Tennis", icon: "🎾", category: "Racket", metrics: TIME },
  { name: "Table Tennis", icon: "🏓", category: "Racket", metrics: TIME },
  { name: "Badminton", icon: "🏸", category: "Racket", metrics: TIME },

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
  { name: "Sport Climbing", icon: "🧗", category: "Outdoor", metrics: TIME },
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
  return sportDistanceUnit(name) === "m" ? String(Math.round(km * 1000)) : String(km);
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
