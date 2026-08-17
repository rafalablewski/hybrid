/**
 * @hybrid/core — the S&C transfer ENGINE (sport + level → the gym work that
 * transfers). Pure logic only.
 *
 * The sport DATA is NOT here anymore — there is ONE sport database, the catalog
 * in ./olympic-sports. This module derives its SPORTS / SPORT_NAMES view from
 * exactly the catalog entries that carry an `sc` (S&C) block, so the engine and
 * the logger can never disagree on what a sport is. Add or edit a sport in
 * olympic-sports.ts (give it an `sc` block to make it prescribable); everything
 * here follows automatically.
 */

import { gymExercise } from "./exercise-db";
import { movementFor } from "./engines/movements";
import { bestE1rmByLift, type LoggedSession } from "./engines/session";
import { OLYMPIC_SPORTS, type SportMarker, type PoolExercise } from "./olympic-sports";

// ============================================================
//  Types
// ============================================================

/** The engine's view of a sport — projected from a catalog entry's `sc` block. */
export interface Sport {
  family: string;
  marker: SportMarker;
  demands: string[];
  pool: PoolExercise[];
}

/**
 * What a movement is COUNTED in. Read from the exercise database's own property
 * sheet (`GymExercise.measure`), never guessed here: a hold is counted in
 * seconds and a carry in metres, and prescribing either in reps is how
 * Swimming's Hollow Body Hold came out as "4×6".
 */
export type SportMeasure = "reps" | "time" | "distance";

export interface SportBlock {
  name: string;
  demand: string;
  /** display scheme — "4×6 @ 90kg" loaded, "4×6" bodyweight, "4×30 s" a hold,
   *  "4×40 m" a carry. */
  scheme: string;
  sets: number;
  /** what the per-set quantity below is counted in. */
  measure: SportMeasure;
  /** the per-set quantity, IN `measure`: reps, seconds, or metres. */
  amount: number;
  /** Per-set reps — set only when `measure` is "reps", so a caller that reads
   *  it can never silently treat a 30-second hold as 30 repetitions. */
  reps?: number;
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

// The prescribable sports, projected from the ONE sport catalog: every catalog
// entry that carries an `sc` (S&C) block becomes an engine Sport, in catalog
// order. Each sport declares its ranked demands + a level-tagged exercise pool
// (lvl = min level index, 0 = Beginner) in its `sc` block. To add or edit a
// prescribable sport, edit its `sc` block in olympic-sports.ts — never here.
export const SPORTS: Record<string, Sport> = Object.fromEntries(
  Object.values(OLYMPIC_SPORTS)
    .filter((s) => s.sc)
    .map((s) => [
      s.name,
      { family: s.sc!.family, marker: s.sc!.marker, demands: s.sc!.demands, pool: s.sc!.pool },
    ]),
);

export const SPORT_NAMES: string[] = Object.keys(SPORTS);

// per-level dosing: fewer reps at a higher % of 1RM as the athlete advances
const LEVEL_SETS = [3, 4, 4, 5];
const LEVEL_REPS = [8, 6, 5, 3];
const LEVEL_PCT = [0.7, 0.75, 0.8, 0.85];
// A hold and a carry progress the other way — the quantity GROWS with the
// level, because there are no reps to take away.
const LEVEL_HOLD_SEC = [20, 30, 40, 45];
const LEVEL_CARRY_M = [20, 30, 40, 50];

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

  const holdSec = LEVEL_HOLD_SEC[levelIdx] ?? 30;
  const carryM = LEVEL_CARRY_M[levelIdx] ?? 30;

  let personalized = false;
  const blocks: SportBlock[] = picks.map((p) => {
    const ex = gymExercise(p.name);
    const measure: SportMeasure = ex?.measure ?? "reps";

    // A HOLD and a CARRY are prescribed as effort, not as load. The engine
    // derives a working load from an e1RM, and a movement measured in seconds
    // or metres has none it can know — blockBestE1rm returns 0 for exactly that
    // reason. Naming a percentage of a number that does not exist would be a
    // fabricated claim, so these carry the quantity and leave the load to the
    // athlete.
    if (measure === "time") {
      return {
        name: p.name, demand: p.demand, sets, measure, amount: holdSec,
        scheme: `${sets}×${holdSec} s`,
        bodyweight: ex?.loadMode === "bodyweight",
      };
    }
    if (measure === "distance") {
      return {
        name: p.name, demand: p.demand, sets, measure, amount: carryM,
        scheme: `${sets}×${carryM} m`,
        bodyweight: ex?.loadMode === "bodyweight",
      };
    }

    const logged = e1rmByLift.get(p.name);
    const baseLoad = movementFor(p.name)?.baseLoad ?? null;
    const loadable = logged != null || baseLoad != null;
    if (loadable) {
      const oneRm = logged ?? (baseLoad ?? 0) * 1.2;
      const load = Math.round((oneRm * pct) / 2.5) * 2.5;
      if (logged != null) personalized = true;
      return {
        name: p.name,
        demand: p.demand,
        sets,
        measure,
        amount: reps,
        reps,
        load,
        scheme: `${sets}×${reps} @ ${load}kg`,
        loadBasis:
          logged != null
            ? `${Math.round(pct * 100)}% of your ${Math.round(logged)}kg e1RM`
            : `starting estimate — log ${p.name} to tune this`,
      };
    }
    return { name: p.name, demand: p.demand, sets, measure, amount: reps, reps, scheme: setScheme, bodyweight: true };
  });

  return { sport, ranked, blocks, setScheme, personalized };
}
