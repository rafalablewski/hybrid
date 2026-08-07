"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { buildNotifications, type ActivityAssignment, type NotifFeed, type SocialNotifItem } from "@hybrid/core";
import { useSessions, sessionsKey } from "./use-sessions";
import { useCheckins, checkinsKey } from "./use-checkins";
import { useNotifRead } from "./notif-read";

/**
 * The notification feed, live.
 *
 * ONE hook so the bell badge and the notifications screen are literally the
 * same number — they used to be two computations over two caches (the badge
 * counted the training feed only, the screen counted training + social), which
 * is why the badge could read 3 over a list of 7.
 *
 * "Live" is three things, none of them a reload:
 *   • every source is a react-query key, so a mutation anywhere in the app
 *     (logging a session, answering the check-in, approving a request) already
 *     invalidates it and the bell re-counts;
 *   • the social + assignment queries poll on an interval and revalidate on
 *     window focus, so an event raised on someone else's device lands here on
 *     its own;
 *   • the read state is a store subscription, so marking the list read empties
 *     the badge in the same frame.
 */
export const socialNotifKey = ["social", "notifications"] as const;
export const assignmentsKey = ["assignments"] as const;

/** How often the server-side sources are re-asked while the tab is open. */
const POLL_MS = 60_000;

type AssignmentRow = { id: string; name: string; date: string; status: string };

async function fetchSocialNotifs(): Promise<SocialNotifItem[]> {
  const res = await fetch("/api/social/notifications");
  // Signed out / the social tables not yet migrated are real answers: none.
  if (!res.ok) return [];
  const d = (await res.json()) as { notifications?: SocialNotifItem[] };
  return d.notifications ?? [];
}

async function fetchAssignments(): Promise<ActivityAssignment[]> {
  const res = await fetch("/api/assignments");
  if (!res.ok) return [];
  const d = (await res.json()) as { assignments?: AssignmentRow[] };
  return d.assignments ?? [];
}

export interface UseNotifications extends NotifFeed {
  /** Re-ask every source now (the screen's pull-to-refresh equivalent). */
  refresh: () => void;
}

export function useNotifications(): UseNotifications {
  const { sessions } = useSessions();
  const checkins = useCheckins();
  const read = useNotifRead();
  const qc = useQueryClient();

  const social = useQuery({
    queryKey: socialNotifKey,
    queryFn: fetchSocialNotifs,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
  });
  const assignments = useQuery({
    queryKey: assignmentsKey,
    queryFn: fetchAssignments,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
  });

  // The most recent readiness answer — what tells the feel schedule whether the
  // recovery read has been given. `weekOf` is the day the check-in covers; the
  // reads carry their own clock, so prefer the newest read's timestamp.
  const lastCheckinAt = useMemo(() => {
    const rows = checkins.data ?? [];
    let latest = 0;
    for (const c of rows) {
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
        sessions,
        assignments: assignments.data ?? [],
        social: social.data ?? [],
        lastCheckinAt,
        read,
      }),
    [sessions, assignments.data, social.data, lastCheckinAt, read],
  );

  // Stable, so a caller can put it in an effect's deps without re-arming it
  // on every render.
  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: socialNotifKey });
    void qc.invalidateQueries({ queryKey: assignmentsKey });
    void qc.invalidateQueries({ queryKey: sessionsKey });
    void qc.invalidateQueries({ queryKey: checkinsKey });
  }, [qc]);

  return { ...feed, refresh };
}
