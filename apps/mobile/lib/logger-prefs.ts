import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_LOGGER_PREFS, normalizeLoggerPrefs, type LoggerPrefs } from "@hybrid/core";

// Per-device workout-logger preferences (the configurable logger). Hydrated once
// from AsyncStorage; the live workout + settings screen read it through the hook.
const KEY = "hybrid.loggerPrefs";

let prefs: LoggerPrefs = DEFAULT_LOGGER_PREFS;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

AsyncStorage.getItem(KEY)
  .then((v) => {
    if (v) {
      try {
        prefs = normalizeLoggerPrefs(JSON.parse(v));
        emit();
      } catch {
        /* keep defaults */
      }
    }
  })
  .catch(() => {});

/** Update one preference and persist it. */
export function setLoggerPref<K extends keyof LoggerPrefs>(key: K, value: LoggerPrefs[K]): void {
  prefs = normalizeLoggerPrefs({ ...prefs, [key]: value });
  AsyncStorage.setItem(KEY, JSON.stringify(prefs)).catch(() => {});
  emit();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The current logger preferences (defaults until hydrated). */
export function useLoggerPrefs(): LoggerPrefs {
  return useSyncExternalStore(
    subscribe,
    () => prefs,
    () => prefs,
  );
}
