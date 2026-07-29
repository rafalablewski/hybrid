/**
 * ENERGY — the calorie cost of a logged session: MEASURED when a device
 * recorded the workout, estimated from the log when nothing did.
 *
 * A watch measures energy from heart rate. When the session is matched to one
 * (see session-device.ts) that measurement IS the session's energy — the model
 * below doesn't get a vote, and the figure stops wearing the "~" that marks an
 * estimate. Without a device, the ONLY honest thing left is to estimate it from
 * what the athlete actually logged —
 * activity, duration, and (when present) pace or RPE — and say out loud that
 * it's an estimate. That's what this module does, using the standard MET model
 * from the Compendium of Physical Activities (Ainsworth et al., 2011):
 *
 *     kcal = MET × 3.5 × bodyweight(kg) / 200 × minutes
 *
 * Two rules keep it honest, in the spirit of done-receipt.ts:
 *  1. NO BODYWEIGHT, NO NUMBER. The formula is linear in mass — inventing a
 *     "typical 70 kg athlete" would be inventing the answer. Returns null, and
 *     the client asks for a bodyweight instead.
 *  2. THE BASIS IS CARRIED, NOT HIDDEN. `basis` says what the estimate leant on
 *     — a measured pace ("pace") is a far better input than a bare duration
 *     ("duration") — so the UI can label a weak estimate as weak and point at
 *     the thing that would fix it (connect a device).
 *
 * This is gross energy expenditure (the convention every consumer app uses),
 * not net-of-resting.
 */
import type { SessionBlock, CardioBlock, StrengthBlock, ConditioningBlock, LoggedSession, CardioDiscipline } from "./engines/session";
import { cardioDiscipline } from "./engines/session";
import { olympicSport } from "./olympic-sports";

/** What the figure leant on, strongest → weakest. "device" is not an estimate
 *  at all — it's the wearable's own measurement, which outranks every model
 *  input below it. */
export type EnergyBasis = "device" | "pace" | "rpe" | "sport" | "duration";

export interface EnergyEstimate {
  /** gross energy cost, kcal — measured when `basis` is "device", else the
   *  model's estimate (rounded to 5 for anything ≥ 100 — the model isn't
   *  precise to the calorie and shouldn't pretend to be). */
  kcal: number;
  /** the strongest input the figure could use across the session's blocks. */
  basis: EnergyBasis;
  /** MET-minutes — the intensity × time product behind the number, and a
   *  bodyweight-free training-load figure in its own right. 0 when a measured
   *  reading carries no intensity and none can be derived. */
  metMinutes: number;
  /** minutes of activity the figure covers. */
  minutes: number;
  /** true when a device measured this energy — the UI must NOT mark it as an
   *  estimate (no "~"), because it isn't one. */
  measured: boolean;
}

// ---------------------------------------------------------------------------
// MET tables. Values are Compendium of Physical Activities (2011) codes, picked
// at the "trained athlete doing a real session" end of each range rather than
// the recreational one, since everything here was deliberately logged as
// training. Where the Compendium gives a wide band the conservative value wins.
// ---------------------------------------------------------------------------

/** Per-sport METs for the sports that track no distance (a pace would be a
 *  better input, but these sports don't have one). Names match the sport
 *  catalog in olympic-sports.ts. */
const SPORT_MET: Record<string, number> = {
  // Combat
  Boxing: 10.0, BJJ: 10.3, Judo: 10.3, Karate: 10.3, Taekwondo: 10.3, Wrestling: 10.3, Fencing: 6.0,
  // Racket
  Tennis: 7.3, "Table Tennis": 4.0, Badminton: 5.5, Squash: 7.3,
  // Team
  Football: 7.0, Basketball: 8.0, Volleyball: 4.0, "Beach Volleyball": 8.0, Handball: 12.0,
  "Field Hockey": 7.8, "Rugby Sevens": 8.3, Baseball: 5.0, Softball: 5.0, "Water Polo": 10.0,
  "Ice Hockey": 8.0,
  // Gymnastics / artistic
  "Artistic Gymnastics": 4.0, "Rhythmic Gymnastics": 4.0, Trampoline: 3.5, Breaking: 8.0,
  "Figure Skating": 7.5, "Artistic Swimming": 8.0, Diving: 3.0,
  // Target / precision
  Archery: 3.5, Shooting: 2.5, Golf: 4.8, Curling: 4.0, Equestrian: 5.5, Sailing: 3.0,
  // Outdoor / board
  Climbing: 8.0, Skateboarding: 5.0, Surfing: 3.0, Snowboarding: 5.3,
  // Strength / mixed
  Weightlifting: 6.0, "Track & Field": 6.0, Triathlon: 10.0, "Modern Pentathlon": 8.0,
  // Winter
  "Alpine Skiing": 6.8, "Freestyle Skiing": 7.0, "Ski Jumping": 7.0, Biathlon: 9.0,
  "Speed Skating": 13.3, "Short Track": 13.3, Bobsleigh: 7.0, Luge: 7.0, Skeleton: 7.0,
};

/** Fallback METs by sport CATEGORY, for a catalog sport with no explicit entry. */
const CATEGORY_MET: Record<string, number> = {
  Athletics: 8.0, Aquatics: 7.0, Cycling: 8.0, Combat: 10.0, Racket: 6.5, Team: 7.0,
  Gymnastics: 4.0, Target: 3.0, Outdoor: 5.0, Strength: 6.0, Winter: 7.0, Multisport: 9.0,
};

/** A generic effort with no sport, no pace and no RPE — brisk-but-unremarkable. */
const GENERIC_CARDIO_MET = 6.0;
/** Resistance training: Compendium 3.5 (light/moderate) … 6.0 (vigorous). A
 *  logged gym session with no RPE sits between the two. */
const STRENGTH_MET = 5.0;
/** Circuit / metcon conditioning — Compendium "circuit training, general". */
const CONDITIONING_MET = 8.0;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * RPE → an intensity multiplier on a base MET. RPE 6 is the neutral point (the
 * effort the table values describe); each point moves the estimate 6%, capped
 * at ±30% so a single subjective number can never dominate the model.
 */
export function rpeFactor(rpe: number | undefined | null): number {
  if (typeof rpe !== "number" || !Number.isFinite(rpe) || rpe <= 0) return 1;
  return clamp(1 + (rpe - 6) * 0.06, 0.7, 1.3);
}

/**
 * METs for running at a given speed, from the ACSM running equation
 * (VO2 = 3.5 + 0.2 × m/min, plus 0.9 × m/min × grade for incline).
 */
export function runningMet(kmh: number, gradePct = 0): number {
  const mPerMin = (kmh * 1000) / 60;
  const grade = clamp(gradePct, 0, 25) / 100;
  const vo2 = 3.5 + 0.2 * mPerMin + 0.9 * mPerMin * grade;
  return clamp(vo2 / 3.5, 2, 23);
}

/** METs for walking/hiking, from the ACSM walking equation. */
export function walkingMet(kmh: number, gradePct = 0): number {
  const mPerMin = (kmh * 1000) / 60;
  const grade = clamp(gradePct, 0, 25) / 100;
  const vo2 = 3.5 + 0.1 * mPerMin + 1.8 * mPerMin * grade;
  return clamp(vo2 / 3.5, 2, 14);
}

/** METs for cycling, from the Compendium's speed bands. */
export function cyclingMet(kmh: number): number {
  if (kmh < 16) return 4.0;
  if (kmh < 19) return 6.8;
  if (kmh < 22) return 8.0;
  if (kmh < 25) return 10.0;
  if (kmh < 30) return 12.0;
  return 15.8;
}

/** METs for swimming, banded by pace per 100 m (the unit swimmers think in). */
export function swimmingMet(secPer100m: number): number {
  if (secPer100m > 150) return 6.0;
  if (secPer100m > 120) return 8.3;
  if (secPer100m > 100) return 9.5;
  if (secPer100m > 85) return 10.5;
  return 11.8;
}

/** METs for rowing/paddling, banded by pace per 500 m. */
export function rowingMet(secPer500m: number): number {
  if (secPer500m > 150) return 4.8;
  if (secPer500m > 135) return 7.0;
  if (secPer500m > 120) return 8.5;
  if (secPer500m > 105) return 10.5;
  return 12.0;
}

/** METs for cross-country skiing / skating, banded by speed. */
export function skiingMet(kmh: number): number {
  if (kmh < 6) return 6.8;
  if (kmh < 8) return 9.0;
  if (kmh < 13) return 12.5;
  return 15.0;
}

/** The base METs the sport catalog implies for a named activity (no pace). */
export function sportMet(name: string): number | null {
  const explicit = SPORT_MET[name];
  if (explicit) return explicit;
  const sport = olympicSport(name);
  if (sport) return CATEGORY_MET[sport.category] ?? GENERIC_CARDIO_MET;
  return null;
}

/** The MET + basis for one cardio block. Pace wins when distance AND minutes
 *  are both logged; otherwise the sport table, then RPE, then a generic guess. */
function cardioMet(b: CardioBlock): { met: number; basis: EnergyBasis } {
  const minutes = b.minutes ?? 0;
  const km = b.distance ?? 0;
  const discipline: CardioDiscipline = b.discipline ?? cardioDiscipline(b.name);
  if (minutes > 0 && km > 0) {
    const kmh = (km / minutes) * 60;
    const secPerKm = (minutes * 60) / km;
    switch (discipline) {
      case "running":
        return { met: runningMet(kmh, b.incline ?? 0), basis: "pace" };
      case "walking":
        return { met: walkingMet(kmh, b.incline ?? 0), basis: "pace" };
      case "cycling":
        return { met: cyclingMet(kmh), basis: "pace" };
      case "swimming":
        return { met: swimmingMet(secPerKm / 10), basis: "pace" };
      case "rowing":
        return { met: rowingMet(secPerKm / 2), basis: "pace" };
      case "skiing":
        return { met: skiingMet(kmh), basis: "pace" };
      default:
        break;
    }
  }
  const catalog = sportMet(b.name);
  if (catalog != null) return { met: catalog * rpeFactor(b.rpe), basis: b.rpe ? "rpe" : "sport" };
  return { met: GENERIC_CARDIO_MET * rpeFactor(b.rpe), basis: b.rpe ? "rpe" : "duration" };
}

/** The MET + basis for a conditioning (interval/metcon) block. */
function conditioningMet(b: ConditioningBlock): { met: number; basis: EnergyBasis } {
  return { met: CONDITIONING_MET * rpeFactor(b.rpe), basis: b.rpe ? "rpe" : "duration" };
}

/** Peak working-set RPE in a strength block, or undefined when none is logged. */
function blockRpe(b: StrengthBlock): number | undefined {
  let top = 0;
  for (const s of b.sets) {
    const r = parseFloat(s.rpe ?? "");
    if (Number.isFinite(r)) top = Math.max(top, r);
  }
  return top > 0 ? top : undefined;
}

const BASIS_RANK: Record<EnergyBasis, number> = { device: 4, pace: 3, rpe: 2, sport: 1, duration: 0 };

/**
 * Minutes attributable to a block for the energy model. Cardio/conditioning
 * blocks carry their own; strength blocks don't, so the caller passes the
 * session's leftover wall-clock time to spread across them.
 */
function blockMinutes(b: SessionBlock): number | null {
  if (b.kind === "cardio" || b.kind === "conditioning") return b.minutes && b.minutes > 0 ? b.minutes : null;
  return null;
}

/**
 * Estimate the energy cost of a logged session.
 *
 * `strengthMinutes` is the gym time to attribute to the strength blocks — the
 * caller passes the session's trusted duration MINUS the minutes the cardio and
 * conditioning blocks already account for (see doneReceipt for what "trusted"
 * means). Pass 0 and only the logged cardio/conditioning is counted.
 *
 * Returns null when there is nothing honest to say: no bodyweight, or no
 * minutes anywhere in the session.
 */
export function estimateSessionEnergy(
  blocks: SessionBlock[],
  opts: { bodyweightKg?: number | null; strengthMinutes?: number },
): EnergyEstimate | null {
  const kg = opts.bodyweightKg;
  if (kg == null || !(kg > 0)) return null;

  let metMinutes = 0;
  let minutes = 0;
  let basis: EnergyBasis | null = null;
  const note = (b: EnergyBasis) => {
    if (basis == null || BASIS_RANK[b] > BASIS_RANK[basis]) basis = b;
  };

  const strengthBlocks: StrengthBlock[] = [];
  for (const b of blocks) {
    if (b.kind === "strength") {
      if (b.sets.length) strengthBlocks.push(b);
      continue;
    }
    const min = blockMinutes(b);
    if (min == null) continue;
    const { met, basis: bs } = b.kind === "cardio" ? cardioMet(b) : conditioningMet(b);
    metMinutes += met * min;
    minutes += min;
    note(bs);
  }

  // Gym work: split the leftover session time evenly across the lifted blocks,
  // each at its own RPE-adjusted intensity. Even splitting is a simplification,
  // but the alternative (guessing set durations) invents data.
  const gymMin = Math.max(0, opts.strengthMinutes ?? 0);
  if (strengthBlocks.length > 0 && gymMin > 0) {
    const per = gymMin / strengthBlocks.length;
    for (const b of strengthBlocks) {
      const rpe = blockRpe(b);
      metMinutes += STRENGTH_MET * rpeFactor(rpe) * per;
      note(rpe ? "rpe" : "duration");
    }
    minutes += gymMin;
  }

  if (!(minutes > 0) || !(metMinutes > 0)) return null;

  const raw = (metMinutes * 3.5 * kg) / 200;
  const kcal = raw >= 100 ? Math.round(raw / 5) * 5 : Math.round(raw);
  return {
    kcal,
    basis: basis ?? "duration",
    metMinutes: Math.round(metMinutes),
    minutes: Math.round(minutes),
    measured: false,
  };
}

/**
 * The energy a matched device measured for this session, or null when the
 * session isn't matched (or the recording carried no energy).
 *
 * MET-minutes come from the device's own average METs when it reported them —
 * a measured intensity — and are otherwise inverted back out of the measured
 * kcal at the athlete's bodyweight, so the intensity figure stays consistent
 * with the calories beside it. With neither, it degrades to 0 rather than
 * inventing an intensity.
 *
 * Unlike the model, this needs NO bodyweight: the device already weighed the
 * effort, so the "no bodyweight, no number" rule doesn't apply.
 */
function measuredEnergy(session: LoggedSession, bodyweightKg?: number | null): EnergyEstimate | null {
  const d = session.device;
  if (!d || d.kcal == null || !(d.kcal > 0)) return null;
  const minutes = d.durationMin > 0 ? d.durationMin : 0;
  const kg = bodyweightKg != null && bodyweightKg > 0 ? bodyweightKg : null;
  const metMinutes =
    d.avgMets != null && d.avgMets > 0 && minutes > 0
      ? Math.round(d.avgMets * minutes)
      : kg != null
        ? Math.round((d.kcal * 200) / (3.5 * kg))
        : 0;
  return { kcal: Math.round(d.kcal), basis: "device", metMinutes, minutes, measured: true };
}

/**
 * The convenience wrapper for a whole LoggedSession: the DEVICE's measured
 * energy when the session is matched to one, else the model — working out how
 * much of the trusted duration the cardio/conditioning blocks already claim and
 * handing the remainder to the strength blocks.
 *
 * `ignoreDevice` forces the model even on a matched session; the summary's
 * logged-vs-measured panel is the one caller that wants that.
 */
export function sessionEnergy(
  session: LoggedSession,
  opts: { bodyweightKg?: number | null; durationMin?: number | null; ignoreDevice?: boolean },
): EnergyEstimate | null {
  if (!opts.ignoreDevice) {
    const measured = measuredEnergy(session, opts.bodyweightKg);
    if (measured) return measured;
  }
  let logged = 0;
  for (const b of session.blocks)
    if ((b.kind === "cardio" || b.kind === "conditioning") && b.minutes && b.minutes > 0) logged += b.minutes;
  const total = opts.durationMin ?? 0;
  return estimateSessionEnergy(session.blocks, {
    bodyweightKg: opts.bodyweightKg,
    strengthMinutes: Math.max(0, total - logged),
  });
}
