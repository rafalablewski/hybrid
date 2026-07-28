/**
 * Daily check-in — the shared step model behind the GUIDED check-in flow on both
 * clients (web wizard + mobile wizard). The flow walks one metric per card, in a
 * fixed order, with a 1–5 scale whose selected value maps to the SAME readiness
 * face the quick picker draws (via feelingFromRating). Keeping the metric order,
 * i18n keys and value→face mapping here is the single source of truth so web and
 * mobile can't drift.
 */
import { feelingFromRating, type ReadinessFeeling } from "./readiness-feeling";

/**
 * The four daily metrics, keyed by their STORAGE names.
 *
 * `soreness` is the Postgres column, and the column stores FRESHNESS (5 = fresh)
 * — see checkin-scales.ts, which is the one place that flip is named. The key
 * stays as the column so nothing has to translate on the wire; every human-
 * visible string calls it Freshness, which is what it has always asked and what
 * it has always stored. Use `metricLabelKey` rather than building an i18n key
 * from this value: the two no longer spell the same word, on purpose.
 */
export type CheckinMetricKey = "energy" | "sleep" | "soreness" | "mood";

/** The metrics the guided flow steps through, in order, with their i18n keys.
 *  `questionKey` is the big one-per-card prompt; `labelKey` names the metric.
 *  Every metric reads 5 = best, so one row of faces serves all four. */
export const CHECKIN_METRICS: {
  key: CheckinMetricKey;
  labelKey: string;
  questionKey: string;
}[] = [
  { key: "energy", labelKey: "w.recovery.checkins.energy", questionKey: "w.recovery.checkins.qEnergy" },
  { key: "sleep", labelKey: "w.recovery.checkins.sleep", questionKey: "w.recovery.checkins.qSleep" },
  { key: "soreness", labelKey: "w.recovery.checkins.freshness", questionKey: "w.recovery.checkins.qFreshness" },
  { key: "mood", labelKey: "w.recovery.checkins.mood", questionKey: "w.recovery.checkins.qMood" },
];

/** The i18n key naming a metric. The ONLY supported way to label one — the
 *  storage key and the copy key deliberately differ for freshness. */
export function metricLabelKey(key: CheckinMetricKey): string {
  return CHECKIN_METRICS.find((m) => m.key === key)?.labelKey ?? `w.recovery.checkins.${key}`;
}

/** Total steps in the flow: one per metric, plus the final details/submit card. */
export const CHECKIN_STEP_COUNT = CHECKIN_METRICS.length + 1;

/** The 1–5 rating options each metric step offers. */
export const CHECKIN_SCALE = [1, 2, 3, 4, 5] as const;

/** i18n key for the reactive word describing a 1–5 rating (Very low … Great). */
export function checkinScaleWordKey(value: number): string {
  const v = Math.max(1, Math.min(5, Math.round(value)));
  return `w.recovery.checkins.scale${v}`;
}

/**
 * The word a metric card puts under its face.
 *
 * The QUICK metric — the one Today's "how ready do you feel?" tap writes — is
 * named in the READINESS vocabulary (Wrecked / Flat / Good / Primed), because
 * Today already names it that way and the same stored number must not have two
 * names on two surfaces. A 4 that Today calls "Good" was called "Good" in the
 * wizard too, but a 5 was "Primed" there and "Great" here, and a 3 was "Flat"
 * there and "Okay" here — the same tap, reported back in a word the athlete
 * never chose. The face was ALREADY the readiness face on both (see
 * checkinScaleFeeling), so this only makes the word agree with the picture.
 *
 * The other three metrics keep the generic scale words: "How did you sleep?"
 * is not a readiness question, and "Wrecked" is not an answer to it.
 */
export function checkinMetricWordKey(key: CheckinMetricKey, value: number): string {
  if (key === QUICK_CHECKIN_METRIC) return `w.recovery.readiness.${feelingFromRating(value)}`;
  return checkinScaleWordKey(value);
}

/** The readiness face a 1–5 rating maps to — shared with the quick picker so the
 *  same value always draws the same expression + accent on both clients. */
export function checkinScaleFeeling(value: number): ReadinessFeeling {
  return feelingFromRating(value);
}

/** Re-log cadence: a feeling must be logged at least once a day, and may be
 *  re-logged at most once every 6 hours. This is the shared window both clients
 *  read to show "next in …" on the home feeling card. */
export const CHECKIN_COOLDOWN_MS = 6 * 60 * 60 * 1000;

/** Milliseconds left in the 6h re-log window (0 once it's open again). */
export function checkinCooldownRemainingMs(lastLoggedMs: number, nowMs = Date.now()): number {
  return Math.max(0, CHECKIN_COOLDOWN_MS - (nowMs - lastLoggedMs));
}

/* ────────────────────────────────────────────────────────────────────────────
 * ONE TAP ANSWERS ONE QUESTION.
 *
 * The quick face on Today asks "how ready do you feel?" and used to write the
 * picked level into ALL FOUR metrics — energy, sleep, soreness and mood — as
 * though the athlete had reported four measurements. They reported one. The
 * other three were invented, indistinguishable in the database from answers
 * actually given, and everything downstream believed them: the volume profile
 * reads mean check-in SLEEP and presents it to the athlete as "measured", the
 * MRV estimator reads soreness and energy as recovery evidence. One tap was
 * quietly feeding three models numbers nobody had entered.
 *
 * So the quick tap now writes ONLY what it asked. The rest stay null until the
 * follow-up actually asks them, and every reader already treats null as
 * "unknown" rather than as a middling 3.
 * ──────────────────────────────────────────────────────────────────────────── */

/** A check-in's four metrics as stored — null meaning "not answered". */
export type CheckinMetrics = Record<CheckinMetricKey, number | null>;

/** The metric the one-tap readiness face actually answers. */
export const QUICK_CHECKIN_METRIC: CheckinMetricKey = "energy";

/**
 * What a single readiness tap may claim. Exactly one metric, and nulls for the
 * three it did not ask about — so a partial check-in is stored as partial.
 */
export function quickCheckinMetrics(rating: number): CheckinMetrics {
  const v = Math.max(1, Math.min(5, Math.round(rating)));
  return { energy: v, sleep: null, soreness: null, mood: null };
}

/**
 * The feeling the READINESS QUESTION itself carries — the answer to "how ready
 * do you feel?", which is stored in exactly one metric.
 *
 * Distinct from `checkinFeeling`, which averages every metric present. Today's
 * picker used the average, so finishing the rest of the check-in silently moved
 * the highlighted face off the one the athlete had tapped: tap Primed, answer
 * sleep 3 / freshness 2 / mood 4, and the card came back saying Good — the app
 * overwriting the athlete's own answer with a number they never gave. The
 * average is still the right input for the load model (more signal is better);
 * it is the wrong thing to draw under the question it did not answer.
 */
export function quickCheckinFeeling(
  c: Partial<CheckinMetrics> | null | undefined,
): ReadinessFeeling | null {
  const v = c?.[QUICK_CHECKIN_METRIC];
  return typeof v === "number" && Number.isFinite(v) ? feelingFromRating(v) : null;
}

/* ────────────────────────────────────────────────────────────────────────────
 * WHAT A WRITE MAY TOUCH.
 *
 * POST /api/checkins upserts the day's row, and it used to write EVERY column
 * from the request body — so any field the sender left out was stored as null.
 * Both clients left fields out constantly, and each write quietly deleted the
 * others' answers:
 *
 *   - Re-tapping readiness in the afternoon sent {energy, sleep: null,
 *     soreness: null, mood: null} and wiped the morning's three answers.
 *   - Submitting the follow-up sent whatever its own form held, so the web
 *     wizard — which never prefilled weight / adherence / note — erased all
 *     three every time it saved.
 *
 * The route now patches an existing day: a key that is ABSENT is left alone, a
 * key that is explicitly null is cleared. These builders are what the clients
 * put on the wire, so "I only answered this" and "leave the rest alone" are the
 * same statement.
 * ──────────────────────────────────────────────────────────────────────────── */

/** The wire payload for one readiness tap: the metric it answered, nothing
 *  else. `quickCheckinMetrics` is what the tap CLAIMS; this is what it SENDS. */
export function quickCheckinPatch(rating: number): Partial<CheckinMetrics> {
  return { [QUICK_CHECKIN_METRIC]: quickCheckinMetrics(rating)[QUICK_CHECKIN_METRIC] };
}

/** The wire payload for the guided flow: the metrics actually answered, and no
 *  key at all for the ones walked past — so a question left blank neither
 *  invents a middling 3 nor deletes an answer given earlier today. */
export function checkinMetricPatch(
  ratings: Partial<Record<CheckinMetricKey, number>>,
  answered: Iterable<CheckinMetricKey>,
): Partial<CheckinMetrics> {
  const out: Partial<CheckinMetrics> = {};
  for (const k of answered) {
    const v = ratings[k];
    if (typeof v === "number" && Number.isFinite(v)) out[k] = Math.max(1, Math.min(5, Math.round(v)));
  }
  return out;
}

/**
 * Narrow a fully-prepared check-in row to the fields the REQUEST actually
 * carried — the server half of the rule above, kept here so the two halves are
 * one decision rather than two that have to agree.
 *
 * `weekOf` always writes (it identifies the day being refined). Everything else
 * writes only if the sender named it: absent leaves the stored value alone,
 * present-and-null clears it deliberately. Applies to UPDATES only — creating a
 * brand-new day writes the whole prepared row, where an absent field genuinely
 * does mean unknown.
 */
export function checkinPatchFields<T extends Record<string, unknown>>(
  prepared: T,
  body: Record<string, unknown>,
): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(prepared) as (keyof T & string)[]) {
    if (k === "weekOf" || Object.prototype.hasOwnProperty.call(body, k)) out[k] = prepared[k];
  }
  return out;
}

/** Which metrics a stored check-in actually carries an answer for. */
export function answeredMetrics(c: Partial<CheckinMetrics> | null | undefined): CheckinMetricKey[] {
  if (!c) return [];
  return CHECKIN_METRICS.map((m) => m.key).filter((k) => {
    const v = c[k];
    return typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= 5;
  });
}

/** The metrics still to ask — what the follow-up pop-up should walk. */
export function outstandingMetrics(c: Partial<CheckinMetrics> | null | undefined): CheckinMetricKey[] {
  const done = new Set(answeredMetrics(c));
  return CHECKIN_METRICS.map((m) => m.key).filter((k) => !done.has(k));
}

/* ────────────────────────────────────────────────────────────────────────────
 * ONE CARD.
 *
 * There used to be two places a feeling was logged: this daily check-in, and a
 * separate post-workout prompt. They asked the same question — "how are you
 * right now", on the same 1–5 scale, drawn with the same faces — through two
 * code paths with different maths, which is why the card could tell an athlete
 * a reading "isn't counted against your recovery" while the estimator counted
 * it anyway. One question, two implementations, already disagreeing.
 *
 * So the post-workout prompt is gone and this is the only card. It carries:
 *
 *   THE DAY      energy, sleep, freshness, mood — how you are, once a day.
 *   THE SESSIONS how hard each one was — asked only on days you trained, once
 *                per session, because effort is per-session and a hard lift
 *                and an easy jog on the same day are not one number.
 *
 * The two halves land in different places, both of which already existed: the
 * daily metrics on Checkin, the effort answers on each Session's `feel`, which
 * is where the effort model, fatigue, readiness, ACWR and injury risk have
 * always read them from. No migration, no second source of truth.
 * ──────────────────────────────────────────────────────────────────────────── */

/** One session the card may ask about, as the clients supply it. */
export interface CheckinSessionRef {
  id: string;
  title: string;
  /** ISO — orders the questions the way the day happened. */
  startedAt: string;
  /** The effort already recorded for it (Session.feel), if any. */
  feel?: number | null;
}

/** A step in the flow. Daily metrics first, then one per session, then details. */
export type CheckinStep =
  | { kind: "metric"; key: CheckinMetricKey }
  | { kind: "effort"; session: CheckinSessionRef }
  | { kind: "details" };

/**
 * The whole flow for one day. With no sessions this is exactly the four daily
 * questions plus details — i.e. unchanged for a rest day.
 */
export function checkinSteps(sessions: CheckinSessionRef[] = []): CheckinStep[] {
  const ordered = [...sessions].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  return [
    ...CHECKIN_METRICS.map((m) => ({ kind: "metric" as const, key: m.key })),
    ...ordered.map((session) => ({ kind: "effort" as const, session })),
    { kind: "details" as const },
  ];
}

/** Whether a given step already has an answer. */
export function stepAnswered(step: CheckinStep, stored: Partial<CheckinMetrics> | null | undefined): boolean {
  if (step.kind === "metric") {
    const v = stored?.[step.key];
    return typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= 5;
  }
  if (step.kind === "effort") {
    const v = step.session.feel;
    return typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= 5;
  }
  return false; // details is never "answered"; it's the submit card
}

/** How complete the whole day is — daily metrics AND every session's effort. */
export function dayCompleteness(
  stored: Partial<CheckinMetrics> | null | undefined,
  sessions: CheckinSessionRef[] = [],
): { answered: number; total: number; complete: boolean } {
  const steps = checkinSteps(sessions).filter((s) => s.kind !== "details");
  const answered = steps.filter((s) => stepAnswered(s, stored)).length;
  return { answered, total: steps.length, complete: answered === steps.length };
}

/** The index the follow-up should OPEN on: the first step still unanswered, or
 *  the details card when everything is in. */
export function firstOutstandingIndex(
  stored: Partial<CheckinMetrics> | null | undefined,
  sessions: CheckinSessionRef[] = [],
): number {
  const steps = checkinSteps(sessions);
  const i = steps.findIndex((s) => s.kind !== "details" && !stepAnswered(s, stored));
  return i === -1 ? steps.length - 1 : i;
}

/**
 * The step the follow-up should OPEN on: the first question still unanswered,
 * or the details card when all four are in. Beats hardcoding "start at Sleep",
 * which was only right while the quick tap pretended to answer Energy.
 *
 * Daily metrics only — `firstOutstandingIndex` is the version that also walks
 * the day's sessions.
 */
export function firstOutstandingStep(c: Partial<CheckinMetrics> | null | undefined): number {
  const next = outstandingMetrics(c)[0];
  if (!next) return CHECKIN_METRICS.length; // the details/submit card
  return CHECKIN_METRICS.findIndex((m) => m.key === next);
}

/** How complete today's check-in is — the card shows "1 of 4" rather than
 *  implying a one-tap read is the whole picture. */
export function checkinCompleteness(c: Partial<CheckinMetrics> | null | undefined): {
  answered: number;
  total: number;
  complete: boolean;
} {
  const answered = answeredMetrics(c).length;
  const total = CHECKIN_METRICS.length;
  return { answered, total, complete: answered === total };
}
