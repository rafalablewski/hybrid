"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_LOGGER_PREFS, normalizeLoggerPrefs, type LoggerPrefs } from "@hybrid/core";

// Per-device workout-logger preferences on the web (localStorage). Shares the
// core defaults + normalizer with mobile; the Logger reads it through the hook.
const KEY = "hybrid.loggerPrefs";

let prefs: LoggerPrefs = DEFAULT_LOGGER_PREFS;
let hydrated = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function hydrate(): void {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) prefs = normalizeLoggerPrefs(JSON.parse(raw));
  } catch {
    /* keep defaults */
  }
}

export function setLoggerPref<K extends keyof LoggerPrefs>(key: K, value: LoggerPrefs[K]): void {
  prefs = normalizeLoggerPrefs({ ...prefs, [key]: value });
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
  emit();
}

function subscribe(l: () => void): () => void {
  hydrate();
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Current logger preferences. Server render uses defaults; the client hydrates. */
export function useLoggerPrefs(): LoggerPrefs {
  return useSyncExternalStore(
    subscribe,
    () => prefs,
    () => DEFAULT_LOGGER_PREFS,
  );
}
