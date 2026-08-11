import type { Biometrics } from "./types";

/**
 * HEAT EXPOSURE — sauna, as a recovery input.
 *
 * NO DEVICE WILL EVER MEASURE THIS. A watch does not know you sat in a sauna
 * and nothing in the room reports to us, so the entire input is two numbers the
 * athlete TYPES: how long, and how hot. That is not a gap waiting for a sensor;
 * it is the fact that decides the whole shape of this module.
 *
 * ── WHY THERE IS A SUPPRESSION RULE ────────────────────────────────────────
 * If sauna improves sleep quality and parasympathetic tone, `biometricAdjustment`
 * ALREADY credits it — at ±15 points, read from HRV, resting HR and sleep
 * against the athlete's own baseline. On the mornings it matters, that is not a
 * proxy for the effect; it IS the effect. So a flat "+3 because you saunaed"
 * counts one night of physiology twice, and on a bad dose (long, hot, straight
 * after a hard session — which suppresses overnight HRV) it credits the sauna
 * while the wearable correctly debits it, and the athlete watches two terms on
 * one card argue about one night.
 *
 * Heat is therefore a PRIOR and the wearable is a MEASUREMENT, and a
 * measurement beats a prior: with a fresh biometric read the credit is exactly
 * zero, and `suppressed` says so, so the card can state the rule rather than
 * silently rounding to nothing. This is the same posture `BIOMETRIC_FRESH_DAYS`
 * already takes ("no measurement, no adjustment") and the same
 * prior-corrected-by-observation move `landmark-adapt.ts` makes.
 *
 * A typed number is still allowed to count — the app runs on self-reports (RPE,
 * the post-session feel, the check-in, every gram of logged food). Heat is just
 * the one recovery input that will never graduate out of that tier, which is
 * why the suppression rule is a permanent shape rather than a stopgap.
 *
 * ── WHY TEMPERATURE IS HALF THE INPUT ──────────────────────────────────────
 * Duration alone is not the dose. Twenty minutes at 90 °C and twenty minutes in
 * a 55 °C infrared cabin are not the same stimulus, and a model that reads only
 * the clock scores them identically. `heatIntensity` converts minutes into
 * EQUIVALENT MINUTES at a stated reference, and everything downstream — the
 * saturating curve, the cap, the decay — is unchanged and now takes an honest
 * input.
 *
 * WHAT AIR TEMPERATURE CANNOT SEE: humidity. A steam room at 45 °C and 100%
 * humidity blocks evaporative cooling and produces real thermal strain, and
 * this model scores it zero; infrared is under-read for a related reason. Both
 * are honest limitations of reading one number, and neither is worth papering
 * over with an invented humidity term — the fix, if it is ever needed, is a
 * protocol tag on the entry (`source: "sauna:infrared"`), not a fudge factor.
 *
 * ── NO NEGATIVE TERM ───────────────────────────────────────────────────────
 * The overdose case is real and unmeasurable from a typed duration, and the
 * wearable measures its consequence the next morning anyway. Putting a cost on
 * the readiness ring for something the engine is guessing at would satisfy the
 * sum law's arithmetic while violating its point. So `points` is never
 * negative, which is also why `readinessDeficit` needs no new cost kind: a
 * positive credit takes no arc, exactly as a positive `bioAdj` takes none.
 *
 * Pure data + math. No UI, no I/O.
 */

/** One Signal row, as this module needs to read it. `id` is optional so a caller
 *  that has not selected it (the engines) still type-checks; the diary-style
 *  surfaces that need to DELETE a sitting pass it. */
export interface HeatSignalRow {
  id?: string;
  kind: string;
  value: number;
  source: string;
  ts: string | Date;
}

/* ── THE TEMPERATURE MODEL ─────────────────────────────────────────────────── */

/** Below this a room is warm, not thermally stressful — a hot shower earns
 *  nothing. */
export const HEAT_FLOOR_C = 45;

/** The anchor: the low end of a traditional Finnish sauna, and the temperature
 *  at which an equivalent minute IS a minute. */
export const HEAT_REF_C = 80;

/** Ceiling on the intensity multiplier, reached at 101 °C. It exists so a
 *  mistyped 150 cannot manufacture a dose nobody sat through. */
export const HEAT_INTENSITY_MAX = 1.6;

/**
 * Plausible typed temperatures. A value outside this is REJECTED at the API
 * rather than clamped quietly: 900 is a typo, and a typo should bounce rather
 * than silently become 120 and score as the hottest sauna in the world.
 */
export const HEAT_TEMP_BOUNDS: readonly [number, number] = [40, 120];

/** Plausible typed durations, same reasoning. */
export const HEAT_MINUTES_BOUNDS: readonly [number, number] = [1, 180];

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * Air temperature → dose multiplier. Zero at and below the floor, 1.00 at the
 * reference, clamped at `HEAT_INTENSITY_MAX`.
 *
 * Linear on purpose. Thermal strain does not really rise linearly with air
 * temperature, but a piecewise-linear ramp between two STATED anchors is a
 * claim the console can render and an athlete can argue with, and an
 * exponential fitted to nothing would only be false precision wearing a
 * curve. Phase 4 replaces the whole thing with the athlete's measured delta.
 */
export function heatIntensity(tempC: number): number {
  if (!Number.isFinite(tempC)) return 0;
  return clamp((tempC - HEAT_FLOOR_C) / (HEAT_REF_C - HEAT_FLOOR_C), 0, HEAT_INTENSITY_MAX);
}

/* ── THE DOSE MODEL ────────────────────────────────────────────────────────── */

/** Most the prior may ever be worth — one fifth of the wearable's ±15. A prior
 *  must not out-vote a measurement even when the measurement is absent. */
export const HEAT_CREDIT_MAX = 3;

/** Saturation constant, in EQUIVALENT minutes: an hour is not twice a half
 *  hour. Ten equivalent minutes earns about half the cap. */
export const HEAT_TAU_MIN = 15;

/** Last night's sauna is mostly spent by tonight. Same idiom as the fatigue
 *  engine's two-day half-life. */
export const HEAT_HALF_LIFE_H = 18;

/** Beyond this it is a habit, not a statement about today — and habits are the
 *  chronic channel (`heatWeeklyFrequency`). */
export const HEAT_WINDOW_H = 48;

/** A sitting counts toward the weekly FREQUENCY only once it clears this many
 *  equivalent minutes. Five minutes in a cool cabin is not a fourth session. */
export const HEAT_SESSION_MIN_EQUIV = 10;

/** How far back the frequency tier averages. */
export const HEAT_FREQUENCY_WEEKS = 4;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/* ── REGROUPING TWO SIGNALS BACK INTO ONE SITTING ──────────────────────────── */

/**
 * One recorded sitting, rebuilt from the rows it was written as.
 *
 * A Signal carries exactly one number and a sitting is two, so a save writes
 * `sauna` (minutes) and `saunaTemp` (°C) at an IDENTICAL timestamp. That is not
 * a new pattern: `derivedFoodEntries` already reassembles the up-to-eight rows
 * one logged food writes by grouping on (exact ts, source), with a composite id
 * so deleting the entry removes every row it wrote. This is the same idiom with
 * two rows instead of eight.
 */
export interface HeatSitting {
  /** ISO of the sitting — the exact instant both rows share. */
  ts: string;
  minutes: number;
  tempC: number;
  /**
   * True when no `saunaTemp` row existed and the reference was assumed.
   *
   * An entry written before the field existed, or one where the athlete
   * genuinely did not know, still counts — at `HEAT_REF_C` — but it is MARKED
   * rather than silently presented as a measurement. Same distinction
   * `BiometricMetric.measured` draws, and for the same reason: a stated
   * assumption can be argued with, an invisible one cannot.
   */
  assumedTemp: boolean;
  /** minutes × heatIntensity(tempC). */
  equivMin: number;
  /** The Signal ids this sitting owns, so a delete can remove both. */
  ids: string[];
}

const iso = (ts: string | Date): string => (typeof ts === "string" ? ts : ts.toISOString());

/**
 * Group `sauna` / `saunaTemp` Signals into sittings, newest first.
 *
 * A `saunaTemp` with no `sauna` beside it is DROPPED, not treated as a
 * zero-minute sitting: a temperature on its own records nothing that happened.
 */
export function heatSittings(signals: HeatSignalRow[]): HeatSitting[] {
  type Group = { ts: string; minutes: number; tempC: number | null; ids: string[] };
  const groups = new Map<string, Group>();
  for (const s of signals) {
    if (s.kind !== "sauna" && s.kind !== "saunaTemp") continue;
    if (!Number.isFinite(s.value)) continue;
    const ts = iso(s.ts);
    if (!Number.isFinite(Date.parse(ts))) continue;
    const key = `${ts}|${s.source}`;
    let g = groups.get(key);
    if (!g) { g = { ts, minutes: 0, tempC: null, ids: [] }; groups.set(key, g); }
    if (s.id) g.ids.push(s.id);
    if (s.kind === "sauna") g.minutes += s.value;
    // Two temperature rows at one instant is not a thing a save can produce;
    // if it somehow happens, the last one wins rather than being summed into a
    // temperature nobody sat in.
    else g.tempC = s.value;
  }
  const out: HeatSitting[] = [];
  for (const g of groups.values()) {
    if (g.minutes <= 0) continue;
    const assumedTemp = g.tempC == null;
    const tempC = g.tempC ?? HEAT_REF_C;
    out.push({
      ts: g.ts,
      minutes: g.minutes,
      tempC,
      assumedTemp,
      equivMin: g.minutes * heatIntensity(tempC),
      ids: g.ids.slice().sort(),
    });
  }
  return out.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
}

/* ── THE ACUTE CREDIT ──────────────────────────────────────────────────────── */

/** What the readiness term is worth today, and every figure behind it — so the
 *  Engine Room can print the substituted arithmetic rather than a total. */
export interface HeatAdjustment {
  /** 0..HEAT_CREDIT_MAX. Never negative — see the module header. */
  points: number;
  /** Equivalent minutes inside the window. */
  equivMin: number;
  /** Raw typed minutes inside the window, for the copy that quotes them back. */
  minutes: number;
  /** The saturating dose before decay. */
  dose: number;
  /** The decay factor applied to it. */
  decay: number;
  /** Hours since the most recent sitting, or null when there is none. */
  hoursSince: number | null;
  /** Sittings inside the window, newest first. */
  sittings: HeatSitting[];
  /**
   * True when a fresh wearable reading zeroed the credit. The card must SAY
   * this — a silently zeroed term is indistinguishable from a term that was
   * never computed, and the rule is the whole design.
   */
  suppressed: boolean;
  /** True when any contributing sitting had its temperature assumed. */
  assumed: boolean;
}

const EMPTY: HeatAdjustment = {
  points: 0, equivMin: 0, minutes: 0, dose: 0, decay: 0,
  hoursSince: null, sittings: [], suppressed: false, assumed: false,
};

/**
 * Today's heat credit.
 *
 * Pass `bio` — the SAME `Biometrics | undefined` readiness itself receives, so
 * the suppression rule can never disagree with the wearable term it defers to.
 */
export function heatAdjustment(
  signals: HeatSignalRow[],
  opts: { now?: number; bio?: Biometrics } = {},
): HeatAdjustment {
  const now = opts.now ?? Date.now();
  const sittings = heatSittings(signals).filter((s) => {
    const t = Date.parse(s.ts);
    return t <= now && now - t <= HEAT_WINDOW_H * HOUR_MS;
  });
  if (sittings.length === 0) return { ...EMPTY, suppressed: false };

  const equivMin = sittings.reduce((a, s) => a + s.equivMin, 0);
  const minutes = sittings.reduce((a, s) => a + s.minutes, 0);
  const hoursSince = (now - Date.parse(sittings[0]!.ts)) / HOUR_MS;

  const dose = HEAT_CREDIT_MAX * (1 - Math.exp(-equivMin / HEAT_TAU_MIN));
  const decay = Math.pow(0.5, hoursSince / HEAT_HALF_LIFE_H);
  const suppressed = !!opts.bio;

  return {
    points: suppressed ? 0 : Math.round(dose * decay),
    equivMin,
    minutes,
    dose,
    decay,
    hoursSince,
    sittings,
    suppressed,
    assumed: sittings.some((s) => s.assumedTemp),
  };
}

/* ── THE CHRONIC CHANNEL ───────────────────────────────────────────────────── */

/**
 * Sittings per week, averaged over `HEAT_FREQUENCY_WEEKS`.
 *
 * Counted in SITTINGS rather than equivalent minutes because sessions-per-week
 * is what the cohort evidence is actually expressed in — but a sitting only
 * counts once it clears `HEAT_SESSION_MIN_EQUIV`, so a token five minutes in a
 * cool cabin cannot inflate a frequency tier.
 *
 * Feeds `AthleteVolumeProfile.heat`. DERIVED, never asked: the athlete has
 * already told us by logging, and a profile question would be a worse copy of
 * an answer we hold.
 */
export function heatWeeklyFrequency(signals: HeatSignalRow[], now: number = Date.now()): number {
  const since = now - HEAT_FREQUENCY_WEEKS * 7 * DAY_MS;
  const n = heatSittings(signals).filter((s) => {
    const t = Date.parse(s.ts);
    return t > since && t <= now && s.equivMin >= HEAT_SESSION_MIN_EQUIV;
  }).length;
  return n / HEAT_FREQUENCY_WEEKS;
}
