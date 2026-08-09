/**
 * NOTIFICATIONS — one list, one read state, one badge.
 *
 * Three things were wrong with the bell, and all three had the same root cause:
 * there was no notifications MODEL. Each client assembled a screen out of two
 * unrelated fetches (the training feed from `activity.ts`, the social events
 * from `/api/social/notifications`) and the badge counted a THIRD thing — the
 * length of the training feed alone, recomputed independently on Today.
 *
 *   1. NOTHING WAS EVER READ. There was no read state anywhere in the app, so
 *      the badge showed "how much training happened in the last fortnight",
 *      which never goes down. A count that cannot reach zero is not a badge,
 *      it is decoration, and an athlete learns within a week to ignore it.
 *
 *   2. THE LIST WAS A SNAPSHOT. Both screens fetched once on mount, so a kudos
 *      that landed while you were looking at the screen needed a reload to
 *      appear — and the badge, computed from a different cache on a different
 *      screen, could disagree with the list it was counting.
 *
 *   3. THE ONE NOTIFICATION THE APP ACTUALLY OWES YOU WAS MISSING. The feel
 *      reads (`feel-schedule.ts`) have a clock, a due time and an expiry, and
 *      `msUntilNextRead` was written to hand a client a reminder — but nothing
 *      ever asked for one. The recovery read in particular is invisible: it
 *      opens six hours after training, when the athlete is nowhere near the
 *      finish screen. The one prompt that has to travel to find you was the one
 *      prompt with no way to.
 *
 * So this module owns the whole thing: it MERGES the three sources into a
 * single sorted list, marks each row read or unread against a read state the
 * clients persist, and counts the unread. Both clients read the same list from
 * the same place — the bell badge is `unread` from this function, not a second
 * opinion computed elsewhere.
 *
 * THE READ MODEL is a watermark plus an exception set, because a pure watermark
 * cannot express an UPCOMING workout (its `at` is in the future, so any "read
 * everything up to now" sweep would either miss it or pre-read next week's
 * training). Opening the screen stamps `seenAt = now` and adds the ids of the
 * future-dated rows on screen to `readIds`. Everything else falls out of the
 * comparison for free, including rows that arrive later with an older
 * timestamp — a kudos from this morning fetched this afternoon is unread,
 * which is correct: you have not seen it.
 *
 * THE TWO EXCEPTIONS THE WATERMARK CANNOT HOLD EITHER, and why each is its own
 * id set rather than a flag on the row (the row is DERIVED — it is rebuilt from
 * the sessions and the social feed on every poll, so nothing written onto it
 * survives):
 *
 *   • `unreadIds` — rows pushed BACK to unread by hand (swipe right, "I'll deal
 *     with this later"). Their timestamp is older than `seenAt` by definition,
 *     so the watermark alone calls them read and the next sweep would silently
 *     undo the athlete's decision. This set BEATS the watermark. The passive
 *     sweep never clears it; the explicit "Mark all read" does, because that is
 *     the one gesture that means "all of it, including that".
 *
 *   • `dismissedIds` — rows swiped away. There is no server-side notification
 *     table to delete a row FROM (the list is a projection of training, social
 *     events and the feel schedule), so a delete is a tombstone: the id is
 *     remembered and the row is filtered out of every later build.
 *
 * WHERE THE STATE LIVES: with the ACCOUNT, not the device. It began per-device
 * on the logger-prefs contract — small, idempotent, costing you at worst one
 * extra glance — and that argument held right up until a row could be DELETED.
 * A badge that disagrees across devices is a nuisance; a notification you threw
 * away coming back on the laptop is the app forgetting something you told it.
 * Every social app of any size stores this against the account, and so do we
 * now: the clients write through `NotifOp` (below) to `/api/notifications/state`
 * and keep their local copy as an offline cache, never as the source of truth.
 *
 * Nothing here fabricates a notification. No training, no social events and no
 * session waiting on a feel read yields an empty list and an honest zero.
 */
import type { AuroraIconName } from "./theme/icons";
import { buildActivityFeed, type ActivityAccent, type ActivityAssignment } from "./activity";
import { feelSchedule, type FeelPrompt } from "./feel-schedule";
import type { SocialNotifItem } from "./social";
import type { LoggedSession } from "./engines/session";

export type NotifSource = "training" | "social" | "feel";

/** Where tapping a row goes. The clients own the routing; this only names it. */
export type NotifAction =
  | { kind: "session"; sessionId: string }
  | { kind: "checkin" }
  | { kind: "calendar" }
  /** The social surface. `handle` names the actor for when a client grows a
   *  profile route of its own — neither has one today, so both open the feed. */
  | { kind: "social"; handle?: string };

export interface NotifItem {
  id: string;
  source: NotifSource;
  /** English fallback. Clients prefer `titleKey` where present. */
  title: string;
  /** i18n key for `title`, so the row localizes without the engine knowing a language. */
  titleKey?: string;
  /** Second line. Carries real names/figures, so it is not translatable wholesale. */
  detail: string;
  /** epoch ms — sorting, relative time, and the read watermark all use this. */
  at: number;
  icon: AuroraIconName;
  accent: ActivityAccent;
  read: boolean;
  /** Carries approve/deny (or accept/decline) buttons. */
  actionable: boolean;
  action?: NotifAction;
  /** The social payload behind a `social` row — the avatar initial + respond ids. */
  social?: SocialNotifItem;
  /**
   * Sort bucket, low first: 0 an open feel read, 1 a request waiting on you,
   * 2 an upcoming session, 3 everything that already happened. Exported so a
   * client can group the list without re-deriving the ordering.
   */
  rank: number;
}

export interface NotifFeed {
  items: NotifItem[];
  /** What the bell's badge shows. */
  unread: number;
}

// ------------------------------------------------------------ read state ----

export interface NotifReadState {
  /** Everything stamped at or before this instant is read. epoch ms. */
  seenAt: number;
  /**
   * Rows read individually, plus the future-dated rows a sweep can't cover.
   * Bounded — a read state is not a log.
   */
  readIds: string[];
  /** Rows put BACK to unread by hand. Beats the watermark; see the header. */
  unreadIds: string[];
  /** Rows swiped away. Filtered out of every later build, never rebuilt. */
  dismissedIds: string[];
}

export const DEFAULT_NOTIF_READ: NotifReadState = { seenAt: 0, readIds: [], unreadIds: [], dismissedIds: [] };

/** How many explicit ids each of the state's id sets keeps. Oldest drop first. */
export const NOTIF_READ_ID_CAP = 200;

/** One persisted id list, de-duplicated and bounded. */
const idList = (value: unknown): string[] =>
  Array.isArray(value)
    ? [...new Set(value.filter((x): x is string => typeof x === "string"))].slice(-NOTIF_READ_ID_CAP)
    : [];

/** Coerce anything persisted (an older shape, a corrupted blob) to a valid state. */
export function normalizeNotifRead(value: unknown): NotifReadState {
  const v = (value ?? {}) as Partial<NotifReadState>;
  const seenAt = typeof v.seenAt === "number" && Number.isFinite(v.seenAt) && v.seenAt > 0 ? v.seenAt : 0;
  return { seenAt, readIds: idList(v.readIds), unreadIds: idList(v.unreadIds), dismissedIds: idList(v.dismissedIds) };
}

/** Append to one id list, keeping each id once, newest last, within the cap. */
const push = (list: string[] | undefined, add: string[]): string[] =>
  [...(list ?? []).filter((id) => !add.includes(id)), ...add].slice(-NOTIF_READ_ID_CAP);

const drop = (list: string[] | undefined, remove: string[]): string[] =>
  (list ?? []).filter((id) => !remove.includes(id));

/** Is this row already read under `state`? A hand-set unread beats everything. */
export function isNotifRead(state: NotifReadState, item: { id: string; at: number }): boolean {
  if ((state.unreadIds ?? []).includes(item.id)) return false;
  return item.at <= state.seenAt || (state.readIds ?? []).includes(item.id);
}

/** Has this row been swiped away? */
export function isNotifDismissed(state: NotifReadState, id: string): boolean {
  return (state.dismissedIds ?? []).includes(id);
}

/** Mark ONE row read (tapping it). Clears a hand-set unread on the same row. */
export function markNotifRead(state: NotifReadState, id: string): NotifReadState {
  return { ...state, readIds: push(state.readIds, [id]), unreadIds: drop(state.unreadIds, [id]) };
}

/** Put ONE row BACK to unread (swipe right) — it returns to the New section. */
export function markNotifUnread(state: NotifReadState, id: string): NotifReadState {
  return { ...state, readIds: drop(state.readIds, [id]), unreadIds: push(state.unreadIds, [id]) };
}

/** Swipe a row away. The id is remembered so the projection can't rebuild it. */
export function dismissNotif(state: NotifReadState, id: string): NotifReadState {
  return {
    ...state,
    readIds: drop(state.readIds, [id]),
    unreadIds: drop(state.unreadIds, [id]),
    dismissedIds: push(state.dismissedIds, [id]),
  };
}

/**
 * The watermark move both sweeps share.
 *
 * It goes to `now` (not to the newest item's timestamp: a future assignment
 * would otherwise pre-read everything up to the day of the session). Rows dated
 * ahead of `now` are named explicitly instead — except any the athlete is
 * holding unread by hand, which must not be written into `readIds` behind them.
 */
const sweepTo = (state: NotifReadState, items: { id: string; at: number }[], now: number): NotifReadState => {
  const held = state.unreadIds ?? [];
  const future = items.filter((i) => i.at > now && !held.includes(i.id)).map((i) => i.id);
  return { ...state, seenAt: Math.max(state.seenAt, now), readIds: push(state.readIds, future) };
};

/**
 * The PASSIVE sweep — the screen marking what it has just shown you as seen.
 *
 * It never clears a hand-set unread: swiping a row right is a decision, and a
 * timer that fires a second and a half later has no standing to undo it. It
 * also returns the SAME object when there is nothing to sweep, so a screen that
 * re-arms it on every poll cannot rewrite the store (and re-render) in a loop.
 */
export function sweepNotifsRead(
  state: NotifReadState,
  items: { id: string; at: number }[],
  now: number = Date.now(),
): NotifReadState {
  const held = state.unreadIds ?? [];
  if (!items.some((i) => !isNotifRead(state, i) && !held.includes(i.id))) return state;
  return sweepTo(state, items, now);
}

/**
 * Mark every row currently on screen read — the EXPLICIT action.
 *
 * Unlike the passive sweep this DOES clear the rows held unread by hand: a
 * "mark all read" that leaves one row bold has not done what it says.
 */
export function markAllNotifsRead(
  state: NotifReadState,
  items: { id: string; at: number }[],
  now: number = Date.now(),
): NotifReadState {
  const next = sweepTo(state, items, now);
  return { ...next, unreadIds: drop(next.unreadIds, items.map((i) => i.id)) };
}

// ------------------------------------------------------------ the ops ------

/**
 * ONE notification decision, as a value.
 *
 * The read state is ACCOUNT state, not device state, and the thing that makes
 * that safe is syncing the DECISIONS rather than the resulting blob. Two
 * devices pushing whole states have to be merged, and a merge needs a rule for
 * "the phone says read, the laptop says unread" that nobody can state without
 * inventing per-id timestamps. Two devices pushing OPS need no rule: the server
 * applies them in arrival order, which is the order they happened in, which is
 * what the athlete would tell you happened.
 *
 * So this type is the whole write API. The clients apply an op locally for the
 * optimistic paint and send the same value on; the server applies it to the
 * canonical row with the same reducer below. One implementation, three callers,
 * no chance of the server and a client disagreeing about what "mark all read"
 * means.
 */
export type NotifOp =
  | { kind: "read"; id: string }
  | { kind: "unread"; id: string }
  | { kind: "dismiss"; id: string }
  | { kind: "sweep"; items: { id: string; at: number }[]; now: number }
  | { kind: "markAll"; items: { id: string; at: number }[]; now: number };

/** Apply one decision. Total over NotifOp — a new op cannot be forgotten here. */
export function applyNotifOp(state: NotifReadState, op: NotifOp): NotifReadState {
  switch (op.kind) {
    case "read":
      return markNotifRead(state, op.id);
    case "unread":
      return markNotifUnread(state, op.id);
    case "dismiss":
      return dismissNotif(state, op.id);
    case "sweep":
      return sweepNotifsRead(state, op.items, op.now);
    case "markAll":
      return markAllNotifsRead(state, op.items, op.now);
  }
}

/**
 * Replay a queue of decisions onto a state.
 *
 * This is what makes an offline queue honest: the server hands back the
 * canonical state, the client replays whatever it has not managed to send yet
 * on top, and the screen shows the truth PLUS the decisions still in flight —
 * rather than briefly reverting a row the athlete has already swiped.
 */
export function applyNotifOps(state: NotifReadState, ops: NotifOp[]): NotifReadState {
  return ops.reduce(applyNotifOp, state);
}

/** How many ids one op may carry. A sweep covers the visible list, not a log. */
const NOTIF_OP_ITEM_CAP = 200;

/**
 * Coerce an op off the wire. Returns null for anything unrecognised, so the
 * server can reject rather than guess — this is a request body, not our data.
 *
 * `now` is deliberately NOT trusted as sent: a device with a badly wrong clock
 * would otherwise push the watermark into the future and mark everything read
 * for good. The caller passes the clock it trusts (`ceiling`), and a stamp
 * ahead of it is clamped back.
 */
export function normalizeNotifOp(value: unknown, ceiling: number = Date.now()): NotifOp | null {
  const v = (value ?? {}) as Record<string, unknown>;
  const id = typeof v.id === "string" ? v.id.slice(0, 200) : "";
  if (v.kind === "read" || v.kind === "unread" || v.kind === "dismiss") {
    return id ? { kind: v.kind, id } : null;
  }
  if (v.kind === "sweep" || v.kind === "markAll") {
    if (!Array.isArray(v.items)) return null;
    const items = v.items
      .filter((i): i is { id: string; at: number } => {
        const r = (i ?? {}) as Record<string, unknown>;
        return typeof r.id === "string" && typeof r.at === "number" && Number.isFinite(r.at);
      })
      .map((i) => ({ id: i.id.slice(0, 200), at: i.at }))
      .slice(0, NOTIF_OP_ITEM_CAP);
    const sent = typeof v.now === "number" && Number.isFinite(v.now) ? v.now : ceiling;
    return { kind: v.kind, items, now: Math.min(sent, ceiling) };
  }
  return null;
}

/** Are any of these rows unread? Cheap enough for a badge that re-renders. */
export function countUnread(state: NotifReadState, items: { id: string; at: number }[]): number {
  return items.reduce((n, i) => n + (isNotifRead(state, i) ? 0 : 1), 0);
}

// --------------------------------------------------------------- the feed ---

export interface NotifInput {
  sessions: LoggedSession[];
  assignments?: ActivityAssignment[];
  /** Already formatted by `buildSocialNotifications` (the API does that). */
  social?: SocialNotifItem[];
  /** ISO/epoch of the most recent readiness check-in — gates the recovery read. */
  lastCheckinAt?: string | number | null;
  read?: NotifReadState;
  now?: number;
  /** Cap on returned rows (default 40). */
  limit?: number;
}

const FEEL_TITLE: Record<FeelPrompt["kind"], { key: string; en: string }> = {
  immediate: { key: "notif.feel.immediate", en: "How hard was that?" },
  recovery: { key: "notif.feel.recovery", en: "How did you absorb it?" },
};

const FEEL_ICON: Record<FeelPrompt["kind"], AuroraIconName> = {
  immediate: "bolt",
  recovery: "moon",
};

const FEEL_ACCENT: Record<FeelPrompt["kind"], ActivityAccent> = {
  immediate: "amber",
  recovery: "violet",
};

const hoursSince = (from: number, now: number): number => Math.max(0, Math.round((now - from) / 3_600_000));

/**
 * The rows a feel read is owed on.
 *
 * Only OPEN reads become notifications: an unanswered read past its window is
 * recorded and not nagged about (feel-schedule's `missed`), and an answered one
 * has nothing to ask. The row is stamped at `dueAt` rather than `now` so it
 * ages honestly in the list — "6h ago" is the truth about when the app started
 * waiting, and it keeps the read watermark meaningful across refreshes.
 */
function feelItems(input: NotifInput, now: number): NotifItem[] {
  const schedule = feelSchedule({ sessions: input.sessions, lastCheckinAt: input.lastCheckinAt, now });
  return schedule.due.map((p): NotifItem => {
    const t = FEEL_TITLE[p.kind];
    const h = hoursSince(p.dueAt, now);
    const detail =
      p.kind === "immediate"
        ? `${p.session.title} – log your effort while it's still fresh`
        : h < 1
          ? `${p.session.title} – check in and say how you're recovering`
          : `${p.session.title} – ${h}h on, check in and say how you're recovering`;
    return {
      id: `feel-${p.kind}-${p.session.id}`,
      source: "feel",
      title: t.en,
      titleKey: t.key,
      detail,
      at: p.dueAt,
      icon: FEEL_ICON[p.kind],
      accent: FEEL_ACCENT[p.kind],
      read: false,
      actionable: false,
      action: p.kind === "immediate" ? { kind: "session", sessionId: p.session.id } : { kind: "checkin" },
      rank: 0,
    };
  });
}

/**
 * Build the merged, sorted, read-marked notification list.
 *
 * Ordering is by URGENCY first and recency second, because a list sorted purely
 * by timestamp buries the two rows that want something from you: a feel read
 * that closes in an hour would sit under a week-old kudos.
 */
export function buildNotifications(input: NotifInput): NotifFeed {
  const now = input.now ?? Date.now();
  const read = normalizeNotifRead(input.read);

  const training = buildActivityFeed({ sessions: input.sessions, assignments: input.assignments, now }).map(
    (it): NotifItem => ({
      id: it.id,
      source: "training",
      title: it.title,
      titleKey: it.kind === "upcoming" ? "notif.training.upcoming" : "notif.training.completed",
      detail: it.detail,
      at: it.at,
      icon: it.icon,
      accent: it.accent,
      read: false,
      actionable: false,
      action:
        it.kind === "upcoming"
          ? { kind: "calendar" }
          : { kind: "session", sessionId: it.id.replace(/^session-/, "") },
      rank: it.kind === "upcoming" ? 2 : 3,
    }),
  );

  const social = (input.social ?? []).map(
    (n): NotifItem => ({
      id: `social-${n.id}`,
      source: "social",
      title: n.title,
      // Not `n.when` — every row already carries its relative time in the
      // trailing column, and the same fact twice in one row is noise.
      detail: n.handle ? `@${n.handle}` : "",
      at: n.at,
      icon: "user-circle",
      accent: n.accent,
      read: false,
      actionable: n.actionable,
      action: { kind: "social", handle: n.handle },
      social: n,
      rank: n.actionable ? 1 : 3,
    }),
  );

  // A feel read the athlete has already answered is dropped by feelSchedule, so
  // the only de-duplication left is against ourselves — two calls, one list.
  // Dismissed rows are dropped BEFORE the limit, so swiping one away lets the
  // next row up rather than leaving a shorter list.
  const merged = [...feelItems(input, now), ...social, ...training];
  const seen = new Set<string>();
  const items = merged
    .filter((i) => !isNotifDismissed(read, i.id))
    .filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)))
    .map((i) => ({ ...i, read: isNotifRead(read, i) }))
    .sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : a.rank === 2 ? a.at - b.at : b.at - a.at))
    .slice(0, input.limit ?? 40);

  return { items, unread: items.reduce((n, i) => n + (i.read ? 0 : 1), 0) };
}

// ------------------------------------------------------ new versus seen ----

export interface NotifSections {
  /** The New section: what this visit has not dealt with yet. */
  fresh: NotifItem[];
  /** The Seen section: read on an earlier visit, kept and out of the way. */
  seen: NotifItem[];
}

/**
 * Split the list into the NEW section and the SEEN section.
 *
 * `read` alone cannot draw this line, and that is the whole reason this
 * function exists rather than a `filter` in each client. The screen sweeps
 * itself read a second and a half after it opens, so a split on `read` would
 * tip every row you are still looking at into "Seen" under your eyes — the list
 * would reshuffle itself while being read, which is the failure the frozen
 * "New" markers were introduced to avoid in the first place.
 *
 * So the line is drawn by the VISIT: `visitNew` holds every id that was unread
 * at any point since the screen was opened (a client keeps it in a ref, and
 * clears it on each focus). Those rows stay in New until you leave and come
 * back; everything already dealt with sits under Seen. A row swiped back to
 * unread re-enters `visitNew` on the next render and climbs to New, which is
 * exactly the feedback that gesture owes.
 */
export function splitNotifications(items: NotifItem[], visitNew: ReadonlySet<string>): NotifSections {
  const fresh: NotifItem[] = [];
  const seen: NotifItem[] = [];
  for (const i of items) (visitNew.has(i.id) || !i.read ? fresh : seen).push(i);
  return { fresh, seen };
}
