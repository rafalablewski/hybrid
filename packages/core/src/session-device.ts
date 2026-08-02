// Device-workout match — the shared primitives behind linking a logged Session
// to the SAME workout tracked on a wearable (today: Apple Watch via HealthKit).
//
// The athlete logs "Tennis, 60 min" in HYBRID while the watch records the real
// thing — measured calories, heart rate, precise moving time. Matching attaches
// the watch's read to the session (Session.device, one JSON column).
//
// THE MEASUREMENT WINS. Once a session is matched, the device's read IS the
// session's duration / energy / distance / climb everywhere in the app — the
// summary hero, the week + logbook rails, the training-load model, the
// nutrition fuel bump. What the athlete typed in stays as the SECONDARY
// reading, shown only on the summary's comparison panel (logged next to
// measured). A wrist strap measuring heart rate beats a number typed from
// memory, so nothing downstream should ever prefer the typed one. The rule
// itself lives in done-receipt.ts (`durationMin`, `distanceKm`, `elevationM`)
// and energy.ts (`kcal`); both take an `ignoreDevice` escape hatch used by
// exactly one caller — the comparison panel, which needs the logged column.
//
// ONE source of truth for both clients: the stored shape, the API sanitisation,
// the candidate ranking (which device workout is probably THIS session), the
// device's display name and the comparison rows the summary panel renders.
// Pure + unit-tested; nothing here touches HealthKit — the native read lives in
// apps/mobile/lib/healthkit.ts and only the phone can perform a match (web
// renders the result and can unlink).

import { sportDistanceUnit, sportPacePerMeters, displaySportDistance } from "./olympic-sports";

/** A workout as read from the athlete's device, frozen at match time. Stored
 *  verbatim on Session.device — deliberately self-contained (label, not an HK
 *  enum; ISO strings, not Dates) so the web client renders it with no HealthKit
 *  knowledge and a later provider (Garmin, WHOOP) can fill the same shape. */
export interface DeviceWorkout {
  /** Which connector the read came from — "apple" today. */
  provider: string;
  /** The device store's stable id for the workout (HKObject uuid) — lets a
   *  re-match recognise the already-linked row. */
  uuid: string;
  /** Human activity name ("Tennis", "Functional Strength Training") — resolved
   *  on-device at match time so no client needs the provider's enum. */
  activityLabel: string;
  /** Workout interval, ISO. */
  start: string;
  end: string;
  /** Measured moving time, whole minutes. */
  durationMin: number;
  /** The SAME moving time to the second, when the device reports it. Kept
   *  alongside `durationMin` (which every engine reads) purely so derived rates
   *  match the device's own summary: a 510 m swim in 19:41 paces 3:52 /100m,
   *  but rounded to 20 min it would read 3:55 — a visible disagreement on the
   *  one panel whose job is to sit next to the watch. Display stays minutes. */
  durationSec?: number;
  /** Measured active energy, kcal. */
  kcal?: number;
  /** Measured distance, km. */
  distanceKm?: number;
  /** Mean / peak / floor heart rate over the workout, bpm. */
  avgHr?: number;
  maxHr?: number;
  minHr?: number;
  /** Steps taken during the workout. */
  steps?: number;
  /** Elevation ascended, metres. */
  elevationM?: number;
  /** Swimming strokes / flights climbed — the workout's own totals. */
  strokes?: number;
  flights?: number;
  /** The device's own intensity read (average METs over the workout). */
  avgMets?: number;
  /** Indoor session, when the device says. */
  indoor?: boolean;
  /** Outdoor temperature at the workout, °C. */
  tempC?: number;
  /** The DEVICE that recorded it, as the athlete would name it ("Apple Watch",
   *  "Rafał's Apple Watch") — resolved on-device at match time. Read it through
   *  `deviceSourceLabel`, never raw: rows matched before the native read was
   *  fixed carry the bridge's class name instead of a device name. */
  source?: string;
  /** When the athlete confirmed the match (ISO) — server-stamped. */
  matchedAt?: string;
}

const MAX_LABEL = 60;

/**
 * Strings a health store can hand back in place of a device name, all of which
 * must read as "no name": the native bridge's own class names (HealthKit's
 * source object arrives as a Nitro hybrid object whose `name` is the CLASS —
 * "SourceProxy" — shadowing the source's real name), and the usual stringified
 * junk. Filtered on write AND on read, because sessions matched before the
 * native read was fixed already carry "SourceProxy" in the database.
 */
const NON_DEVICE_NAMES = new Set([
  "sourceproxy",
  "workoutproxy",
  "hybridobject",
  "[object object]",
  "object object",
  "undefined",
  "null",
  "(null)",
  "nan",
  "unknown",
]);

/** True when `v` is a name an athlete would recognise as their device — i.e. a
 *  non-empty string that isn't one of the bridge/junk placeholders above. */
export function isDeviceName(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0 && !NON_DEVICE_NAMES.has(v.trim().toLowerCase());
}

/** The device a provider means when the recording didn't name one. Apple's
 *  workout store is reached through the Watch, so "Apple Watch" is the honest
 *  fallback there; other connectors name their own hardware. */
const PROVIDER_DEVICE: Record<string, string> = {
  apple: "Apple Watch",
  whoop: "WHOOP",
  oura: "Oura",
  garmin: "Garmin",
  polar: "Polar",
  fitbit: "Fitbit",
  suunto: "Suunto",
  coros: "COROS",
};

/** Every provider this app can name a device for. Exported so the mark registry
 *  (device-marks.ts) can be tested for the same coverage — a provider we can
 *  name is a provider we must be able to draw. */
export const PROVIDER_DEVICE_KEYS = Object.keys(PROVIDER_DEVICE);

/**
 * What to CALL the device on screen: the recording's own device name when it
 * has a real one, else the provider's device. Null when neither is known — the
 * caller then renders its own translated "Device" label.
 *
 * Every surface that names the device goes through here, so a stored junk name
 * ("SourceProxy" — see NON_DEVICE_NAMES) can never reach the athlete.
 */
export function deviceSourceLabel(d: { provider?: string; source?: string } | null | undefined): string | null {
  if (!d) return null;
  if (isDeviceName(d.source)) return d.source.trim();
  const provider = typeof d.provider === "string" ? d.provider.trim().toLowerCase() : "";
  return PROVIDER_DEVICE[provider] ?? null;
}

const isoOrNull = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

const boundedNum = (v: unknown, min: number, max: number): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null;

/**
 * Coerce arbitrary input into a clean DeviceWorkout, or null when it isn't one.
 * Used by the API (a malformed client can never write junk) and by the mobile
 * client before PATCHing. Bounds are generous sanity caps, not physiology:
 * a 24 h workout, 20 000 kcal, 300 km, 20–260 bpm. `matchedAt` is accepted but
 * callers that persist should re-stamp it server-side.
 */
export function sanitizeDeviceWorkout(input: unknown): DeviceWorkout | null {
  if (typeof input !== "object" || input === null) return null;
  const o = input as Record<string, unknown>;
  const uuid = typeof o.uuid === "string" ? o.uuid.trim().slice(0, 80) : "";
  const label = typeof o.activityLabel === "string" ? o.activityLabel.trim().slice(0, MAX_LABEL) : "";
  const start = isoOrNull(o.start);
  const end = isoOrNull(o.end);
  const durationMin = boundedNum(o.durationMin, 1, 1440);
  if (!uuid || !label || !start || !end || durationMin == null) return null;
  if (Date.parse(end) < Date.parse(start)) return null;

  const durationSec = boundedNum(o.durationSec, 1, 86400);
  const kcal = boundedNum(o.kcal, 1, 20000);
  // Floor is ONE METRE, not ten. The old 0.01 km floor threw away any recording
  // shorter than 10 m outright — a warm-up length in a pool is a real distance.
  const distanceKm = boundedNum(o.distanceKm, 0.001, 300);
  const avgHr = boundedNum(o.avgHr, 20, 260);
  const maxHr = boundedNum(o.maxHr, 20, 260);
  const minHr = boundedNum(o.minHr, 20, 260);
  const steps = boundedNum(o.steps, 1, 200000);
  const elevationM = boundedNum(o.elevationM, 1, 10000);
  const strokes = boundedNum(o.strokes, 1, 100000);
  const flights = boundedNum(o.flights, 1, 10000);
  const avgMets = boundedNum(o.avgMets, 0.1, 30);
  const tempC = boundedNum(o.tempC, -40, 60);
  const indoor = typeof o.indoor === "boolean" ? o.indoor : null;
  const provider = typeof o.provider === "string" && o.provider.trim() ? o.provider.trim().slice(0, 24) : "apple";
  // A bridge class name is not a device name — drop it here so it is never
  // stored, and `deviceSourceLabel` catches the rows written before this.
  const source = isDeviceName(o.source) ? (o.source as string).trim().slice(0, MAX_LABEL) : null;
  const matchedAt = isoOrNull(o.matchedAt);

  return {
    provider,
    uuid,
    activityLabel: label,
    start,
    end,
    durationMin: Math.round(durationMin),
    ...(durationSec != null ? { durationSec: Math.round(durationSec) } : {}),
    ...(kcal != null ? { kcal: Math.round(kcal) } : {}),
    // NOT ROUNDED — the exact figure the device measured. Every other number
    // here is rounded to the precision its own instrument has (whole bpm, whole
    // steps, whole kcal), but distance is the one measured figure spanning three
    // orders of magnitude, so there is no single grid that fits it: rounding to
    // two decimals of a kilometre is invisible on a 10 km run and is the whole
    // error on a 34 m pool swim (0.034 km stored as 0.03 — the app showed "30 m"
    // beside the watch's own "34 m", and paced it 12:33 /100m against the
    // watch's 11:06). So the measurement is stored verbatim and each surface
    // rounds where it RENDERS — `deviceDistanceLabel` below, `displaySportDistance`
    // for the session's own figures. Nothing derived from it (pace, mileage) may
    // divide by a rounded distance.
    ...(distanceKm != null ? { distanceKm } : {}),
    ...(avgHr != null ? { avgHr: Math.round(avgHr) } : {}),
    ...(maxHr != null ? { maxHr: Math.round(maxHr) } : {}),
    ...(minHr != null ? { minHr: Math.round(minHr) } : {}),
    ...(steps != null ? { steps: Math.round(steps) } : {}),
    ...(elevationM != null ? { elevationM: Math.round(elevationM) } : {}),
    ...(strokes != null ? { strokes: Math.round(strokes) } : {}),
    ...(flights != null ? { flights: Math.round(flights) } : {}),
    ...(avgMets != null ? { avgMets: Math.round(avgMets * 10) / 10 } : {}),
    ...(tempC != null ? { tempC: Math.round(tempC * 10) / 10 } : {}),
    ...(indoor != null ? { indoor } : {}),
    ...(source ? { source } : {}),
    ...(matchedAt ? { matchedAt } : {}),
  };
}

/**
 * A measured distance → the string to SHOW for it, in the activity's own unit.
 *
 * The stored figure is the device's exact one (see `sanitizeDeviceWorkout`), so
 * every surface that prints it has to round here rather than assume it arrives
 * pretty: a run measured at 10.234567 km reads "10.23 km", a pool swim at
 * 0.034 km reads "34 m" — the same words the watch's own summary uses. Metre
 * sports read to the metre; everything else gets metres below a kilometre and
 * two decimals above it.
 *
 * Shared by the comparison panel and the match picker so the two can't drift.
 */
export function deviceDistanceLabel(km: number, activityLabel: string): string {
  if (sportDistanceUnit(activityLabel) === "m") return `${displaySportDistance(km, activityLabel)} m`;
  return km < 1 ? `${Math.round(km * 1000)} m` : `${Math.round(km * 100) / 100} km`;
}

/** How far around the session's start the device store is searched for
 *  candidates, hours. Wide on purpose: a quick-logged sport session is stamped
 *  when it was LOGGED (often hours after it was played), so a tight window
 *  around the log time would miss the real workout. */
export const DEVICE_MATCH_WINDOW_H = 24;

/** A candidate as the picker ranks it — the workout plus its score. */
export interface RankedDeviceWorkout {
  workout: DeviceWorkout;
  /** 0..1 — how likely this device workout IS the logged session. */
  score: number;
}

/**
 * Score one device workout against the logged session: time proximity first,
 * duration similarity second.
 *
 * The session's clock interval is UNRELIABLE for quick-logged sports —
 * startedAt == completedAt == "when I opened the log sheet" — so the score
 * never requires overlap: a workout overlapping the session interval scores a
 * full time score, and otherwise the gap between the two intervals decays it
 * (half-life ~3 h, zero beyond the search window). When the athlete entered a
 * duration, a device workout of similar length gets up to a 20% boost — that is
 * what separates the 55-min tennis match from the 10-min walk logged the same
 * afternoon.
 */
export function deviceMatchScore(
  session: { startedAt: string; completedAt?: string | null; durationMin?: number | null },
  workout: { start: string; end: string; durationMin: number },
): number {
  const s0 = Date.parse(session.startedAt);
  const s1 = session.completedAt ? Date.parse(session.completedAt) : s0;
  const w0 = Date.parse(workout.start);
  const w1 = Date.parse(workout.end);
  if (![s0, s1, w0, w1].every(Number.isFinite)) return 0;

  // Gap between the intervals, hours (0 when they overlap).
  const gapMs = Math.max(0, Math.max(w0 - Math.max(s0, s1), Math.min(s0, s1) - w1));
  const gapH = gapMs / 3600000;
  if (gapH > DEVICE_MATCH_WINDOW_H) return 0;
  const timeScore = Math.pow(0.5, gapH / 3);

  let durationScore = 0;
  const logged = session.durationMin;
  if (logged != null && logged > 0 && workout.durationMin > 0) {
    const ratio = Math.min(logged, workout.durationMin) / Math.max(logged, workout.durationMin);
    durationScore = ratio;
  }
  return Math.round((timeScore * 0.8 + durationScore * 0.2) * 1000) / 1000;
}

/** Rank candidates for the picker, best first; zero-score workouts drop out. */
export function rankDeviceWorkouts(
  session: { startedAt: string; completedAt?: string | null; durationMin?: number | null },
  workouts: DeviceWorkout[],
): RankedDeviceWorkout[] {
  return workouts
    .map((workout) => ({ workout, score: deviceMatchScore(session, workout) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

/** One row of the side-by-side "in the app vs on the device" panel. */
export interface DeviceComparisonRow {
  labelKey: string;
  /** What HYBRID holds — logged or modelled. Null renders as "—". */
  app: string | null;
  /** True when the app-side figure is an estimate (wears the "~"). */
  appEstimate?: boolean;
  /** What the device measured. Null renders as "—". */
  device: string | null;
}

/**
 * Build the comparison the summary renders once a session is matched: what the
 * athlete logged (+ the MET estimate) in one column, what the device measured
 * in the other. Rows where NEITHER side has anything to say are dropped; a
 * device-only row (heart rate) keeps its null app side — the gap is the point
 * of the panel.
 *
 * This is the ONE surface that still shows the logged figures once a session is
 * matched (everywhere else the measurement wins), so callers must pass the
 * app-side values read with `ignoreDevice: true` — passing the effective ones
 * would print the device's numbers in both columns.
 */
export function deviceComparisonRows(opts: {
  device: DeviceWorkout;
  /** The app side, from doneReceipt / sessionEnergy at the call site. */
  durationMin?: number | null;
  estimatedKcal?: number | null;
  distanceKm?: number | null;
  /** Elevation gain the athlete logged, metres (cardio blocks). */
  elevationM?: number | null;
}): DeviceComparisonRow[] {
  const d = opts.device;
  // Distance and pace read in the ACTIVITY's natural unit, so the panel speaks
  // the same language as the watch beside it: a pool swim is "510 m" at
  // "3:52 /100m", not "0.51 km" at "38:36 /km". The activity label is the
  // device's own ("Swimming", "Rowing"); unknown labels fall back to km.
  // Seconds → the clock the device itself shows: "19:41", "1:34:12" past the
  // hour. Only the measured column ever earns this; a typed duration has no
  // seconds to tell.
  const clock = (seconds: number): string => {
    const total = Math.round(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
    return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
  };
  const sport = d.activityLabel;
  const km = (v: number) => deviceDistanceLabel(v, sport);
  // Each column derives pace from ITS OWN distance + time — never mixed.
  const per = sportPacePerMeters(sport);
  const pace = (distKm?: number | null, seconds?: number | null): string | null => {
    if (distKm == null || seconds == null || !(distKm > 0) || !(seconds > 0)) return null;
    const sec = Math.round((seconds * (per / 1000)) / distKm);
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")} ${per === 1000 ? "/km" : `/${per}m`}`;
  };
  const rows: DeviceComparisonRow[] = [
    {
      labelKey: "session.device.duration",
      app: opts.durationMin != null && opts.durationMin > 0 ? `${opts.durationMin} min` : null,
      // The measured time to the second when the recording carries it: the
      // watch's own summary reads 0:19:41, so printing "20 min" beside it
      // invents a disagreement out of our own rounding.
      device: d.durationSec != null ? clock(d.durationSec) : `${d.durationMin} min`,
    },
    {
      labelKey: "session.device.calories",
      app: opts.estimatedKcal != null && opts.estimatedKcal > 0 ? `${opts.estimatedKcal} kcal` : null,
      appEstimate: opts.estimatedKcal != null && opts.estimatedKcal > 0,
      device: d.kcal != null ? `${d.kcal} kcal` : null,
    },
    {
      labelKey: "session.device.distance",
      app: opts.distanceKm != null && opts.distanceKm > 0 ? km(opts.distanceKm) : null,
      device: d.distanceKm != null ? km(d.distanceKm) : null,
    },
    {
      labelKey: "session.pace",
      // Derived from two typed numbers, so it is a modelled figure exactly like
      // the kcal above and wears the same "~". Nothing measured this.
      app: pace(opts.distanceKm, opts.durationMin != null ? opts.durationMin * 60 : null),
      appEstimate: true,
      // To the second when the recording carries it (see `durationSec`).
      device: pace(d.distanceKm, d.durationSec ?? d.durationMin * 60),
    },
    {
      labelKey: "session.device.avgHr",
      app: null,
      device: d.avgHr != null ? `${d.avgHr} bpm` : null,
    },
    {
      labelKey: "session.device.maxHr",
      app: null,
      device: d.maxHr != null ? `${d.maxHr} bpm` : null,
    },
    {
      labelKey: "session.wrapped.elevation",
      app: opts.elevationM != null && opts.elevationM > 0 ? `${Math.round(opts.elevationM)} m` : null,
      device: d.elevationM != null ? `${d.elevationM} m` : null,
    },
    {
      labelKey: "session.device.steps",
      app: null,
      device: d.steps != null ? d.steps.toLocaleString("en-US") : null,
    },
    {
      labelKey: "session.device.strokes",
      app: null,
      device: d.strokes != null ? d.strokes.toLocaleString("en-US") : null,
    },
    {
      labelKey: "session.device.flights",
      app: null,
      device: d.flights != null ? `${d.flights}` : null,
    },
    {
      labelKey: "session.device.avgMets",
      app: null,
      device: d.avgMets != null ? `${d.avgMets}` : null,
    },
  ];
  return rows.filter((r) => r.app != null || r.device != null);
}
