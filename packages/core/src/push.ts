/**
 * PUSH — the three notifications the app is allowed to send, and their clock.
 *
 * The bell (notifications.ts) is a PROJECTION: it can only tell you something
 * while you are already holding the phone with HYBRID open. Everything it
 * surfaces is therefore something you had to come back for on your own, which
 * makes it a good list and a bad retention loop. The one prompt that has to
 * TRAVEL to find you — the morning readiness read, at 07:00, before anyone
 * opens a training app — had no way to.
 *
 * This module is the delivery side, and it is deliberately SMALL. Three
 * notifications ship, and nothing else until these three have earned it:
 *
 *   1. `checkin` — the morning readiness nudge. The one notification the app
 *      genuinely owes: readiness gates the day's prescription, so a day with no
 *      read is a day the engines guess. Sent once, in a three-hour window
 *      around the athlete's own 07:00, never twice, and it gives up after a
 *      week of silence (see nudgeDecision).
 *   2. `coach` — your coach assigned you work. Somebody else acted on your
 *      account; you cannot discover that by not opening the app.
 *   3. `cosign` — somebody asks you to co-sign a lift they claim they hit. A
 *      request that expires unanswered is worth nothing to either side, and the
 *      witness has no reason to be in the app at that moment.
 *
 * WHAT IS NOT HERE, on purpose: streaks, weekly recaps, product news, "you
 * haven't trained in 3 days". Each is a message about US wanting attention
 * rather than about something that happened to YOU, and the fastest way to
 * teach an athlete to swipe the whole channel away is to mix those in with the
 * three above. The two account switches that promised a recap and product news
 * were retired with this change rather than left switching nothing.
 *
 * EVERY NOTIFICATION NAMES ITS SURFACE. `route` is the in-app path the tap
 * opens, and it is part of the message rather than a client-side lookup: a
 * notification that says "your coach assigned Monday's session" and lands you
 * on Today has told you something and then made you go find it. The routes are
 * a closed set (PUSH_ROUTE) and the client validates against it, because a
 * payload arrives over the network and a route is a navigation instruction.
 *
 * COPY IS LOCALIZED HERE, not on the device: a push is rendered by iOS from
 * what the server sent, so the SERVER has to know the language. The device
 * reports its locale when it registers its token, and the sender passes it in.
 */
import { makeT, type Lang } from "./i18n";

/** The three. Adding a fourth is a product decision, not a code change. */
export const PUSH_KINDS = ["checkin", "coach", "cosign"] as const;
export type PushKind = (typeof PUSH_KINDS)[number];

/**
 * Which account switch governs each kind — the keys in ACCOUNT_NOTIF_ROWS
 * (account.ts), so the switch an athlete sees and the gate the sender applies
 * are the same name in both places.
 */
export const PUSH_PREF_KEY: Record<PushKind, string> = {
  checkin: "checkinReminders",
  coach: "coachMessages",
  cosign: "cosignRequests",
};

/**
 * Where a tap lands, per kind. Mobile routes (expo-router paths) — the mobile
 * app is the only client that can receive a push.
 *
 *   checkin → the readiness screen itself, mid-question, not Today.
 *   coach   → the calendar, where an assigned session is dated. The same target
 *             the bell's `calendar` NotifAction opens.
 *   cosign  → the feed, which is where CosignInbox renders the request with its
 *             co-sign / decline buttons.
 */
export const PUSH_ROUTE: Record<PushKind, string> = {
  checkin: "/checkin",
  coach: "/calendar",
  cosign: "/feed",
};

/** One notification, fully rendered — what the sender turns into an APNs payload. */
export interface PushMessage {
  kind: PushKind;
  title: string;
  body: string;
  /** In-app path the tap opens. Always one of PUSH_ROUTE's values. */
  route: string;
  /**
   * APNs collapse id: a later notification with the same id REPLACES the one on
   * the lock screen instead of stacking under it. Set for the kinds where two
   * unread copies would be noise (two mornings' nudges say the same thing);
   * left off where each notification is its own event (two different coach
   * assignments are two facts).
   */
  collapseId?: string;
}

/** Fill `{name}` placeholders. Unknown placeholders are left visible — a stray
 *  `{coach}` in a notification is a bug worth seeing, not worth hiding. */
const fill = (s: string, vars: Record<string, string>): string =>
  s.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);

/**
 * THE MORNING READINESS NUDGE.
 *
 * Collapsed by day: if yesterday's went unopened it is replaced, not stacked —
 * two identical prompts on a lock screen is how a channel gets muted.
 */
export function checkinNudgePush(opts: { lang?: Lang; day?: string } = {}): PushMessage {
  const t = makeT(opts.lang ?? "en");
  return {
    kind: "checkin",
    title: t("push.checkin.title"),
    body: t("push.checkin.body"),
    route: PUSH_ROUTE.checkin,
    collapseId: "checkin-nudge",
  };
}

/**
 * YOUR COACH ASSIGNED WORK.
 *
 * `when` is a already-formatted day label from the caller (the server knows the
 * date; only the caller knows whether it is "today" or a date) and may be
 * empty, in which case the body is just the session's name.
 */
export function coachAssignmentPush(input: {
  coach: string;
  session: string;
  when?: string;
  lang?: Lang;
}): PushMessage {
  const t = makeT(input.lang ?? "en");
  const coach = input.coach.trim() || t("push.coach.fallback-coach");
  const when = (input.when ?? "").trim();
  return {
    kind: "coach",
    title: fill(t("push.coach.title"), { coach }),
    body: when
      ? fill(t("push.coach.body"), { session: input.session, when })
      : fill(t("push.coach.body-undated"), { session: input.session }),
    route: PUSH_ROUTE.coach,
  };
}

/**
 * YOUR COACH ASSIGNED A WHOLE PROGRAM.
 *
 * The same KIND (one switch governs "my coach assigned me work", because an
 * athlete who wants one of these wants both), with its own copy: a program
 * materializes dozens of dated sessions, and sending one notification per
 * session would be the single most effective way to get the channel muted.
 * One notification, naming the program and when it starts.
 */
export function coachProgramPush(input: {
  coach: string;
  program: string;
  when?: string;
  lang?: Lang;
}): PushMessage {
  const t = makeT(input.lang ?? "en");
  const coach = input.coach.trim() || t("push.coach.fallback-coach");
  const when = (input.when ?? "").trim();
  return {
    kind: "coach",
    title: fill(t("push.coach.title-program"), { coach }),
    body: when
      ? fill(t("push.coach.body-program"), { program: input.program, when })
      : fill(t("push.coach.body-program-undated"), { program: input.program }),
    route: PUSH_ROUTE.coach,
  };
}

/**
 * A CO-SIGN REQUEST ON A CLAIMED RECORD.
 *
 * `load` is pre-formatted by the caller (it owns the athlete's unit) and is
 * optional: a lift with no usable load still gets asked about, without a blank
 * where the number should be.
 */
export function cosignRequestPush(input: {
  from: string;
  lift: string;
  load?: string;
  lang?: Lang;
}): PushMessage {
  const t = makeT(input.lang ?? "en");
  const from = input.from.trim() || t("push.cosign.fallback-athlete");
  const load = (input.load ?? "").trim();
  return {
    kind: "cosign",
    title: t("push.cosign.title"),
    body: load
      ? fill(t("push.cosign.body"), { from, lift: input.lift, load })
      : fill(t("push.cosign.body-noload"), { from, lift: input.lift }),
    route: PUSH_ROUTE.cosign,
  };
}

/**
 * Coerce a route off a notification payload.
 *
 * The client calls this before navigating. A push payload is network input, and
 * `router.push(payload.route)` on an unvalidated string is a redirect an
 * attacker with a stolen APNs key writes for you — so only the three routes
 * this module publishes are accepted, and anything else falls back to null (the
 * client opens the bell instead of guessing).
 */
export function normalizePushRoute(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const allowed = Object.values(PUSH_ROUTE);
  return allowed.includes(value) ? value : null;
}

/** Coerce a kind off a payload, for a client that groups or counts by kind. */
export function normalizePushKind(value: unknown): PushKind | null {
  return typeof value === "string" && (PUSH_KINDS as readonly string[]).includes(value)
    ? (value as PushKind)
    : null;
}

// ------------------------------------------------------------- the clock ----

/**
 * The athlete's own 07:00 — the hour the nudge aims at.
 *
 * Not a server hour: 07:00 UTC is 02:00 in Los Angeles, and a training app that
 * wakes you at two in the morning has spent its one notification permission.
 * Each registered device carries its IANA timezone, and the sender computes the
 * local hour from it.
 */
export const NUDGE_HOUR = 7;

/**
 * How long after NUDGE_HOUR the nudge may still be sent.
 *
 * The window exists because the cron is HOURLY and a missed run must not cost
 * the day: 07:00 is the target, 10:00 is the last hour at which "check in for
 * today" is still a useful thing to say. Past that the day's training has
 * usually started and a readiness read taken at noon is a different
 * measurement (see feel-schedule.ts on why the clock matters).
 */
export const NUDGE_WINDOW_HOURS = 3;

/**
 * How many unanswered nudges before we stop.
 *
 * A daily prompt to an account that has stopped answering is not retention, it
 * is the reason people turn notifications off for a whole app — and once off,
 * the channel is gone for the athletes who WOULD have answered. Seven straight
 * mornings of silence is a clear enough answer. One check-in resets the count
 * (see `streak` below), so the loop restarts the moment the athlete comes back.
 */
export const NUDGE_GIVE_UP = 7;

export interface NudgeInput {
  /** The device's local hour, 0–23 (the caller resolves it from the timezone). */
  localHour: number;
  /** The device's local day, `YYYY-MM-DD`. */
  localDay: string;
  /** Local day of the most recent readiness check-in, or null if never. */
  lastCheckinDay: string | null;
  /** Local day of the last nudge sent to this device, or null if never. */
  lastNudgeDay: string | null;
  /** Nudges sent since the last check-in, as recorded on the device row. */
  nudgeStreak: number;
  /**
   * Has this athlete ever trained or checked in? A fresh install has nothing to
   * be nudged ABOUT, and a readiness prompt on day zero — before the app has
   * shown what a readiness read is for — is the worst possible first push.
   */
  active: boolean;
}

export interface NudgeDecision {
  send: boolean;
  /** Why, in one phrase. Logged by the cron so a quiet morning is explainable. */
  why: string;
  /**
   * The streak to persist. A check-in after the last nudge zeroes it here
   * rather than at the check-in write: the check-in route has no business
   * knowing about push bookkeeping, and this is the one place that already
   * compares the two clocks.
   */
  streak: number;
}

/**
 * Should this device get the morning nudge right now?
 *
 * Pure, and the whole rule: the cron does a query and then asks this per device.
 * Day strings are compared as strings — `YYYY-MM-DD` sorts chronologically, and
 * both sides are already resolved into the SAME timezone (the device's) by the
 * caller, so there is no clock arithmetic left to get wrong here.
 */
export function nudgeDecision(i: NudgeInput): NudgeDecision {
  // A check-in taken after the last nudge is an answer: the streak is over.
  const answered = !!i.lastCheckinDay && (!i.lastNudgeDay || i.lastCheckinDay > i.lastNudgeDay);
  const streak = answered ? 0 : Math.max(0, i.nudgeStreak);

  const no = (why: string): NudgeDecision => ({ send: false, why, streak });

  if (!i.active) return no("no training or check-in history yet");
  if (i.localHour < NUDGE_HOUR) return no("before the window");
  if (i.localHour > NUDGE_HOUR + NUDGE_WINDOW_HOURS) return no("after the window");
  if (i.lastCheckinDay === i.localDay) return no("already checked in today");
  if (i.lastNudgeDay === i.localDay) return no("already nudged today");
  if (streak >= NUDGE_GIVE_UP) return no(`${streak} unanswered — stopped asking`);
  return { send: true, why: "readiness read still open", streak: streak + 1 };
}
