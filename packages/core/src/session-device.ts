// Device-workout match — the shared primitives behind linking a logged Session
// to the SAME workout tracked on a wearable (today: Apple Watch via HealthKit).
//
// The athlete logs "Tennis, 60 min" in HYBRID while the watch records the real
// thing — measured calories, heart rate, precise moving time. Matching attaches
// the watch's read to the session (Session.device, one JSON column) so the
// summary can show both readings side by side: what the athlete logged (+ the
// MET-model estimate) next to what the device measured. ONE source of truth for
// both clients: the stored shape, the API sanitisation, the candidate ranking
// (which device workout is probably THIS session) and the comparison rows the
// summary panel renders. Pure + unit-tested; nothing here touches HealthKit —
// the native read lives in apps/mobile/lib/healthkit.ts and only the phone can
// perform a match (web renders the result and can unlink).

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
  /** What recorded it ("Apple Watch"), when the store says. */
  source?: string;
  /** When the athlete confirmed the match (ISO) — server-stamped. */
  matchedAt?: string;
}

const MAX_LABEL = 60;

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

  const kcal = boundedNum(o.kcal, 1, 20000);
  const distanceKm = boundedNum(o.distanceKm, 0.01, 300);
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
  const source = typeof o.source === "string" && o.source.trim() ? o.source.trim().slice(0, MAX_LABEL) : null;
  const matchedAt = isoOrNull(o.matchedAt);

  return {
    provider,
    uuid,
    activityLabel: label,
    start,
    end,
    durationMin: Math.round(durationMin),
    ...(kcal != null ? { kcal: Math.round(kcal) } : {}),
    ...(distanceKm != null ? { distanceKm: Math.round(distanceKm * 100) / 100 } : {}),
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
 * Build the comparison the summary renders once a session is matched: the
 * athlete's own numbers (+ the MET estimate) in one column, the device's
 * measurements in the other. Rows where NEITHER side has anything to say are
 * dropped; a device-only row (heart rate) keeps its null app side — the gap is
 * the point of the panel.
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
  const km = (v: number) => (v < 1 ? `${Math.round(v * 1000)} m` : `${Math.round(v * 100) / 100} km`);
  // Each column derives pace from ITS OWN distance + time — never mixed.
  const pace = (distKm?: number | null, min?: number | null): string | null => {
    if (distKm == null || min == null || !(distKm > 0) || !(min > 0)) return null;
    const sec = Math.round((min * 60) / distKm);
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")} /km`;
  };
  const rows: DeviceComparisonRow[] = [
    {
      labelKey: "session.device.duration",
      app: opts.durationMin != null && opts.durationMin > 0 ? `${opts.durationMin} min` : null,
      device: `${d.durationMin} min`,
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
      app: pace(opts.distanceKm, opts.durationMin),
      device: pace(d.distanceKm, d.durationMin),
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
