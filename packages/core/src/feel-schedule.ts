import { READ_BOUNDS, classifyRead, hoursAfterSession } from "./feel-timing";

/**
 * ASKING TWICE, BECAUSE ONE ANSWER CANNOT SAY BOTH THINGS.
 *
 * "How do you feel?" answered in the gym and the same question answered the
 * next morning are not two samples of one measurement. They are two different
 * measurements, and the app needs both:
 *
 *   THE IMMEDIATE READ — taken at the end of the session, while the athlete is
 *     still standing next to the bar. It says HOW HARD THAT WAS. Effort here is
 *     sRPE, the input to session load, ACWR and injury risk; spentness here is
 *     the acute disturbance at its peak, which is the only honest anchor for
 *     everything that follows. It cannot be recovered later: ask at 09:00 the
 *     next day and you get a memory of a feeling, filtered through a night's
 *     sleep.
 *
 *   THE RECOVERY READ — taken hours later, once the acute spike has had time to
 *     drain. It says WHETHER YOU ABSORBED IT. This is the reading that should
 *     move training: the ceiling estimate, tomorrow's readiness, whether the
 *     block keeps ramping.
 *
 * With only the first, the app knows what you did and nothing about what it
 * cost you. With only the second, every reading is ambiguous — "wrecked" could
 * be a hard session working as intended or a recovery failure, and there is
 * nothing to compare it against. With BOTH, the pair is worth more than the sum:
 * the drop from one to the other, measured against the population decay curve,
 * is a direct read of this athlete's own recovery rate (see feel-timing.ts,
 * `recoveryCurve`).
 *
 * This module owns only the CLOCK — which read is due, when the next one opens,
 * and when asking stops being worth it. Neither read invents a new instrument:
 * the immediate one is the post-workout card writing `Session.feel`/`fatigue`,
 * the recovery one is the daily check-in that already exists. One question, two
 * moments, no third code path.
 */

const HOUR_MS = 3_600_000;

/** A session, as the schedule reads it. */
export interface FeelSessionRef {
  id: string;
  title: string;
  /** ISO. */
  startedAt: string;
  /** ISO — when it ended. Falls back to `startedAt` when the client never
   *  stamped a completion (the lag is then measured from the start, which is
   *  wrong by at most one session's length and never by hours). */
  completedAt?: string | null;
  /** Perceived effort, 1–5. */
  feel?: number | null;
  /** How spent, 1–5. The immediate read's payload. */
  fatigue?: number | null;
  /** ISO — when feel/fatigue were answered. */
  feelLoggedAt?: string | null;
}

export type FeelReadKind = "immediate" | "recovery";

/**
 * WINDOWS.
 *
 * The immediate read is only immediate inside `READ_BOUNDS.immediate` — past
 * three hours the answer is no longer describing the session, so the card stops
 * asking rather than collecting a value it would have to discount to nothing.
 *
 * The recovery read opens at six hours. That is deliberately inside the
 * "sameDay" band rather than waiting for the next morning: by six hours the
 * fast component has largely drained (expectedResidual(6) ≈ 0.59) so the answer
 * carries real information, and an evening session still gets asked before bed
 * instead of being skipped. It stays open until the next-day boundary, after
 * which it is recall rather than measurement.
 */
export const IMMEDIATE_WINDOW_H = READ_BOUNDS.immediate;
export const RECOVERY_DUE_H = 6;
export const RECOVERY_WINDOW_H = READ_BOUNDS.nextDay;

/** One read the app is waiting on. */
export interface FeelPrompt {
  kind: FeelReadKind;
  /** The session this read is about. */
  session: FeelSessionRef;
  /** Epoch ms the prompt opens. */
  dueAt: number;
  /** Epoch ms after which asking is no longer worth it. */
  expiresAt: number;
  /** Open right now. */
  due: boolean;
  /** Already answered — kept so the UI can show the pair as a state, not a gap. */
  answered: boolean;
  /** Past its window with no answer. Nothing to do; recorded, not nagged about. */
  missed: boolean;
}

export interface FeelSchedule {
  /** Every read in play for the window, oldest session first. */
  prompts: FeelPrompt[];
  /** The reads open right now — what a card should actually ask. */
  due: FeelPrompt[];
  /** The next read to open, for scheduling a reminder. Null when nothing is
   *  pending. */
  next: FeelPrompt | null;
}

const endOf = (s: FeelSessionRef): number => {
  const end = s.completedAt ? Date.parse(s.completedAt) : NaN;
  if (Number.isFinite(end)) return end;
  const start = Date.parse(s.startedAt);
  return Number.isFinite(start) ? start : NaN;
};

/**
 * Did this session get its immediate read?
 *
 * Requires a spentness value AND, where a timestamp exists, that it was
 * answered inside the window. A `fatigue` written eight hours later is a real
 * answer to a different question — it is kept and used, but it does not mean
 * the immediate read happened.
 */
export function hasImmediateRead(s: FeelSessionRef): boolean {
  const v = s.fatigue;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 1 || v > 5) return false;
  const lag = hoursAfterSession(s.completedAt ?? s.startedAt, s.feelLoggedAt);
  // No timestamp: a row from before the column existed. Trust it rather than
  // asking the athlete to answer something they already answered.
  return lag == null || classifyRead(lag) === "immediate";
}

/**
 * Has this session been rated AT ALL?
 *
 * Not the same question as `hasImmediateRead`, and the difference is the whole
 * reason both exist. That one asks whether the read the SCHEDULE wanted was
 * taken, in its window, so an answer given the next morning honestly counts as
 * a miss. This one asks whether the app knows how hard the session was — the
 * effort value that multiplies into session load, ACWR and every risk read
 * downstream. A late answer still fills that hole; a missing one leaves the
 * session weightless in every model that reads it.
 *
 * A session with no effort rating is therefore a thing to OFFER, not to nag
 * about: `feltSessionLoad` returns null for it, so the week's load quietly
 * under-counts by exactly one session and nothing on any screen says so.
 * That's what an imported workout is the moment it lands — a row nobody typed,
 * and so a row nobody was asked about.
 */
export function isRated(s: FeelSessionRef): boolean {
  const v = s.feel;
  return typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= 5;
}

/**
 * Every session in the list still missing its effort rating, newest first.
 *
 * No lookback and no window: unlike the two scheduled reads, this is a backlog
 * rather than a prompt. The caller decides the scope it is willing to ask about
 * (a day's rows on Today, the batch that just imported) — the shared part is
 * only what "unrated" means, so the two clients can't disagree about which row
 * wears the ask.
 */
export function unratedSessions<T extends FeelSessionRef>(sessions: readonly T[]): T[] {
  return sessions
    .filter((s) => !isRated(s))
    .sort((a, b) => (endOf(b) || 0) - (endOf(a) || 0));
}

export interface FeelScheduleOptions {
  sessions: FeelSessionRef[];
  /** ISO/epoch of the most recent daily check-in — the recovery read. */
  lastCheckinAt?: string | number | null;
  now?: number;
  /** How far back to consider sessions, hours. Defaults to the recovery window
   *  — nothing older can still be asked about. */
  lookbackH?: number;
}

/**
 * What the app should ask, and when.
 *
 * The immediate read is per session: two sessions in a day are two different
 * efforts and two different disturbances. The recovery read is per DAY, anchored
 * to the last session that finished — one "how did you absorb that" covers the
 * day's training, which is why it lives on the daily check-in rather than
 * multiplying with the session count.
 */
export function feelSchedule(opts: FeelScheduleOptions): FeelSchedule {
  const now = opts.now ?? Date.now();
  const lookback = (opts.lookbackH ?? RECOVERY_WINDOW_H) * HOUR_MS;
  const checkinAt =
    typeof opts.lastCheckinAt === "number"
      ? opts.lastCheckinAt
      : opts.lastCheckinAt
        ? Date.parse(opts.lastCheckinAt)
        : NaN;

  const recent = opts.sessions
    .map((s) => ({ s, end: endOf(s) }))
    .filter((x) => Number.isFinite(x.end) && x.end <= now && now - x.end <= lookback)
    .sort((a, b) => a.end - b.end);

  const prompts: FeelPrompt[] = [];

  for (const { s, end } of recent) {
    const answered = hasImmediateRead(s);
    const expiresAt = end + IMMEDIATE_WINDOW_H * HOUR_MS;
    prompts.push({
      kind: "immediate",
      session: s,
      dueAt: end,
      expiresAt,
      due: !answered && now >= end && now < expiresAt,
      answered,
      missed: !answered && now >= expiresAt,
    });
  }

  // One recovery read, against the last session to finish. Anything earlier in
  // the day is covered by it: you do not recover from one session at a time.
  const last = recent[recent.length - 1];
  if (last) {
    const dueAt = last.end + RECOVERY_DUE_H * HOUR_MS;
    const expiresAt = last.end + RECOVERY_WINDOW_H * HOUR_MS;
    // Only a check-in written at or after the read comes due can BE the read —
    // this morning's check-in says nothing about tonight's session.
    const answered = Number.isFinite(checkinAt) && checkinAt >= dueAt;
    prompts.push({
      kind: "recovery",
      session: last.s,
      dueAt,
      expiresAt,
      due: !answered && now >= dueAt && now < expiresAt,
      answered,
      missed: !answered && now >= expiresAt,
    });
  }

  const pending = prompts.filter((p) => !p.answered && !p.missed);
  const next = pending.filter((p) => p.dueAt > now).sort((a, b) => a.dueAt - b.dueAt)[0] ?? null;

  return { prompts, due: prompts.filter((p) => p.due), next };
}

/** Milliseconds until the next read opens, or null when nothing is scheduled.
 *  What a client hands a local notification / timer. */
export function msUntilNextRead(schedule: FeelSchedule, now: number = Date.now()): number | null {
  if (!schedule.next) return null;
  return Math.max(0, schedule.next.dueAt - now);
}

/* ────────────────────────────────────────────────────────────────────────────
 * A CLOCK IS NOT A REMINDER.
 *
 * Everything above computes WHEN a read is owed. Nothing above can tell an
 * athlete about it: the in-app list only exists while the app is already open,
 * which makes it a good list and a useless prompt — by the time you are looking
 * at it you came back on your own. The recovery read is the one ask in this app
 * that has to travel to find you, and it was the one with no way to.
 *
 * So `msUntilNextRead` finally gets a caller, and this is the part it needs
 * that the schedule alone cannot supply: an hour a human would accept.
 *
 * WHY THE CLAMP IS NOT OPTIONAL. Six hours after an evening session is the
 * middle of the night. A notification at 02:00 does not get a considered answer
 * — it gets the permission revoked, and with it every other thing this app
 * might ever need to say. The read stays useful for thirty-six hours, so
 * moving a night-time due time to the next morning costs the model very little
 * (the lag grows from 6 h to ~12 h, both squarely inside the window) and costs
 * the athlete nothing. Pushing a notification into someone's sleep to protect a
 * six-hour lag would be optimising the measurement by destroying the channel
 * that collects it.
 * ──────────────────────────────────────────────────────────────────────────── */

/** The earliest hour the recovery read may be asked for, local. */
export const WAKING_FROM_H = 8;
/** The latest. Past this the ask moves to the next morning. */
export const WAKING_TO_H = 21;

/**
 * The instant to fire the recovery reminder for a session that ended at
 * `sessionEnd`, or null when there is no useful moment left.
 *
 * Null means DO NOT SCHEDULE, and it has three causes, all of them real:
 * the due time has already passed (the athlete is holding the phone now — the
 * card asks, not a notification), the session is so old the read has expired,
 * or clamping into waking hours would push the ask past the window entirely.
 */
export function recoveryReminderAt(
  sessionEnd: string | number | null | undefined,
  now: number = Date.now(),
): number | null {
  const end = typeof sessionEnd === "number" ? sessionEnd : sessionEnd ? Date.parse(sessionEnd) : NaN;
  if (!Number.isFinite(end)) return null;

  const due = end + RECOVERY_DUE_H * HOUR_MS;
  const expires = end + RECOVERY_WINDOW_H * HOUR_MS;
  const at = clampToWaking(due);
  // Already due, or clamped past the point where the answer stops being a
  // measurement. Either way a notification is the wrong instrument.
  if (at <= now || at >= expires) return null;
  return at;
}

/**
 * Move an instant into the waking window, in the DEVICE's own timezone —
 * which is the athlete's, and the only clock that matters for "is this a
 * reasonable hour". Before the window, wait for it; after it, the next morning.
 */
export function clampToWaking(at: number): number {
  const d = new Date(at);
  const h = d.getHours();
  if (h >= WAKING_FROM_H && h < WAKING_TO_H) return at;
  const target = new Date(at);
  if (h >= WAKING_TO_H) target.setDate(target.getDate() + 1);
  target.setHours(WAKING_FROM_H, 0, 0, 0);
  return target.getTime();
}

/** i18n key describing what a prompt is asking for — the card's subtitle. */
export const FEEL_PROMPT_KEY: Record<FeelReadKind, string> = {
  immediate: "session.feel.promptImmediate",
  recovery: "session.feel.promptRecovery",
};

/** i18n key for the one-line reason the prompt exists — why ask twice. */
export const FEEL_PROMPT_WHY_KEY: Record<FeelReadKind, string> = {
  immediate: "session.feel.whyImmediate",
  recovery: "session.feel.whyRecovery",
};
