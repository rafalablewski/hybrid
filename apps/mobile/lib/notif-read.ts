import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createNotifSync,
  normalizeNotifCache,
  normalizeNotifRead,
  type NotifOp,
  type NotifReadState,
  type NotifSyncCache,
} from "@hybrid/core";
import { fetchNotifState, pushNotifOps } from "./api";

/**
 * Which notifications you have already seen — per ACCOUNT, synced through
 * /api/notifications/state, with AsyncStorage as the offline cache.
 *
 * It used to be per-device on the logger-prefs contract: small, idempotent,
 * costing you at worst one extra glance. That argument held right up until a
 * row could be DELETED. A badge that disagrees between your phone and your
 * laptop is a nuisance; a notification you deliberately threw away coming back
 * on the other device is the app forgetting something you told it.
 *
 * All of the interesting behaviour — optimistic apply, the offline queue,
 * rebasing onto server truth without reverting a swipe still in flight — lives
 * in @hybrid/core's createNotifSync, so this file is only the four ports.
 * Mirrors apps/web/lib/notif-read.ts.
 */
const KEY = "hybrid.notifRead";

const sync = createNotifSync({
  load: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      return raw ? normalizeNotifCache(JSON.parse(raw), normalizeNotifRead) : null;
    } catch {
      // Keep the default — everything unread, which is the safe direction.
      return null;
    }
  },
  save: (cache: NotifSyncCache) => {
    AsyncStorage.setItem(KEY, JSON.stringify(cache)).catch(() => {});
  },
  pull: async () => {
    const r = await fetchNotifState();
    return r ? { state: normalizeNotifRead(r.state), synced: r.synced } : null;
  },
  push: async (ops: NotifOp[]) => {
    const r = await pushNotifOps(ops);
    return r ? { state: normalizeNotifRead(r.state), synced: r.synced } : null;
  },
});

/** Drain the queue when the app comes back to the foreground — where a phone
 *  most often regains connectivity. Wired from the app's AppState listener
 *  (lib/query.tsx) so there is one place that knows about foregrounding. */
export function flushNotifications(): void {
  sync.flush();
}

/** Mark one row read (tapping it). */
export function readNotification(id: string): void {
  sync.dispatch({ kind: "read", id });
}

/** Put one row back to unread (swipe right). */
export function unreadNotification(id: string): void {
  sync.dispatch({ kind: "unread", id });
}

/** Delete one row (swipe left) — a tombstone, since the list is a projection. */
export function dismissNotification(id: string): void {
  sync.dispatch({ kind: "dismiss", id });
}

/** The passive sweep: mark what the screen has just shown as seen. */
export function sweepNotifications(items: { id: string; at: number }[]): void {
  sync.dispatch({ kind: "sweep", items, now: Date.now() });
}

/** Mark every row currently on screen read — the explicit action. */
export function readAllNotifications(items: { id: string; at: number }[]): void {
  sync.dispatch({ kind: "markAll", items, now: Date.now() });
}

/** The current read state (the default — everything unread — until hydrated).
 *  A badge that briefly over-counts beats one that hides a notification. */
export function useNotifRead(): NotifReadState {
  return useSyncExternalStore(sync.subscribe, sync.get, sync.get);
}
