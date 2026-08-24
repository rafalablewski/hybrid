import { DEFAULT_LOGGER_PREFS, LOGGER_PREFS_KEY, normalizeLoggerPrefs, type LoggerPrefs } from "@hybrid/core";
import { getPref, setPref, useSyncedPref } from "./synced-prefs";

// Workout-logger preferences (units, and how the live logger behaves).
//
// SYNCED, NOT PER-DEVICE, since Aug 2026 (lib/synced-prefs.ts → /api/prefs).
// Units are the clearest case in the whole set: an athlete who lifts in pounds
// lifts in pounds on every device they own, and having to re-choose that on a
// new phone was the app forgetting something it had been told.
//
// The device still holds a cache, so the logger paints the right units on the
// first frame and works with no signal.

/** Update one preference and persist it. */
export function setLoggerPref<K extends keyof LoggerPrefs>(key: K, value: LoggerPrefs[K]): void {
  setPref(LOGGER_PREFS_KEY, normalizeLoggerPrefs({ ...getLoggerPrefs(), [key]: value }));
}

/** The current logger preferences (defaults until hydrated). */
export function useLoggerPrefs(): LoggerPrefs {
  return useSyncedPref(LOGGER_PREFS_KEY, normalizeLoggerPrefs);
}

/** The current preferences, outside React. For imperative call sites (a haptic
 *  fired from an event handler) that must not re-render anything to read a flag. */
export function getLoggerPrefs(): LoggerPrefs {
  return normalizeLoggerPrefs(getPref<unknown>(LOGGER_PREFS_KEY, DEFAULT_LOGGER_PREFS));
}
