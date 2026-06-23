"use client";

import { useSyncExternalStore } from "react";

// Feature flags evaluated for the signed-in user. Until they load (or if the API
// is unreachable) `ready` is false and `isEnabled` returns true — callers should
// fail OPEN so a flag fetch hiccup never hides a default-on feature. Gate with
// `flags["key"] === false` when you need strict off.
//
// Backed by a single module-level store so the many independent useFlags()
// callers across the app share ONE /api/flags fetch instead of each firing their
// own on mount (previously a duplicate request per consumer per page load).

type Snapshot = {
  flags: Record<string, boolean>;
  values: Record<string, unknown>;
  ready: boolean;
};

let snapshot: Snapshot = { flags: {}, values: {}, ready: false };
const listeners = new Set<() => void>();
let started = false;

// Stable server snapshot — useSyncExternalStore requires a referentially-stable
// value on the server to avoid an infinite render loop.
const SERVER_SNAPSHOT: Snapshot = { flags: {}, values: {}, ready: false };

function emit() {
  for (const l of listeners) l();
}

function load() {
  fetch("/api/flags")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((d) => {
      snapshot = { flags: d.flags ?? {}, values: d.values ?? {}, ready: true };
      emit();
    })
    .catch(() => {
      snapshot = { ...snapshot, ready: true };
      emit();
    });
}

/** Force a re-fetch (e.g. after an admin toggles a flag). */
export function refreshFlags() {
  load();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  // Kick off the single shared fetch on the first subscription.
  if (!started) {
    started = true;
    load();
  }
  return () => {
    listeners.delete(cb);
  };
}

export function useFlags() {
  const snap = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => SERVER_SNAPSHOT,
  );
  return {
    flags: snap.flags,
    ready: snap.ready,
    /** True unless the flag is explicitly off (fail-open before load). */
    isEnabled: (key: string) => snap.flags[key] !== false,
    value: (key: string) => snap.values[key],
  };
}
