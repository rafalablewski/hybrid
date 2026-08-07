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
}

export const DEFAULT_NOTIF_READ: NotifReadState = { seenAt: 0, readIds: [] };

/** How many explicit ids a read state keeps. Oldest are dropped first. */
export const NOTIF_READ_ID_CAP = 200;

/** Coerce anything persisted (an older shape, a corrupted blob) to a valid state. */
export function normalizeNotifRead(value: unknown): NotifReadState {
  const v = (value ?? {}) as Partial<NotifReadState>;
  const seenAt = typeof v.seenAt === "number" && Number.isFinite(v.seenAt) && v.seenAt > 0 ? v.seenAt : 0;
  const ids = Array.isArray(v.readIds) ? v.readIds.filter((x): x is string => typeof x === "string") : [];
  return { seenAt, readIds: [...new Set(ids)].slice(-NOTIF_READ_ID_CAP) };
}

const withIds = (state: NotifReadState, add: string[]): NotifReadState => {
  if (!add.length) return state;
  const next = [...state.readIds.filter((id) => !add.includes(id)), ...add];
  return { ...state, readIds: next.slice(-NOTIF_READ_ID_CAP) };
};

/** Is this row already read under `state`? */
export function isNotifRead(state: NotifReadState, item: { id: string; at: number }): boolean {
  return item.at <= state.seenAt || state.readIds.includes(item.id);
}

/** Mark ONE row read (tapping it). */
export function markNotifRead(state: NotifReadState, id: string): NotifReadState {
  return withIds(state, [id]);
}

/**
 * Mark every row currently on screen read.
 *
 * The watermark moves to `now` (not to the newest item's timestamp: a future
 * assignment would otherwise pre-read everything up to the day of the session).
 * Rows dated ahead of `now` are named explicitly instead.
 */
export function markAllNotifsRead(
  state: NotifReadState,
  items: { id: string; at: number }[],
  now: number = Date.now(),
): NotifReadState {
  const future = items.filter((i) => i.at > now).map((i) => i.id);
  return withIds({ ...state, seenAt: Math.max(state.seenAt, now) }, future);
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
  const merged = [...feelItems(input, now), ...social, ...training];
  const seen = new Set<string>();
  const items = merged
    .filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)))
    .map((i) => ({ ...i, read: isNotifRead(read, i) }))
    .sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : a.rank === 2 ? a.at - b.at : b.at - a.at))
    .slice(0, input.limit ?? 40);

  return { items, unread: items.reduce((n, i) => n + (i.read ? 0 : 1), 0) };
}
