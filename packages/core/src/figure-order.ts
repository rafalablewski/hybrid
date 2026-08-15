// THE ORDER TRAINING FIGURES ARE READ IN — one list, every surface.
//
// `ACTIVITY_METRICS` (activity-window.ts) already fixed the four totals the
// Progress card carries: TONNAGE → SESSIONS → HOURS → DISTANCE. But almost
// every other surface carries a SUPERSET of those four — the done receipt adds
// sets, climb and energy; a feed card adds reps and heart rate; a leaderboard
// adds active days, streak and records — and each of them had picked its own
// sequence. Six different orders were in play across the app for the same
// handful of numbers: the receipt led with duration, the profile tiles led with
// the session count, the share card led with time, the leaderboard put distance
// third and the endurance section put it second. Nothing chose those; they are
// just the order each row happened to be typed in.
//
// A row of figures is found by POSITION before it is read at all. So this file
// EXTENDS the four rather than competing with them: every other figure attaches
// to whichever of the four it is a facet of, and lands beside it.
//
//   tonnage → sets → reps → rounds   what was moved, and the grain it moved in
//   sessions → active days → streak   how often, and how that adds up
//   hours                        how long
//   distance → pace → elevation  the ground covered, and what it cost to cover
//   energy → heart rate → effort what the whole thing cost the body
//   records                      what came out of it
//
// Two things this file is deliberately NOT:
//
// It is not a SELECTION rule. Which figures a surface shows is that surface's
// own business — a swim has no sets, a lifting day has no pace, and Wrapped
// picks four tiles by discipline. Those decisions stay where they are; they are
// sorted through here afterwards, so the choice and the sequence stop being the
// same line of code.
//
// It is not a PRIORITY rule either. `doneReceiptHero` and `sessionHeadline`
// choose the ONE figure that earns display size (tonnage, else distance, else
// duration), which is a claim about what the session was ABOUT. That is a
// different question from what order the rest are listed in, and it keeps its
// own answer.

/**
 * Every training figure the app prints, in the order it prints them.
 *
 * The names are the CANONICAL ones. Surfaces that call the same figure
 * something else — `volume` for tonnage, `duration`/`minutes` for hours,
 * `efforts` for sessions, `km` for distance — are mapped by `ALIAS` below
 * rather than being re-spelled at the call site, because renaming a feed's
 * stat key to satisfy this file would be the tail wagging the dog.
 */
export const FIGURE_ORDER = [
  "tonnage",
  "sets",
  "reps",
  // A conditioning block's rounds are the grain its work is counted in, the
  // way sets are a lift's — so they sit with them, not at the end.
  "rounds",
  "sessions",
  "activeDays",
  "streak",
  "hours",
  "distance",
  "pace",
  "elevation",
  "kcal",
  "hr",
  // The athlete's own read of it, after every measured one.
  "effort",
  "prs",
] as const;

export type FigureKey = (typeof FIGURE_ORDER)[number];

/** The other names the same figures already travel under. */
const ALIAS: Record<string, FigureKey> = {
  volume: "tonnage",
  tonnageKg: "tonnage",
  totalVolumeKg: "tonnage",
  duration: "hours",
  minutes: "hours",
  durationMin: "hours",
  time: "hours",
  efforts: "sessions",
  totalSessions: "sessions",
  km: "distance",
  distanceKm: "distance",
  climb: "elevation",
  elevationM: "elevation",
  energy: "kcal",
  avgHr: "hr",
  heartRate: "hr",
  activeDaysCount: "activeDays",
  currentStreak: "streak",
  records: "prs",
};

const RANK = new Map<string, number>(FIGURE_ORDER.map((k, i) => [k, i]));

/**
 * Where a figure sits in the reading order. An unknown key sorts LAST rather
 * than throwing: a surface carrying something this list has never heard of
 * (a sport's own measure, a one-off) should render it, at the end, not crash —
 * and a stable sort leaves several unknowns in the order they arrived in.
 */
export function figureRank(key: string): number {
  const direct = RANK.get(key);
  if (direct != null) return direct;
  const aliased = ALIAS[key];
  return aliased != null ? RANK.get(aliased)! : FIGURE_ORDER.length;
}

/**
 * Sort a row of figures into the reading order, without touching WHICH ones are
 * in it. STABLE — `Array.prototype.sort` is stable per spec, so two figures
 * this list does not rank keep the order the caller built them in.
 */
export function orderFigures<T>(items: readonly T[], key: (item: T) => string): T[] {
  return [...items].sort((a, b) => figureRank(key(a)) - figureRank(key(b)));
}
