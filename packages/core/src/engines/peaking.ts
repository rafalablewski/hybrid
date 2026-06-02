/**
 * Competition peaking optimizer.
 *
 * Given an event date, back-solve the periodization so the athlete's best day
 * lands ON the event (finals, not heats). Projects a fitness–fatigue–form curve
 * (Banister-style impulse response) across the plan so a coach can SEE the peak.
 * Pure; composes the periodization engine.
 */

import type { Macrocycle } from "./types";
import { buildMacrocycle } from "./periodization";

/** Whole weeks from `from` (default now) until the event (min 1). */
export function weeksUntil(eventISO: string, fromISO?: string): number {
  const from = fromISO ? new Date(fromISO) : new Date();
  const event = new Date(eventISO);
  const ms = event.getTime() - from.getTime();
  return Math.max(1, Math.ceil(ms / (7 * 24 * 60 * 60 * 1000)));
}

export interface FormPoint {
  week: number;
  phase: string;
  /** weekly training load (intensity × volume, 0..100) */
  load: number;
  /** chronic fitness (slow EMA of load) */
  fitness: number;
  /** acute fatigue (fast EMA of load) */
  fatigue: number;
  /** form / freshness = fitness − fatigue */
  form: number;
}

export interface PeakingPlan {
  sportOrGoal: string;
  weeksToEvent: number;
  macro: Macrocycle;
  series: FormPoint[];
  /** week index (1-based) of maximum projected form */
  peakWeek: number;
  formAtEvent: number;
  /** does the projected peak land on (or within a week of) the event? */
  landsPeak: boolean;
}

const TAU_FITNESS = 6; // weeks — chronic
const TAU_FATIGUE = 1.5; // weeks — acute

/**
 * Build the event-fitted macrocycle and project the fitness/fatigue/form curve.
 * Taper weeks drop volume → fatigue sheds faster than fitness → form peaks late,
 * which is exactly the intent: arrive fresh on event day.
 */
export function optimizeForEvent(sportOrGoal: string, eventISO: string, fromISO?: string): PeakingPlan {
  const weeksToEvent = weeksUntil(eventISO, fromISO);
  const macro = buildMacrocycle(sportOrGoal, weeksToEvent);

  const micros = macro.blocks
    .flatMap((b) => b.micros.map((m) => ({ ...m, phase: b.label })))
    .sort((a, b) => a.week - b.week);

  let fitness = 0;
  let fatigue = 0;
  const series: FormPoint[] = micros.map((m) => {
    const load = Math.round(m.intensity * m.volume * 100);
    fitness += (load - fitness) / TAU_FITNESS;
    fatigue += (load - fatigue) / TAU_FATIGUE;
    return {
      week: m.week,
      phase: m.phase,
      load,
      fitness: Math.round(fitness),
      fatigue: Math.round(fatigue),
      form: Math.round(fitness - fatigue),
    };
  });

  let peakWeek = series.length ? series[0]!.week : 1;
  let best = -Infinity;
  for (const p of series) {
    if (p.form > best) {
      best = p.form;
      peakWeek = p.week;
    }
  }
  const lastWeek = series.length ? series[series.length - 1]!.week : 1;
  const formAtEvent = series.length ? series[series.length - 1]!.form : 0;

  return {
    sportOrGoal,
    weeksToEvent,
    macro,
    series,
    peakWeek,
    formAtEvent,
    landsPeak: Math.abs(peakWeek - lastWeek) <= 1,
  };
}
