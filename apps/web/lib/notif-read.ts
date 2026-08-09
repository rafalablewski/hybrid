"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_NOTIF_READ,
  dismissNotif,
  markAllNotifsRead,
  markNotifRead,
  markNotifUnread,
  normalizeNotifRead,
  sweepNotifsRead,
  type NotifReadState,
} from "@hybrid/core";

/**
 * Which notifications you have already seen — persisted per device
 * (localStorage), shared by the bell badge and the notifications screen through
 * one store, so the two can never disagree.
 *
 * Per-device is the same contract as the logger preferences: the state is small
 * and idempotent (reading on your phone and again on your laptop costs you one
 * extra glance, never a lost notification), and it needs no migration on a
 * database the sandbox cannot reach. Server-side sync is tracked as
 * `prefs-cross-device-sync`.
 *
 * Mirrors apps/mobile/lib/notif-read.ts.
 */
const KEY = "hybrid.notifRead";

let state: NotifReadState = DEFAULT_NOTIF_READ;
let hydrated = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function hydrate(): void {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) state = normalizeNotifRead(JSON.parse(raw));
  } catch {
    /* keep the default: everything unread, which is the safe direction */
  }
}

function persist(next: NotifReadState): void {
  // A no-op sweep returns the state it was given (see sweepNotifsRead) — writing
  // and emitting it anyway would re-render the screen, re-arm the sweep and go
  // round again every poll.
  if (next === state) return;
  state = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* a full/blocked store must not break the screen */
  }
  emit();
}

/** Mark one row read (tapping it). */
export function readNotification(id: string): void {
  hydrate();
  persist(markNotifRead(state, id));
}

/** Put one row back to unread (swipe right). */
export function unreadNotification(id: string): void {
  hydrate();
  persist(markNotifUnread(state, id));
}

/** Delete one row (swipe left) — a tombstone, since the list is a projection. */
export function dismissNotification(id: string): void {
  hydrate();
  persist(dismissNotif(state, id));
}

/** The passive sweep: mark what the screen has just shown as seen. */
export function sweepNotifications(items: { id: string; at: number }[]): void {
  hydrate();
  persist(sweepNotifsRead(state, items));
}

/** Mark every row currently on screen read — the explicit action. */
export function readAllNotifications(items: { id: string; at: number }[]): void {
  hydrate();
  persist(markAllNotifsRead(state, items));
}

function subscribe(l: () => void): () => void {
  hydrate();
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The current read state. The server render uses the default (all unread) and
 *  the client hydrates — a badge that briefly over-counts beats one that hides
 *  a notification. */
export function useNotifRead(): NotifReadState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => DEFAULT_NOTIF_READ,
  );
}
