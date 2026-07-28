/**
 * WHEN YOU ANSWERED CHANGES WHAT THE ANSWER MEANS.
 *
 * "How spent are you?" is not one question — it is a different question at
 * every hour after the session. Tick "wrecked" ten minutes after a hard set of
 * squats and you have described a set of squats. Tick "wrecked" ten HOURS
 * later, showered, fed and back at your desk, and you have described a problem.
 * Identical stored values, opposite meanings, and the app treated them as the
 * same number.
 *
 * The model here is deliberately simple and stated in one place:
 *
 *   RESIDUAL — acute fatigue decays. Immediately post-session almost all of the
 *     disturbance is still present; it falls away fast over the first hours and
 *     then flattens onto a slower muscle-damage component that outlives the day.
 *     `expectedResidual(h)` is the fraction still expected to be there at h
 *     hours, an exponential toward a floor.
 *
 *   COST — divide the reported fatigue by the residual expected at that lag,
 *     and you get a timing-independent estimate of what the session actually
 *     cost. Fatigue 4 at 1 h is an ordinary hard session. The same 4 at 10 h is
 *     a much bigger disturbance, because most of the acute component should
 *     already have drained away and it hasn't.
 *
 *   WEIGHT — a report is not equally trustworthy at every lag. Answered days
 *     later it is recall, not measurement, so its influence decays too. A report
 *     with a lag we do not know keeps a neutral weight and is never inflated.
 *
 * This is the "how did that feel?" (post-workout, session-scoped) side of the
 * app. The daily check-in is a different instrument, asked before training about
 * the day rather than after training about the session — see checkin-scales.ts.
 */

const HOUR_MS = 3_600_000;

/** How the report should be interpreted, given how long after the session it
 *  was answered. The names are what the athlete is really telling you. */
export type FeelRead =
  /** Within ~3 h — describes the session itself, acute fatigue still present. */
  | "immediate"
  /** 3–12 h — the session has settled; this is the evening-after read. */
  | "sameDay"
  /** 12–36 h — this is a RECOVERY read, the most informative one for training. */
  | "nextDay"
  /** Beyond 36 h — recall rather than measurement; heavily discounted. */
  | "stale"
  /** No timestamp — legacy rows and anything logged without a clock. */
  | "unknown";

export const FEEL_READ_KEY: Record<FeelRead, string> = {
  immediate: "session.feel.readImmediate",
  sameDay: "session.feel.readSameDay",
  nextDay: "session.feel.readNextDay",
  stale: "session.feel.readStale",
  unknown: "session.feel.readUnknown",
};

/** Boundaries, in hours after the session ended. */
export const READ_BOUNDS = { immediate: 3, sameDay: 12, nextDay: 36 } as const;

export function classifyRead(hoursAfter: number | null): FeelRead {
  if (hoursAfter == null || !Number.isFinite(hoursAfter) || hoursAfter < 0) return "unknown";
  if (hoursAfter < READ_BOUNDS.immediate) return "immediate";
  if (hoursAfter < READ_BOUNDS.sameDay) return "sameDay";
  if (hoursAfter < READ_BOUNDS.nextDay) return "nextDay";
  return "stale";
}

/**
 * The fraction of a session's acute fatigue still expected to be present `h`
 * hours after it ended.
 *
 * Two components: a fast one that drains over the first hours (τ = 6 h) and a
 * slow floor (35%) standing in for the muscle-damage side that is still there
 * the next morning. At h = 0 everything is present; by 10 h under half of the
 * acute spike should remain; past a day it flattens onto the floor.
 */
export const RESIDUAL_FLOOR = 0.35;
export const RESIDUAL_TAU_H = 6;

export function expectedResidual(hoursAfter: number): number {
  const h = Math.max(0, hoursAfter);
  return RESIDUAL_FLOOR + (1 - RESIDUAL_FLOOR) * Math.exp(-h / RESIDUAL_TAU_H);
}

/**
 * How much a report at this lag should count. Full weight up to half a day
 * (measurement), then decaying toward a floor as it becomes recall. An unknown
 * lag keeps full weight — we have no reason to distrust it, only no reason to
 * adjust it either.
 */
export const RECALL_FROM_H = 12;
export const RECALL_TAU_H = 18;
export const WEIGHT_FLOOR = 0.25;

export function reportWeight(hoursAfter: number | null): number {
  if (hoursAfter == null || !Number.isFinite(hoursAfter) || hoursAfter < 0) return 1;
  if (hoursAfter <= RECALL_FROM_H) return 1;
  const over = hoursAfter - RECALL_FROM_H;
  return Math.round((WEIGHT_FLOOR + (1 - WEIGHT_FLOOR) * Math.exp(-over / RECALL_TAU_H)) * 1000) / 1000;
}

/** A fatigue report placed in time. */
export interface FeelReading {
  /** The raw 1–5 the athlete tapped. */
  fatigue: number;
  /** Hours between the session ending and the report, or null if unknown. */
  hoursAfter: number | null;
  read: FeelRead;
  /** 0…1 — the raw report above "fresh", before any timing adjustment. */
  raw: number;
  /** The residual fraction expected at that lag (1 when the lag is unknown). */
  expected: number;
  /**
   * 0…~1.5 — the timing-adjusted session cost. This is the number to compare
   * across sessions, because it no longer depends on when the athlete happened
   * to open the app.
   */
  cost: number;
  /** 0…1 — how much this report should count (recall discount at long lags). */
  weight: number;
  /**
   * The cost expressed back on the familiar 1–5 fatigue scale, FOR DISPLAY. It
   * saturates: a 5 is already the top of the scale, so a 5 logged ten hours out
   * and a 5 logged straight after both show as 5 even though their costs differ
   * a lot. Thresholds must therefore be written against `cost`, not this — see
   * COST_HIGH.
   */
  adjustedFatigue: number;
}

/** Cost is bounded: no lag should let one tap imply a superhuman disturbance. */
export const MAX_COST = 1.5;

/**
 * The cost at which a report reads as "this session was not absorbed".
 *
 * Calibrated against the cases that have to come out right:
 *   fatigue 4 at 1 h   → 0.83  a hard session, logged in the gym. Not a flag.
 *   fatigue 5 at 1 h   → 1.11  a very hard session. Still not a flag on its own.
 *   fatigue 4 at 10 h  → 1.50  still wrecked at bedtime. A flag.
 *   fatigue 4 at 20 h  → 1.50  still wrecked the next morning. A flag.
 *
 * Paired with MIN_STRAIN_FATIGUE so no amount of lag can inflate "I feel fine"
 * into a strain signal — dividing a small number by a small number must not
 * manufacture evidence.
 */
export const COST_HIGH = 1.15;
export const MIN_STRAIN_FATIGUE = 3;

/** Did this report indicate the session was not absorbed? Timing-aware, and
 *  false for any report that wasn't at least "worked" in raw terms. */
export function isStrained(r: FeelReading | null): boolean {
  return !!r && r.fatigue >= MIN_STRAIN_FATIGUE && r.cost >= COST_HIGH;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * Place a fatigue report in time. `hoursAfter` null (no timestamp stored, e.g.
 * a row written before the column existed) degrades to the raw report — the
 * adjustment is skipped, never guessed.
 */
export function feelReading(fatigue: number, hoursAfter: number | null): FeelReading | null {
  if (!Number.isFinite(fatigue) || fatigue < 1 || fatigue > 5) return null;
  const lag = hoursAfter != null && Number.isFinite(hoursAfter) && hoursAfter >= 0 ? hoursAfter : null;
  const raw = (fatigue - 1) / 4;
  const expected = lag == null ? 1 : expectedResidual(lag);
  const cost = clamp(raw / expected, 0, MAX_COST);
  return {
    fatigue,
    hoursAfter: lag,
    read: classifyRead(lag),
    raw,
    expected: Math.round(expected * 1000) / 1000,
    cost: Math.round(cost * 1000) / 1000,
    weight: reportWeight(lag),
    // Back onto 1–5, clamped to the scale the rest of the app speaks.
    adjustedFatigue: Math.round(clamp(1 + cost * 4, 1, 5) * 100) / 100,
  };
}

/** Hours between a session ending and the moment its feel was logged. Null when
 *  either timestamp is missing or the maths would be nonsense (a report before
 *  the session ended is a clock problem, not a −2 hour lag). */
export function hoursAfterSession(
  sessionEnd: string | number | null | undefined,
  loggedAt: string | number | null | undefined,
): number | null {
  const end = typeof sessionEnd === "number" ? sessionEnd : sessionEnd ? Date.parse(sessionEnd) : NaN;
  const at = typeof loggedAt === "number" ? loggedAt : loggedAt ? Date.parse(loggedAt) : NaN;
  if (!Number.isFinite(end) || !Number.isFinite(at)) return null;
  const h = (at - end) / HOUR_MS;
  return h >= 0 ? Math.round(h * 100) / 100 : null;
}

/* ────────────────────────────────────────────────────────────────────────────
 * THE SAME IDEA, ON THE WAY IN.
 *
 * Today's readiness check-in has the mirror-image problem. "Wrecked" ninety
 * minutes after a heavy session is the session talking, and reading it as a
 * recovery failure would have the app deload an athlete for the crime of
 * training hard. "Wrecked" a full day later, with nothing since, is the
 * reading that should actually change the plan. Same tap, same field, opposite
 * implication — so the card says which one it is looking at.
 * ──────────────────────────────────────────────────────────────────────────── */

/** How to read today's readiness answer, given the last session. */
export type ReadinessContext =
  /** No recent session — the answer is about the athlete, not a workout. */
  | "rested"
  /** Within ~3 h of training — a low answer is expected and means little. */
  | "postSession"
  /** 3–12 h — the session has settled; a low answer starts to count. */
  | "settling"
  /** 12–36 h — a low answer here is a recovery signal worth acting on. */
  | "recovered";

export function readinessContext(hoursSinceSession: number | null): ReadinessContext {
  if (hoursSinceSession == null || !Number.isFinite(hoursSinceSession) || hoursSinceSession < 0) return "rested";
  if (hoursSinceSession < READ_BOUNDS.immediate) return "postSession";
  if (hoursSinceSession < READ_BOUNDS.sameDay) return "settling";
  if (hoursSinceSession < READ_BOUNDS.nextDay) return "recovered";
  return "rested";
}

/**
 * The sentence the feeling card shows under the faces: what today's answer is
 * actually measuring, given how long ago the athlete last trained. `low` is
 * true for the two negative feelings (flat, wrecked) — the only ones whose
 * meaning genuinely turns on the clock. A positive answer soon after training
 * is worth saying too: it means the session was absorbed.
 */
export function readinessNoteKey(ctx: ReadinessContext, low: boolean): string | null {
  if (ctx === "rested") return null;
  if (ctx === "postSession") return low ? "w.home.today.ctxPostSessionLow" : "w.home.today.ctxPostSessionOk";
  if (ctx === "settling") return low ? "w.home.today.ctxSettlingLow" : "w.home.today.ctxSettlingOk";
  return low ? "w.home.today.ctxRecoveredLow" : "w.home.today.ctxRecoveredOk";
}

/** Hours since a session ended, for the readiness context. Null when unknown. */
export function hoursSince(sessionEnd: string | number | null | undefined, now: number): number | null {
  const end = typeof sessionEnd === "number" ? sessionEnd : sessionEnd ? Date.parse(sessionEnd) : NaN;
  if (!Number.isFinite(end)) return null;
  const h = (now - end) / HOUR_MS;
  return h >= 0 ? Math.round(h * 100) / 100 : null;
}

/**
 * The one-line explanation the UI shows next to a logged feel — which i18n key
 * describes what this report is actually measuring. Pairs with FEEL_READ_KEY.
 */
export function readNoteKey(read: FeelRead, fatigue: number): string {
  if (read === "unknown") return "session.feel.noteUnknown";
  const heavy = fatigue >= 4;
  if (read === "immediate") return heavy ? "session.feel.noteImmediateHeavy" : "session.feel.noteImmediate";
  if (read === "sameDay") return heavy ? "session.feel.noteSameDayHeavy" : "session.feel.noteSameDay";
  if (read === "nextDay") return heavy ? "session.feel.noteNextDayHeavy" : "session.feel.noteNextDay";
  return "session.feel.noteStale";
}
