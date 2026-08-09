"use client";

import { useSyncExternalStore } from "react";
import {
  createNotifSync,
  normalizeNotifCache,
  normalizeNotifRead,
  DEFAULT_NOTIF_READ,
  type NotifOp,
  type NotifReadState,
  type NotifSyncCache,
  type NotifSyncReply,
} from "@hybrid/core";

/**
 * Which notifications you have already seen — per ACCOUNT, synced through
 * /api/notifications/state, with localStorage as the offline cache.
 *
 * It used to be per-device on the logger-prefs contract: small, idempotent,
 * costing you at worst one extra glance. That argument held right up until a
 * row could be DELETED. A badge that disagrees between your laptop and your
 * phone is a nuisance; a notification you deliberately threw away coming back
 * on the other device is the app forgetting something you told it.
 *
 * All of the interesting behaviour — optimistic apply, the offline queue,
 * rebasing onto server truth without reverting a swipe still in flight — lives
 * in @hybrid/core's createNotifSync, so this file is only the four ports.
 * Mirrors apps/mobile/lib/notif-read.ts.
 */
const KEY = "hybrid.notifRead";
const ENDPOINT = "/api/notifications/state";

const sync = createNotifSync({
  load: async () => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(KEY);
      return raw ? normalizeNotifCache(JSON.parse(raw), normalizeNotifRead) : null;
    } catch {
      // Keep the default — everything unread, which is the safe direction.
      return null;
    }
  },
  save: (cache: NotifSyncCache) => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(cache));
    } catch {
      /* a full/blocked store must not break the screen */
    }
  },
  pull: async () => reply(await request("GET")),
  push: async (ops: NotifOp[]) => reply(await request("POST", { ops })),
});

async function request(method: "GET" | "POST", body?: unknown): Promise<Response | null> {
  try {
    return await fetch(ENDPOINT, {
      method,
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
  } catch {
    // Offline. The queue holds; nothing is lost.
    return null;
  }
}

/** A non-OK answer is a real one: signed out, or not migrated. Either way the
 *  server is not storing for us, and this device stays its own source of truth. */
async function reply(res: Response | null): Promise<NotifSyncReply | null> {
  if (!res?.ok) return null;
  try {
    const d = (await res.json()) as { state?: unknown; synced?: boolean };
    return { state: normalizeNotifRead(d.state), synced: d.synced === true };
  } catch {
    return null;
  }
}

/** Re-drain the queue when the tab comes back — the moment connectivity most
 *  often returns, and the same signal react-query already revalidates on. */
if (typeof window !== "undefined") {
  window.addEventListener("focus", () => sync.flush());
  window.addEventListener("online", () => sync.flush());
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

/** The current read state. The server render uses the default (all unread) and
 *  the client hydrates — a badge that briefly over-counts beats one that hides
 *  a notification. */
export function useNotifRead(): NotifReadState {
  return useSyncExternalStore(sync.subscribe, sync.get, () => DEFAULT_NOTIF_READ);
}
