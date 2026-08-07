import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_NOTIF_READ,
  markAllNotifsRead,
  markNotifRead,
  normalizeNotifRead,
  type NotifReadState,
} from "@hybrid/core";

/**
 * Which notifications you have already seen — persisted per device
 * (AsyncStorage), shared by the Home bell badge and the notifications screen
 * through one store, so the two can never disagree.
 *
 * Per-device is the same contract as the logger preferences: the state is small
 * and idempotent (reading on your phone and again on your laptop costs you one
 * extra glance, never a lost notification), and it needs no migration on a
 * database the sandbox cannot reach. Server-side sync is tracked as
 * `prefs-cross-device-sync`.
 *
 * Mirrors apps/web/lib/notif-read.ts.
 */
const KEY = "hybrid.notifRead";

let state: NotifReadState = DEFAULT_NOTIF_READ;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

AsyncStorage.getItem(KEY)
  .then((v) => {
    if (!v) return;
    try {
      state = normalizeNotifRead(JSON.parse(v));
      emit();
    } catch {
      /* keep the default: everything unread, which is the safe direction */
    }
  })
  .catch(() => {});

function persist(next: NotifReadState): void {
  state = next;
  AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  emit();
}

/** Mark one row read (tapping it). */
export function readNotification(id: string): void {
  persist(markNotifRead(state, id));
}

/** Mark every row currently on screen read. */
export function readAllNotifications(items: { id: string; at: number }[]): void {
  persist(markAllNotifsRead(state, items));
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The current read state (the default — everything unread — until hydrated).
 *  A badge that briefly over-counts beats one that hides a notification. */
export function useNotifRead(): NotifReadState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}
