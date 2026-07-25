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

import { MOVEMENTS } from "./engines/movements";
import { bestE1rmByLift, type LoggedSession } from "./engines/session";
import { OLYMPIC_SPORTS, type SportMarker, type PoolExercise } from "./olympic-sports";

// ============================================================
//  Types
// ============================================================

/** The engine's view of a sport — projected from a catalog entry's `sc` block. */
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
      { icon: s.icon, family: s.sc!.family, marker: s.sc!.marker, demands: s.sc!.demands, pool: s.sc!.pool },
    ]),
);

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
    const baseLoad = MOVEMENTS[p.name]?.baseLoad ?? null;
    const loadable = logged != null || baseLoad != null;
    if (loadable) {
      const oneRm = logged ?? (baseLoad ?? 0) * 1.2;
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
