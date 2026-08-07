import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { buildNotifications, type ActivityAssignment, type NotifFeed, type SocialNotifItem } from "@hybrid/core";
import { fetchAssignments } from "./api";
import { sapi } from "./social-api";
import { qk, useSessionsQuery, useCheckinsQuery } from "./queries";
import { useNotifRead } from "./notif-read";

/**
 * The notification feed, live. Mirrors apps/web/lib/use-notifications.ts.
 *
 * ONE hook so the Home bell badge and the notifications screen are literally
 * the same number — they used to be two computations over two sources (the
 * badge counted the training feed only, the screen counted training + social),
 * which is why the badge could read 3 over a list of 7.
 *
 * "Live" is three things, none of them a reload:
 *   • every source is a react-query key, so a mutation anywhere in the app
 *     (logging a session, answering the check-in, approving a request) already
 *     invalidates it and the bell re-counts;
 *   • the social + assignment queries poll on an interval and revalidate when
 *     the app returns to the foreground (query.tsx wires focusManager to
 *     AppState), so an event raised elsewhere lands here on its own;
 *   • the read state is a store subscription, so marking the list read empties
 *     the badge in the same frame.
 */
export const socialNotifKey = ["social", "notifications"] as const;
export const assignmentsKey = ["assignments"] as const;

/** How often the server-side sources are re-asked while the app is foregrounded. */
const POLL_MS = 60_000;

async function fetchSocialNotifs(): Promise<SocialNotifItem[]> {
  const d = await sapi<{ notifications?: SocialNotifItem[] }>("/api/social/notifications");
  return d.notifications ?? [];
}

async function fetchNotifAssignments(): Promise<ActivityAssignment[]> {
  return (await fetchAssignments()) as ActivityAssignment[];
}

export interface UseNotifications extends NotifFeed {
  /** Re-ask every source now. */
  refresh: () => void;
}

export function useNotifications(): UseNotifications {
  const sessions = useSessionsQuery();
  const checkins = useCheckinsQuery();
  const read = useNotifRead();
  const qc = useQueryClient();

  const social = useQuery({
    queryKey: socialNotifKey,
    queryFn: fetchSocialNotifs,
    refetchInterval: POLL_MS,
  });
  const assignments = useQuery({
    queryKey: assignmentsKey,
    queryFn: fetchNotifAssignments,
    refetchInterval: POLL_MS,
  });

  // The most recent readiness answer — what tells the feel schedule whether the
  // recovery read has been given. The reads carry their own clock, so prefer
  // the newest read's timestamp over the day the row covers.
  const lastCheckinAt = useMemo(() => {
    let latest = 0;
    for (const c of checkins.data ?? []) {
      for (const r of c.reads ?? []) {
        const t = Date.parse(r.loggedAt);
        if (Number.isFinite(t)) latest = Math.max(latest, t);
      }
      const created = Date.parse(c.createdAt ?? c.weekOf);
      if (Number.isFinite(created)) latest = Math.max(latest, created);
    }
    return latest || null;
  }, [checkins.data]);

  const feed = useMemo(
    () =>
      buildNotifications({
        sessions: sessions.data ?? [],
        assignments: assignments.data ?? [],
        social: social.data ?? [],
        lastCheckinAt,
        read,
      }),
    [sessions.data, assignments.data, social.data, lastCheckinAt, read],
  );

  // STABLE — a screen wires this into useFocusEffect, and a callback that
  // changed every render would re-fire the effect while focused and refetch in
  // a loop (the same trap query.tsx's useRefreshOnFocus documents).
  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: socialNotifKey });
    void qc.invalidateQueries({ queryKey: assignmentsKey });
    void qc.invalidateQueries({ queryKey: qk.sessions });
    void qc.invalidateQueries({ queryKey: qk.checkins });
  }, [qc]);

  return { ...feed, refresh };
}
