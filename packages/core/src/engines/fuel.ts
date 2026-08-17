import type { Signal } from "./signals";
import { dailyNutrition, estimateMaintenance } from "./nutrition";
import { localTodayKey, dayKeyDiff } from "../day-key";

/**
 * ENERGY AVAILABILITY — the food log, as a training input.
 *
 * The Signal ontology has typed `energyIntake` and `protein` since the
 * nutrition engine shipped, and the adaptive-targets engine has estimated this
 * athlete's MAINTENANCE from them for just as long. Nothing downstream read
 * either. The whole nutrition column computed targets, drew rings, and stopped
 * — so an athlete four days into an aggressive cut got the same readiness
 * number and the same volume ceiling as one eating at maintenance, and the
 * app's central claim (that it owns training, recovery AND nutrition in one
 * model) was true of the screens and false of the engines.
 *
 * This module is the join. It answers one question — HOW FAR FROM MAINTENANCE
 * HAS THIS ATHLETE BEEN EATING, and with how much protein — and hands the
 * answer to the two places that should always have had it:
 *
 *   READINESS (engines/readiness.ts) takes `fuelAdjustment().points` as a
 *     signed term beside the wearable's ±15 and the heat prior's +0..3.
 *   VOLUME CEILINGS (engines/landmark-profile.ts) take `energyStateFromIntake`
 *     and `proteinGPerKg` as the recovery multiplier's nutrition inputs, in
 *     place of the bodyweight trend that used to be the ONLY path to them.
 *
 * ── WHY THE TERM IS NEVER POSITIVE ─────────────────────────────────────────
 * A deficit costs points; a surplus earns none. Under-eating measurably slows
 * tissue repair, and that is a claim with a mechanism behind it. "Ate 400 kcal
 * over maintenance, therefore more recovered than baseline" is not — it is a
 * bonus for overfeeding, and an athlete would learn to farm it within a week.
 * So this term is a COST or it is nothing, which is the exact mirror of the
 * heat prior's never-negative rule and has the same consequence: heat needs no
 * arc on the readiness ring because a credit takes none, and fuel needs one
 * ALWAYS, because a cost that cannot be drawn is a cost the ring cannot defend
 * (see readiness-deficit.ts's sum law, and the `fuel` cost kind it gained).
 *
 * ── WHY IT DOES *NOT* STAND DOWN FOR A WEARABLE ────────────────────────────
 * The heat prior zeroes itself the moment a fresh biometric read exists,
 * because if a sauna improved last night's sleep and parasympathetic tone then
 * HRV ALREADY measured it — the prior and the measurement are two accounts of
 * one night, and a measurement beats a prior.
 *
 * Energy availability is not that shape. It is not a claim about last night at
 * all: it is a claim about the substrate available for repair over the coming
 * weeks. An athlete three weeks into a controlled cut can wake with a textbook
 * HRV and still be unable to absorb the volume they absorbed in a surplus, and
 * an athlete who under-ate yesterday has a wearable that will not notice for
 * days. The wearable measures autonomic state; this measures fuel. They are
 * different quantities, so both count — and the cap is what keeps that honest:
 * `FUEL_PENALTY_MAX` is 6 against the wearable's 15, so a measurement still
 * outvotes a self-report by better than two to one.
 *
 * ── WHAT THIS CANNOT SEE, STATED RATHER THAN PAPERED OVER ──────────────────
 * Self-reported intake runs LOW. The nutrition literature puts under-reporting
 * at 10–20% in free-living adults, and nothing here can distinguish an athlete
 * who ate 2,000 kcal from one who ate 2,400 and logged 2,000. That single fact
 * decides three of the constants below: the deadband (a paper deficit under
 * 10% is the logging, not the athlete), the asymmetric surplus threshold (a
 * logged surplus is more likely to be real than a logged deficit), and the cap.
 *
 * And the maintenance estimate this is measured AGAINST is itself partly fitted
 * to logged intake (nutrition.ts: maintenance ≈ avgIntake − Δkg·7700/days), so
 * the two windows overlap. That overlap pulls maintenance TOWARD recent intake,
 * which shrinks the measured gap — the term understates a deficit and can never
 * overstate one, which is the right direction of error for something that takes
 * points off an athlete. The windows are deliberately different lengths
 * (FUEL_WINDOW_DAYS against FUEL_MAINTENANCE_DAYS) so recent intake is read
 * against a longer-run expenditure level rather than against itself, which is
 * also where this earns its keep over the scale: on day four of a cut the
 * bodyweight trend is still water and this already reads the deficit.
 *
 * Pure data + math. No UI, no I/O.
 */

const DAY = 86_400_000;

/**
 * One Signal row, as this module needs to read it.
 *
 * `kind` is a plain string rather than `SignalKind` for the same reason
 * `HeatSignalRow` types it that way: the clients' transports carry a Signal's
 * kind as whatever the server sent, and a module that demanded the narrowed
 * union would push a cast onto every call site — which is three casts on the
 * mobile app alone, each one an opportunity to widen something else by accident.
 * The narrowing happens ONCE, here, against the kinds this engine actually
 * reads.
 */
export interface FuelSignalRow {
  kind: string;
  value: number;
  ts: string | Date;
  unit?: string;
  source?: string;
  id?: string;
  athleteId?: string;
}

/** The kinds this module reads, and the only ones it passes downstream. */
const FUEL_KINDS = new Set(["energyIntake", "protein", "bodyMass"]);

/**
 * Keep only the rows this engine understands, and hand them on as `Signal`s.
 *
 * The cast is contained to this function and is safe by construction: nothing
 * survives the filter whose `kind` is not one of three literals the ontology
 * already declares, and `dailyNutrition` / `estimateMaintenance` read no other
 * field that the wider row type does not carry.
 */
function narrow(rows: FuelSignalRow[]): Signal[] {
  return rows
    .filter((r) => FUEL_KINDS.has(r.kind) && Number.isFinite(r.value))
    .map((r) => ({
      athleteId: r.athleteId ?? "",
      kind: r.kind as Signal["kind"],
      value: r.value,
      unit: r.unit ?? "",
      source: r.source ?? "manual",
      ts: typeof r.ts === "string" ? r.ts : r.ts.toISOString(),
    }));
}

/* ── THE WINDOWS, AND WHAT COUNTS AS A LOGGED DAY ──────────────────────────── */

/** How far back rolling intake is averaged. A fortnight: long enough that one
 *  unlogged Saturday does not decide it, short enough to notice a new cut. */
export const FUEL_WINDOW_DAYS = 14;

/** The window the maintenance estimate itself is fitted over. LONGER than the
 *  intake window on purpose — see the module header's circularity note. */
export const FUEL_MAINTENANCE_DAYS = 28;

/**
 * How many COMPLETED days inside the window must carry a real intake log
 * before this says anything at all.
 *
 * Five of fourteen, which is deliberately not a majority: the question is
 * whether the athlete's logging is representative, and an athlete who logs
 * weekdays and stops on Saturday is still telling us what they eat. Below it
 * the term is not small, it is ABSENT — `sufficient: false` — because the
 * failure mode of a thin log is not noise, it is a systematic understatement
 * that would read as a crash diet.
 */
export const FUEL_MIN_DAYS = 5;

/**
 * Under this many kcal a "logged" day is a FORGOTTEN day, not a fast.
 *
 * The single most damaging input this module can receive is a day where the
 * athlete logged breakfast and then got on with their life: 380 kcal against a
 * 2,700 maintenance is a 86% deficit that never happened, and three of those
 * would drag a fortnight's average into the floor. Nobody training hybrid is
 * eating 800 kcal a day for a fortnight; anything under it is a gap in the
 * record, and a gap is excluded rather than averaged in.
 */
export const FUEL_MIN_DAY_KCAL = 800;

/**
 * How old a weigh-in may be and still stand in for "what this athlete weighs".
 *
 * Body mass is the divisor on the protein figure AND the input to
 * `estimateMaintenance`'s heuristic fallback, so a stale one does not degrade
 * the read — it fabricates one. Six months is generous on purpose: weight moves
 * slowly and an athlete who weighs in twice a year is still telling us
 * something, whereas a figure from two years ago is a different person. Past it
 * the term goes ABSENT rather than confident, which is the same posture every
 * other gate here takes.
 */
export const FUEL_BODY_MASS_STALE_DAYS = 180;

/* ── THE RAMP ──────────────────────────────────────────────────────────────── */

/**
 * A shortfall inside this fraction of maintenance costs NOTHING.
 *
 * This is the under-reporting deadband, not a tolerance for under-eating: a
 * logged 8% deficit in a population that under-reports by 10–20% is most
 * plausibly an athlete eating at maintenance and forgetting the olive oil. The
 * term starts where the logging error stops being the better explanation.
 */
export const FUEL_DEADBAND_PCT = 0.1;

/** Where the cost saturates. A sustained 35% shortfall is aggressive by any
 *  published standard, and past it more deficit does not buy more penalty —
 *  the point has been made and the ring should not keep growing an arc. */
export const FUEL_SATURATION_PCT = 0.35;

/**
 * Most the term may ever cost — 6 points, against the wearable's ±15.
 *
 * The reasoning is the one in the header: this is a self-report and a wearable
 * is a measurement, so it must not out-vote one. It is worth twice the heat
 * prior's 3 because it is a fortnight of the athlete's own records rather than
 * a prior about one night, and a deep deficit has a larger and better-evidenced
 * effect on repair than a sauna has. It is an exported constant the Engine Room
 * renders live, so retuning it is one line.
 */
export const FUEL_PENALTY_MAX = 6;

/* ── THE CATEGORICAL STATE (what the volume ceilings read) ─────────────────── */

/**
 * The surplus threshold, and it is SMALLER than the deficit's on purpose.
 *
 * Both bands answer "is this athlete in energy balance", and the errors are not
 * symmetric: because logging runs low, a logged 5% surplus is very likely a
 * real surplus, while a logged 10% deficit may be no deficit at all. Making the
 * two bands equal would have meant treating the reliable direction and the
 * unreliable one as if they carried the same evidence.
 */
export const FUEL_SURPLUS_PCT = 0.05;

/* ── WHAT COMES OUT ────────────────────────────────────────────────────────── */

/** Why the read is not usable, when it isn't. A NAMED absence — the surfaces
 *  have to be able to say which thing is missing, because "log a few days" and
 *  "we can't estimate your maintenance yet" ask the athlete for different
 *  things. */
export type FuelInsufficiency =
  /** nothing logged inside the window at all */
  | "noLog"
  /** something logged, but fewer than FUEL_MIN_DAYS usable days */
  | "tooFewDays"
  /** enough intake, but the nutrition engine cannot estimate maintenance yet
   *  (no weigh-in and no bodyweight to fall back on) */
  | "noMaintenance";

export interface EnergyBalance {
  /** Completed days in the window carrying a usable intake log. */
  days: number;
  /** How many days back the window reached. */
  windowDays: number;
  /** Mean kcal across `days`, or null when there are none. */
  avgIntake: number | null;
  /** The nutrition engine's maintenance estimate, or null. */
  maintenance: number | null;
  /** Which of that engine's two paths produced it — energy balance or the
   *  bodyweight heuristic. Carried so a surface can qualify the number. */
  maintenanceBasis: string;
  /** avgIntake − maintenance, kcal/day. NEGATIVE means under-eating. */
  balanceKcal: number | null;
  /** …as a fraction of maintenance. −0.18 = eating 18% under. */
  balancePct: number | null;
  /** Mean daily protein per kg of body mass, across the usable days that
   *  logged any protein at all. Null without a body mass to divide by. */
  proteinGPerKg: number | null;
  /** How many usable days carried a protein figure. */
  proteinDays: number;
  /**
   * Whether `proteinGPerKg` may be used — a SEPARATE gate from `sufficient`.
   *
   * The two answer different questions and fail independently. Energy
   * availability needs a maintenance estimate; protein does not need one at
   * all, so an athlete the nutrition engine cannot yet estimate maintenance for
   * still has a perfectly readable protein average. Folding them into one flag
   * would throw that away for no reason.
   */
  proteinSufficient: boolean;
  /** The body mass the protein figure was divided by. */
  bodyMassKg: number | null;
  /** True when every gate above is cleared and the numbers may be used. */
  sufficient: boolean;
  /** Named reason, when `sufficient` is false. Null when it is true. */
  reason: FuelInsufficiency | null;
}

const EMPTY_BALANCE: EnergyBalance = {
  days: 0,
  windowDays: FUEL_WINDOW_DAYS,
  avgIntake: null,
  maintenance: null,
  maintenanceBasis: "not enough data",
  balanceKcal: null,
  balancePct: null,
  proteinGPerKg: null,
  proteinDays: 0,
  proteinSufficient: false,
  bodyMassKg: null,
  sufficient: false,
  reason: "noLog",
};

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** The most recent body mass still recent enough to stand for the athlete. */
function latestBodyMass(signals: Signal[], now: number): number | null {
  const oldest = now - FUEL_BODY_MASS_STALE_DAYS * DAY;
  let best: { t: number; v: number } | null = null;
  for (const s of signals) {
    if (s.kind !== "bodyMass") continue;
    const t = Date.parse(String(s.ts));
    if (!Number.isFinite(t) || t > now || t < oldest) continue;
    if (!Number.isFinite(s.value) || s.value <= 0) continue;
    if (!best || t > best.t) best = { t, v: s.value };
  }
  return best ? best.v : null;
}

/**
 * How this athlete has been eating, against their own maintenance estimate.
 *
 * TODAY IS EXCLUDED, and that is not a detail. A day in progress is a day with
 * dinner still ahead of it, so including it would report a deficit every
 * morning that resolves itself by bedtime — the term would read worst at the
 * hour the athlete most often opens the app, and would be wrong every time.
 * Only COMPLETED calendar days count.
 */
export function energyBalance(
  input: FuelSignalRow[],
  opts: { now?: number; bodyMassKg?: number; days?: number; maintenanceDays?: number } = {},
): EnergyBalance {
  const signals = narrow(input);
  const now = opts.now ?? Date.now();
  const windowDays = opts.days ?? FUEL_WINDOW_DAYS;
  const today = localTodayKey(now);
  const since = now - (windowDays + 1) * DAY;

  // Per-day totals over the window, then the two exclusions that decide
  // everything: today (incomplete by construction) and any day too thin to be
  // a record of eating rather than a record of forgetting.
  const rows = dailyNutrition(signals.filter((s) => Date.parse(String(s.ts)) >= since && Date.parse(String(s.ts)) <= now));
  const usable = rows.filter((d) => {
    if (d.date === today) return false;
    // Whole days from that day to today: 1 is yesterday. A future-stamped row
    // reads ≤ 0 and drops out with it.
    const age = dayKeyDiff(d.date, today);
    if (!Number.isFinite(age) || age <= 0 || age > windowDays) return false;
    return d.kcal >= FUEL_MIN_DAY_KCAL;
  });

  const bodyMassKg = opts.bodyMassKg ?? latestBodyMass(signals, now);

  if (usable.length === 0) {
    return { ...EMPTY_BALANCE, windowDays, bodyMassKg, reason: rows.length ? "tooFewDays" : "noLog" };
  }

  const avgIntake = Math.round(usable.reduce((a, d) => a + d.kcal, 0) / usable.length);
  const proteinRows = usable.filter((d) => d.protein > 0);
  const avgProtein = proteinRows.length
    ? proteinRows.reduce((a, d) => a + d.protein, 0) / proteinRows.length
    : null;
  const proteinGPerKg =
    avgProtein != null && bodyMassKg != null && bodyMassKg > 0
      ? Math.round((avgProtein / bodyMassKg) * 100) / 100
      : null;

  const est = estimateMaintenance(signals, {
    bodyMassKg: bodyMassKg ?? undefined,
    days: opts.maintenanceDays ?? FUEL_MAINTENANCE_DAYS,
    now,
  });

  const base: EnergyBalance = {
    days: usable.length,
    windowDays,
    avgIntake,
    maintenance: est.kcal,
    maintenanceBasis: est.basis,
    balanceKcal: null,
    balancePct: null,
    proteinGPerKg,
    proteinDays: proteinRows.length,
    proteinSufficient: proteinGPerKg != null && proteinRows.length >= FUEL_MIN_DAYS,
    bodyMassKg,
    sufficient: false,
    reason: null,
  };

  if (usable.length < FUEL_MIN_DAYS) return { ...base, reason: "tooFewDays" };
  if (est.kcal == null || est.kcal <= 0) return { ...base, reason: "noMaintenance" };

  const balanceKcal = Math.round(avgIntake - est.kcal);
  return {
    ...base,
    balanceKcal,
    balancePct: Math.round((balanceKcal / est.kcal) * 10000) / 10000,
    sufficient: true,
    reason: null,
  };
}

/* ── THE READINESS TERM ────────────────────────────────────────────────────── */

/** What the readiness term is worth today, and every figure behind it — so the
 *  Engine Room can print the substituted arithmetic rather than a total. */
export interface FuelAdjustment {
  /** −FUEL_PENALTY_MAX..0. NEVER positive — see the module header. */
  points: number;
  /** The ramp's position, 0 at the deadband and 1 at saturation. */
  severity: number;
  /** The whole read behind it, sufficient or not. */
  balance: EnergyBalance;
}

/**
 * Today's fuel cost.
 *
 * Zero whenever the log cannot support a reading — a term that is absent must
 * read as absent rather than as "eating fine", which is the same posture
 * `energyBalanceFromBodyweight` already takes by returning null instead of
 * defaulting to maintenance. `balance.reason` says which absence it was.
 */
export function fuelAdjustment(
  input: FuelSignalRow[],
  opts: { now?: number; bodyMassKg?: number; days?: number; maintenanceDays?: number } = {},
): FuelAdjustment {
  const balance = energyBalance(input, opts);
  if (!balance.sufficient || balance.balancePct == null) return { points: 0, severity: 0, balance };

  const shortfall = -balance.balancePct; // positive = eating under maintenance
  const span = FUEL_SATURATION_PCT - FUEL_DEADBAND_PCT;
  const severity = span > 0 ? clamp((shortfall - FUEL_DEADBAND_PCT) / span, 0, 1) : 0;
  const cost = Math.round(FUEL_PENALTY_MAX * severity);
  // `cost === 0` is spelled out rather than negated, because `-0` is a real
  // JavaScript value that survives arithmetic, fails `Object.is(x, 0)`, and
  // renders as "-0" on any surface that formats it.
  return { points: cost === 0 ? 0 : -cost, severity, balance };
}

/* ── THE VOLUME-CEILING TERM ───────────────────────────────────────────────── */

/**
 * Energy availability as the three-way state the landmark stack reads, from
 * LOGGED INTAKE rather than from the scale.
 *
 * Null when the log cannot support it — an unknown stays unknown rather than
 * defaulting to "maintenance", because maintenance is not a neutral answer
 * here: it silently hands back a recovery multiplier of exactly 1. The caller
 * (landmark-context.ts) falls back to the bodyweight trend on a null, which is
 * what this REPLACES AS THE ONLY PATH rather than displaces.
 */
export function energyStateFromIntake(balance: EnergyBalance): "deficit" | "maintenance" | "surplus" | null {
  if (!balance.sufficient || balance.balancePct == null) return null;
  if (balance.balancePct <= -FUEL_DEADBAND_PCT) return "deficit";
  if (balance.balancePct >= FUEL_SURPLUS_PCT) return "surplus";
  return "maintenance";
}
