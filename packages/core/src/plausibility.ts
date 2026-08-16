/**
 * PLAUSIBILITY — what a logged number is allowed to be.
 *
 * Every figure an athlete types is one slipped finger away from nonsense: a
 * 70 000 kg bench press, a 5 200 km swim, a bodyweight of 8. None of those are
 * caught by "is it a number", which is all most of this app checked, and each
 * one poisons far more than the row it sits in — tonnage, e1RM, mileage,
 * training load, ACWR, the readiness model, the cohort norms the data network
 * sells. ONE typo can move an athlete's whole history, and a history that lies
 * is worse than one that is missing.
 *
 * TWO TIERS, and the distinction is the whole design:
 *
 *   REFUSE   Physically impossible, or a unit mix-up wearing a plausible face.
 *            Never stored. A 700 kg bench press is not a heroic lift, it is a
 *            keystroke; storing it "because the athlete said so" is how the
 *            leaderboard becomes fiction.
 *
 *   CHECK    Improbable but real. An elite lifter, a 24-hour race, a 200 kg
 *            athlete. The client ASKS; the server STORES. Refusing these would
 *            be worse than the typos: an app that cannot record an outlier is
 *            an app the best athletes cannot use, and the outliers are exactly
 *            the data worth having.
 *
 * A single threshold cannot do both jobs. Set it low and you refuse a real
 * 500 kg leg press; set it high and 70 000 kg walks through. So every field
 * declares both, and callers pick the tier their situation deserves — a write
 * path refuses, a field warns.
 *
 * THE COMPOUND CHECKS ARE THE ONES THAT EARN THEIR KEEP. Most real mistakes are
 * not a single absurd number but a plausible pair that cannot both be true:
 * 5 000 (metres) typed into a field labelled km, 10 km logged against 5 minutes,
 * 200 kg × 60 reps. Each figure passes its own bound; the combination is
 * impossible. `checkEffort` and `checkSet` are where those get caught.
 *
 * WHERE THIS RUNS: the API (the only guard that counts — a client is advice)
 * and the loggers on the way in, so the athlete is stopped at the keystroke
 * rather than after the save. Pure, no IO, fully unit-tested.
 */
import { gymExercise, loadUnitCount } from "./exercise-db";
import type { CardioDiscipline } from "./engines/session";

/** What a value is: fine, worth a question, or not storable. */
export type Plausibility = "ok" | "check" | "refuse";

/**
 * One field's bounds. `min`/`max` REFUSE outside them; `softMin`/`softMax` are
 * the "are you sure?" band inside them. A field with no soft bound is one where
 * everything storable is ordinary.
 */
export interface Bounds {
  min: number;
  max: number;
  softMin?: number;
  softMax?: number;
  /** The unit, for the message a client shows. */
  unit: string;
}

/** Judge one value against a set of bounds. Non-finite input REFUSES — a NaN
 *  reaching a stored column is the same class of problem as a 70 000 kg bench,
 *  and it propagates further. */
export function judge(value: unknown, b: Bounds): Plausibility {
  if (typeof value !== "number" || !Number.isFinite(value)) return "refuse";
  if (value < b.min || value > b.max) return "refuse";
  if (b.softMin != null && value < b.softMin) return "check";
  if (b.softMax != null && value > b.softMax) return "check";
  return "ok";
}

/** The value if it is storable, else null. The shape a sanitiser wants: an
 *  impossible figure is DROPPED, never clamped — clamping invents a number the
 *  athlete never did, and a 1 500 kg bench is no more true than a 70 000 kg one. */
export function keep(value: unknown, b: Bounds): number | null {
  return judge(value, b) === "refuse" ? null : (value as number);
}

/** Parse a typed string and judge it. Blank is `ok` — an empty field is not a
 *  wrong one, and half-logged sets are kept everywhere else in this codebase. */
export function judgeText(text: string | undefined | null, b: Bounds): Plausibility {
  const t = (text ?? "").trim();
  if (!t) return "ok";
  return judge(Number(t.replace(",", ".")), b);
}

/* ── STRENGTH ────────────────────────────────────────────────────────────── */

/**
 * THE LOAD CEILING, by what the athlete is holding.
 *
 * Refusal caps are set ABOVE the heaviest thing anyone has ever moved with that
 * implement, so the bound can only ever catch a typo:
 *
 *   barbell/machine  1500 kg — the heaviest leg press on record is ~1 170 kg,
 *                    and a loaded sled or hip-thrust bar does not approach it.
 *   dumbbell         160 kg PER BELL — the Inch dumbbell is 78 kg; gyms stop
 *                    around 60. (The field is one bell; tonnage doubles it.)
 *   kettlebell       120 kg — competition bells top out at 48.
 *   cable            400 kg — no stack is built past ~150.
 *   band             200 kg — a band's "load" is a nominal equivalent.
 *
 * The SOFT caps are roughly where a figure stops being ordinary for a strong
 * amateur, which is the point at which asking costs nothing and being wrong
 * costs a corrupted e1RM.
 */
const LOAD_BY_EQUIPMENT: Partial<Record<string, Bounds>> = {
  dumbbell: { min: 0, max: 160, softMax: 70, unit: "kg" },
  kettlebell: { min: 0, max: 120, softMax: 56, unit: "kg" },
  cable: { min: 0, max: 400, softMax: 180, unit: "kg" },
  band: { min: 0, max: 200, softMax: 100, unit: "kg" },
  medball: { min: 0, max: 100, softMax: 30, unit: "kg" },
};

/** Anything on a bar, a stack or a sled. Also the fallback for a lift the
 *  catalog has never heard of — an unknown name must not get a LOOSER bound
 *  than a known one, and this is already the loosest. */
const LOAD_DEFAULT: Bounds = { min: 0, max: 1500, softMax: 400, unit: "kg" };

/** ADDED weight on a bodyweight lift (a belt on a pull-up), or the ASSISTANCE
 *  taken off one. Both are small numbers by nature: the record weighted pull-up
 *  is ~100 kg added, and assistance cannot sensibly exceed a bodyweight. */
const LOAD_ADDED: Bounds = { min: 0, max: 300, softMax: 100, unit: "kg" };

/** What the load field of THIS exercise may hold, kg. Reads the exercise's own
 *  load mode and equipment, so the same "120" is ordinary on a barbell, worth a
 *  question on a dumbbell, and refused on a kettlebell. */
export function loadBounds(exerciseName: string): Bounds {
  const ex = gymExercise(exerciseName);
  if (ex && (ex.loadMode === "bodyweight-plus" || ex.loadMode === "assisted")) return LOAD_ADDED;
  // A bodyweight lift's load field is not shown — but a number arriving in it
  // is far likelier to be a plate on the back of a plank than a client bug, and
  // refusing it outright would delete a real log. Judged as ADDED weight.
  if (ex?.loadMode === "bodyweight") return LOAD_ADDED;
  return (ex && LOAD_BY_EQUIPMENT[ex.equipment]) ?? LOAD_DEFAULT;
}

/**
 * What the REPS field may hold — and it is not always reps. A hold logs SECONDS
 * there and a carry logs METRES (exercise-db `measure`), so one bound for all
 * three would either refuse a 90-second plank or wave through a 600-rep set.
 */
const REPS_BOUNDS: Record<string, Bounds> = {
  reps: { min: 0, max: 1000, softMax: 100, unit: "reps" },
  // A two-hour hold is not a hold, it is a forgotten timer.
  time: { min: 0, max: 7200, softMax: 600, unit: "s" },
  // A five-kilometre farmer's carry is beyond anyone; 400 m is already a lot.
  distance: { min: 0, max: 5000, softMax: 400, unit: "m" },
};

export function repsBounds(exerciseName: string): Bounds {
  return REPS_BOUNDS[gymExercise(exerciseName)?.measure ?? "reps"]!;
}

/** RPE is a 1–10 scale, full stop. There is no soft band: an 11 is not an
 *  exceptional effort, it is a mis-tap. */
export const RPE_BOUNDS: Bounds = { min: 1, max: 10, unit: "rpe" };

/** Mean concentric bar velocity, m/s. A competition snatch peaks near 2 m/s and
 *  nothing a barbell does exceeds ~4; 5 is the refusal. */
export const VELOCITY_BOUNDS: Bounds = { min: 0.01, max: 5, softMax: 2.5, unit: "m/s" };

/** Range of motion, cm. A deadlift travels ~60 cm; 250 exceeds any human limb. */
export const ROM_BOUNDS: Bounds = { min: 1, max: 250, softMax: 120, unit: "cm" };

/** Rest between sets, seconds. Two hours is not rest, it is two workouts — but
 *  it is also harmless, so it is only worth a question. */
export const REST_BOUNDS: Bounds = { min: 0, max: 7200, softMax: 900, unit: "s" };

/**
 * A whole SET, judged as a unit — because the two numbers can each be fine and
 * still be impossible together.
 *
 * 200 kg × 60 reps passes both bounds above and is a load nobody has repped
 * sixty times; it is a reps field with a load typed into it, or the reverse. The
 * check is on the implied one-rep max: if a set claims an e1RM past what the
 * implement can hold, the PAIR is wrong even though neither number is.
 */
/**
 * WHY a value is worth a question, not just that it is. The client needs this to
 * say something useful — "unusually heavy" and "faster than a world record" are
 * different problems with different fixes, and "check this" alone is a shrug.
 */
export type ConcernReason =
  | "load"
  | "reps"
  | "impliedMax"
  | "distance"
  | "duration"
  | "speed";

/** A verdict with its reason. `reason` is null only when the verdict is `ok`. */
export interface Concern {
  verdict: Plausibility;
  reason: ConcernReason | null;
}

const OK: Concern = { verdict: "ok", reason: null };

/**
 * The i18n key that EXPLAINS each reason, so both clients say the same sentence
 * and neither invents its own. The copy is deliberately specific — "check this"
 * alone is a shrug, and the athlete cannot act on a shrug; "that pace beats the
 * world record" tells them exactly which two fields to look at.
 */
export const CONCERN_KEY: Record<ConcernReason, string> = {
  load: "w.train.blocks.checkLoad",
  reps: "w.train.blocks.checkReps",
  impliedMax: "w.train.blocks.checkImpliedMax",
  distance: "w.train.blocks.checkDistance",
  duration: "w.train.blocks.checkDuration",
  speed: "w.train.blocks.checkSpeed",
};

/**
 * One set, judged, WITH the reason — see `checkSet` for the rules. Split out so
 * a UI can name what is odd about the set rather than flagging it blankly.
 */
export function inspectSet(
  exerciseName: string,
  load: string | number | undefined,
  reps: string | number | undefined,
): Concern {
  const l = toNum(load);
  const r = toNum(reps);
  const bounds = loadBounds(exerciseName);
  const lv = judge(l ?? 0, bounds);
  const rv = judge(r ?? 0, repsBounds(exerciseName));
  // The LOAD is reported first when both are odd: it is the field a mistyped
  // set is most often wrong in, and the one the athlete will look at.
  const worst = worstOf(lv, rv);
  const reason: ConcernReason = lv === worst && lv !== "ok" ? "load" : "reps";
  if (worst === "refuse") return { verdict: "refuse", reason };
  // Only rep-counted lifts have an e1RM. A 60-second hold at 40 kg is fine.
  if ((gymExercise(exerciseName)?.measure ?? "reps") !== "reps")
    return worst === "ok" ? OK : { verdict: worst, reason };
  if (l == null || r == null || l <= 0 || r <= 0)
    return worst === "ok" ? OK : { verdict: worst, reason };
  // Epley, the same estimate the engines use — one implementation of what a set
  // implies, so this can never disagree with the number the app then shows.
  const implied = l * (1 + r / 30) * loadUnitCount(exerciseName);
  // The implement's OWN ceiling, with no fudge factor: an implied max past what
  // that equipment can hold means the pair is wrong however innocent each half
  // looks. Past the soft ceiling it is a question rather than a refusal —
  // 200 kg × 60 implies 600 kg, which is absurd for a squat and not something
  // this file can call impossible without asserting physiology it has no
  // business asserting.
  if (implied > bounds.max) return { verdict: "refuse", reason: "impliedMax" };
  // The pair is what is odd here, so the reason is the pair — unless a single
  // field was ALREADY worth a question on its own, in which case naming that
  // field is the more actionable answer.
  if (bounds.softMax != null && implied > bounds.softMax)
    return { verdict: "check", reason: worst === "check" ? reason : "impliedMax" };
  return worst === "ok" ? OK : { verdict: worst, reason };
}

/** The verdict alone — the shape a write path wants. */
export function checkSet(
  exerciseName: string,
  load: string | number | undefined,
  reps: string | number | undefined,
): Plausibility {
  return inspectSet(exerciseName, load, reps).verdict;
}

/* ── ENDURANCE ───────────────────────────────────────────────────────────── */

/**
 * HOW FAR one effort can go, by discipline — and the numbers are the records,
 * not a guess.
 *
 * Refusals sit above the best 24-hour performance ever recorded in each, since
 * a single logged effort cannot beat a day of racing:
 *
 *   running   319 km (Sorokin, 24 h)         → refuse past 400
 *   walking   ~230 km (24 h race walk)       → refuse past 300
 *   cycling   ~1 026 km (24 h road)          → refuse past 1 200
 *   swimming  marathon swimming is 10 km;
 *             the longest channel swims ~50  → refuse past 100
 *   rowing    ~430 km (24 h erg)             → refuse past 500
 *   skiing    ~452 km (24 h XC)              → refuse past 500
 *
 * The soft bands are ordinary-athlete territory: past them the figure is real
 * for somebody, and worth confirming for everybody else. THE POINT IS THE
 * SWIM ROW — 5 200 typed into a km field is 5.2 km in metres, and it is the
 * single most common unit slip this app can suffer, because pool distances ARE
 * quoted in metres everywhere else in the product.
 */
const DISTANCE_BY_DISCIPLINE: Record<CardioDiscipline, Bounds> = {
  running: { min: 0.001, max: 400, softMax: 80, unit: "km" },
  walking: { min: 0.001, max: 300, softMax: 60, unit: "km" },
  cycling: { min: 0.001, max: 1200, softMax: 300, unit: "km" },
  swimming: { min: 0.001, max: 100, softMax: 15, unit: "km" },
  rowing: { min: 0.001, max: 500, softMax: 60, unit: "km" },
  skiing: { min: 0.001, max: 500, softMax: 80, unit: "km" },
  // A racket or team sport that happens to record distance covered.
  sport: { min: 0.001, max: 100, softMax: 30, unit: "km" },
  other: { min: 0.001, max: 1000, softMax: 200, unit: "km" },
};

export function distanceBounds(discipline: CardioDiscipline | undefined | null): Bounds {
  return DISTANCE_BY_DISCIPLINE[discipline ?? "other"] ?? DISTANCE_BY_DISCIPLINE.other;
}

/** Duration of one effort, minutes. A day is the refusal; six hours is where a
 *  session stops being a session for most people. */
export const MINUTES_BOUNDS: Bounds = { min: 0.1, max: 1440, softMax: 360, unit: "min" };

/** Climb, metres. Everest from sea level is 8 848; 10 000 m of ascent in one
 *  effort has been done (Everesting), so the refusal sits above it. */
export const ELEVATION_BOUNDS: Bounds = { min: 1, max: 12000, softMax: 2500, unit: "m" };

/** Mean power, watts. A track sprinter peaks near 2 500 W for seconds; a
 *  SESSION average above 500 is world-tour territory. */
export const WATTS_BOUNDS: Bounds = { min: 1, max: 2500, softMax: 500, unit: "W" };

/** Treadmill incline, percent. */
export const INCLINE_BOUNDS: Bounds = { min: 0, max: 45, softMax: 20, unit: "%" };

/** Heart-rate zone, 1–5. */
export const ZONE_BOUNDS: Bounds = { min: 1, max: 5, unit: "" };

/**
 * THE SPEED SANITY CHECK — the most valuable guard in this file.
 *
 * A distance and a duration can each be perfectly ordinary and still describe
 * something that did not happen: 10 km in 5 minutes, 500 m swum in 30 seconds,
 * 5 000 "km" cycled in an hour. Every unit slip and every mistyped clock lands
 * here, because a wrong number in either field moves the ratio out of the range
 * a human body occupies — and the ratio is the thing physiology actually bounds.
 *
 * Refusal speeds sit at or just past the WORLD RECORD instantaneous pace for
 * each discipline, so a real effort can never trip them:
 *
 *   swimming  2.4 m/s is the 50 m freestyle record pace  → refuse past 3
 *   running   12.4 m/s is Bolt's peak                    → refuse past 13
 *   walking    4.4 m/s is the 20 km race-walk record     → refuse past 6
 *   cycling   descents and paced efforts reach 30 m/s    → refuse past 35
 *   rowing     6.2 m/s is an eight's race pace           → refuse past 8
 *
 * SOFT speeds are the WORLD-RECORD pace over a middle distance — 6.4 m/s is the
 * 10 000 m record, 1.7 the 1 500 m freestyle — so anything past them is faster
 * than anyone has sustained for that long. This is where the two tiers cannot
 * be collapsed and the reason is worth stating: a 100 m sprint legitimately
 * averages 10 m/s, so the REFUSAL has to sit at sprint speed, which means it
 * cannot catch a 10 km logged at 6.7 m/s — a time nobody has ever run. The soft
 * tier is what catches that. A genuine short sprint reads `check` in return,
 * and that is the right answer: a 100 m at 10 m/s IS remarkable.
 *
 * Returns `ok` when either half is missing — half a pair proves nothing, and
 * this must never punish a half-logged effort.
 */
const SPEED_BY_DISCIPLINE: Record<CardioDiscipline, { max: number; soft: number }> = {
  swimming: { max: 3, soft: 1.75 },
  running: { max: 13, soft: 6.4 },
  walking: { max: 6, soft: 3.6 },
  cycling: { max: 35, soft: 14 },
  rowing: { max: 8, soft: 5.2 },
  skiing: { max: 35, soft: 8 },
  sport: { max: 13, soft: 8 },
  other: { max: 35, soft: 14 },
};

export function inspectEffort(input: {
  discipline?: CardioDiscipline | null;
  distanceKm?: number | null;
  /** Either seconds or minutes — whichever the caller holds. */
  seconds?: number | null;
  minutes?: number | null;
}): Concern {
  const d = input.distanceKm;
  const sec = input.seconds ?? (input.minutes != null ? input.minutes * 60 : null);
  const dv = d != null ? judge(d, distanceBounds(input.discipline)) : "ok";
  const tv = input.minutes != null ? judge(input.minutes, MINUTES_BOUNDS) : "ok";
  const worst = worstOf(dv, tv);
  const reason: ConcernReason = dv === worst && dv !== "ok" ? "distance" : "duration";
  if (worst === "refuse") return { verdict: "refuse", reason };
  if (d == null || sec == null || !(d > 0) || !(sec > 0))
    return worst === "ok" ? OK : { verdict: worst, reason };
  const speed = (d * 1000) / sec;
  const limits = SPEED_BY_DISCIPLINE[input.discipline ?? "other"] ?? SPEED_BY_DISCIPLINE.other;
  if (speed > limits.max) return { verdict: "refuse", reason: "speed" };
  // The PAIR is what is impossible, so the pair is the reason — unless one of
  // the two figures was already odd by itself, which is the better thing to say.
  if (speed > limits.soft)
    return { verdict: "check", reason: worst === "check" ? reason : "speed" };
  return worst === "ok" ? OK : { verdict: worst, reason };
}

/** The verdict alone — the shape a write path wants. */
export function checkEffort(input: {
  discipline?: CardioDiscipline | null;
  distanceKm?: number | null;
  seconds?: number | null;
  minutes?: number | null;
}): Plausibility {
  return inspectEffort(input).verdict;
}

/* ── CONDITIONING ────────────────────────────────────────────────────────── */

export const ROUNDS_BOUNDS: Bounds = { min: 1, max: 500, softMax: 60, unit: "" };
/** Work / rest intervals, seconds. */
export const INTERVAL_BOUNDS: Bounds = { min: 0, max: 7200, softMax: 1200, unit: "s" };

/* ── THE BODY ────────────────────────────────────────────────────────────── */

/**
 * Bodyweight, kg. The FLOOR is the half that was missing: every route bounded
 * the top and let 0.5 through, and a bodyweight near zero does not just look
 * odd — it silently zeroes the effective load of every pull-up, dip and
 * assisted rep the athlete has ever logged, and rewrites their whole tonnage.
 * 25 kg is below any adult and below any child using a gym app.
 */
export const BODY_MASS_BOUNDS: Bounds = { min: 25, max: 400, softMin: 40, softMax: 200, unit: "kg" };
export const BODY_FAT_BOUNDS: Bounds = { min: 1, max: 75, softMin: 3, softMax: 50, unit: "%" };
/** Tape measurements, cm. One pair of bounds for all of them: a neck and a
 *  thigh differ, but not by enough to be worth eight tables — what matters is
 *  that "30" typed in inches and "300" fat-fingered are both caught. */
export const TAPE_BOUNDS: Bounds = { min: 5, max: 250, softMax: 160, unit: "cm" };

/* ── READINESS + SIGNALS ─────────────────────────────────────────────────── */

/** HRV (SDNN), ms. Above ~300 is a measurement artefact, not a recovered
 *  athlete; below 5 is a failed read. */
export const HRV_BOUNDS: Bounds = { min: 1, max: 400, softMin: 10, softMax: 200, unit: "ms" };
/** Resting heart rate, bpm. Elite endurance athletes reach the high 20s. */
export const RESTING_HR_BOUNDS: Bounds = { min: 20, max: 150, softMin: 30, softMax: 100, unit: "bpm" };
/** Sleep, hours. A day has 24 and nobody sleeps all of it. */
export const SLEEP_BOUNDS: Bounds = { min: 0, max: 20, softMin: 2, softMax: 14, unit: "h" };

/**
 * Bounds for a Signal kind — the ontology's own atom, written by the manual
 * check-in, the HealthKit relay and every future connector alike. A kind with no
 * entry here is bounded by `SIGNAL_FALLBACK` rather than by nothing: an
 * unbounded numeric column is how a single bad connector read ends up as an
 * athlete's baseline, and a baseline is what every z-score is measured against.
 */
export const SIGNAL_BOUNDS: Record<string, Bounds> = {
  hrv: HRV_BOUNDS,
  restingHr: RESTING_HR_BOUNDS,
  sleep: SLEEP_BOUNDS,
  sleepScore: { min: 0, max: 100, unit: "score" },
  bodyMass: BODY_MASS_BOUNDS,
  bodyFat: BODY_FAT_BOUNDS,
  leanMass: { min: 15, max: 200, softMin: 30, softMax: 110, unit: "kg" },
  // WHAT THE WRIST REPORTS. Every ceiling is above the best figure ever
  // measured and every floor below the worst survivable one, so these can only
  // catch a broken read — a sensor that returns 0, a sentinel, a unit we
  // mapped wrong — never a real athlete.
  vo2Max: { min: 10, max: 100, softMin: 20, softMax: 75, unit: "ml/kg/min" },
  steps: { min: 0, max: 200_000, softMax: 40_000, unit: "count" },
  activeEnergy: { min: 0, max: 20_000, softMax: 3_000, unit: "kcal" },
  restingEnergy: { min: 500, max: 6_000, softMin: 900, softMax: 3_500, unit: "kcal" },
  exerciseMinutes: { min: 0, max: 1_440, softMax: 300, unit: "min" },
  standHours: { min: 0, max: 24, softMax: 18, unit: "h" },
  walkingHr: { min: 40, max: 200, softMin: 60, softMax: 140, unit: "bpm" },
  respiratoryRate: { min: 4, max: 40, softMin: 8, softMax: 22, unit: "br/min" },
  spo2: { min: 70, max: 100, softMin: 92, unit: "%" },
  // A wrist temperature outside this is a watch left on a radiator.
  wristTemp: { min: 25, max: 42, softMin: 32, softMax: 38.5, unit: "C" },
  heartRateRecovery: { min: 1, max: 100, softMin: 10, softMax: 70, unit: "bpm" },
  // Session load / distance figures a wearable or a team system relays.
  totalDistance: { min: 0, max: 1_200_000, softMax: 40_000, unit: "m" },
  highSpeedRunning: { min: 0, max: 100_000, softMax: 5_000, unit: "m" },
  accelLoad: { min: 0, max: 100_000, unit: "au" },
  jumpHeight: { min: 1, max: 200, softMax: 90, unit: "cm" },
  asymmetry: { min: 0, max: 100, softMax: 25, unit: "%" },
  barVelocity: VELOCITY_BOUNDS,
  bloodMarker: { min: 0, max: 100_000, unit: "" },
  sauna: { min: 1, max: 240, softMax: 60, unit: "min" },
  saunaTemp: { min: 20, max: 130, softMax: 110, unit: "C" },
  // Nutrition — per LOG ENTRY, not per day. A single food cannot carry 20 000
  // kcal, and a day that reaches it does so as many entries.
  energyIntake: { min: 0, max: 20_000, softMax: 6_000, unit: "kcal" },
  protein: { min: 0, max: 2_000, softMax: 400, unit: "g" },
  carbs: { min: 0, max: 3_000, softMax: 800, unit: "g" },
  fat: { min: 0, max: 2_000, softMax: 300, unit: "g" },
  water: { min: 0, max: 20_000, softMax: 6_000, unit: "ml" },
  satFat: { min: 0, max: 1_000, softMax: 150, unit: "g" },
  sugar: { min: 0, max: 2_000, softMax: 400, unit: "g" },
  fiber: { min: 0, max: 500, softMax: 100, unit: "g" },
  salt: { min: 0, max: 500, softMax: 30, unit: "g" },
};

/** The bound an unlisted signal kind gets. Wide enough to hold anything a real
 *  instrument reports, narrow enough that a float overflow or a sentinel value
 *  (−9999, 1e18) never lands in a baseline. */
export const SIGNAL_FALLBACK: Bounds = { min: -1_000_000, max: 1_000_000, unit: "" };

export function signalBounds(kind: string): Bounds {
  return SIGNAL_BOUNDS[kind] ?? SIGNAL_FALLBACK;
}

/* ── TRAINING MAXES ──────────────────────────────────────────────────────── */

/**
 * A typed 1RM, kg. These DRIVE PRESCRIPTION — a percent-based plan multiplies
 * this number into every working set it writes — so a mistyped max does not sit
 * in a history, it walks the athlete into a bar they cannot hold. The refusal is
 * therefore tighter than the machine-load ceiling: a barbell 1RM has never
 * exceeded 505 kg (Hafthor Björnsson's deadlift).
 */
export const PLAN_MAX_BOUNDS: Bounds = { min: 1, max: 600, softMax: 300, unit: "kg" };

/* ── helpers ─────────────────────────────────────────────────────────────── */

const ORDER: Record<Plausibility, number> = { ok: 0, check: 1, refuse: 2 };

/** The more serious of two verdicts. */
export function worstOf(a: Plausibility, b: Plausibility): Plausibility {
  return ORDER[a] >= ORDER[b] ? a : b;
}

/** A typed value → a number, or null. Accepts a comma decimal (the app ships in
 *  Polish and German, where 5,2 is how 5.2 is written). */
export function toNum(v: string | number | undefined | null): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = (v ?? "").trim();
  if (!t) return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Would accepting this KEYSTROKE put the field past its refusal bound?
 *
 * What a numeric input needs, and it is not `judge`: a field being typed into
 * passes through states that are not yet the intended value, and treating those
 * as errors makes the input fight the athlete. "7" on the way to "70" is fine;
 * what must never be accepted is a value already past the limit, because the
 * next digit only makes it worse. A caller uses this to refuse the character —
 * the digit simply does not appear, the way a maxLength behaves — and shows the
 * bound so the refusal explains itself.
 *
 * A blank field is always allowed: clearing a value is how a mistake is fixed.
 */
export function allowsTyping(next: string, b: Bounds): boolean {
  const t = next.trim();
  if (!t) return true;
  // Mid-typing states that are not yet numbers ("-", "5.", "5,") pass — they
  // resolve on the next keystroke, and rejecting them makes a decimal point
  // impossible to type.
  const n = Number(t.replace(",", "."));
  if (!Number.isFinite(n)) return /^-?\d*[.,]?\d*$/.test(t);
  return n <= b.max;
}
