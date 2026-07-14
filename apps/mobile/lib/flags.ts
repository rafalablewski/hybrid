import { useSyncExternalStore } from "react";
import { fetchFlagState } from "./api";

/**
 * Mobile feature-flag store — mirrors web lib/use-flags. Fetches the evaluated
 * boolean flags AND their config values once from /api/flags; isEnabled defaults
 * to TRUE until they land (and for unknown keys), so a flag hiccup never hides a
 * default-on feature. Values back things like the admin-set premium accent.
 */
let flags: Record<string, boolean> = {};
let values: Record<string, unknown> = {};
let fetched = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function ensure() {
  if (fetched) return;
  fetched = true;
  fetchFlagState()
    .then((s) => { flags = s.flags; values = s.values; emit(); })
    .catch(() => {});
}

/** Reset the one-shot flag store so it re-fetches for the CURRENT user. Called on
 *  every auth change (sign-in AND sign-out): flags are typically first fetched
 *  BEFORE login (the nav mounts at app start, unauthenticated), so without this
 *  the per-user flags / persona-nav access / premium accent never load for the
 *  session that signs in, and one user's flags would persist for the next on a
 *  shared device. If any component is currently subscribed, re-fetch immediately;
 *  otherwise the next subscribe() will. */
export function resetFlags() {
  flags = {};
  values = {};
  fetched = false;
  emit();
  if (listeners.size > 0) ensure();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  ensure();
  return () => listeners.delete(l);
}

/** Whether a feature flag is on (defaults true until loaded / if unknown). */
export function useFeatureFlag(key: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => flags[key] !== false,
    () => true,
  );
}

/** Non-hook read of a flag (defaults true until loaded / for unknown keys).
 *  For gating lists where calling a hook per item would break the Rules of
 *  Hooks — pair it with useFlags() so the component still re-renders on load. */
export function featureEnabled(key: string): boolean {
  return flags[key] !== false;
}

/** Subscribe-once hook returning an isEnabled() gate — the mobile twin of web
 *  lib/use-flags' useFlags(). Re-renders when the flag set lands so gated lists
 *  settle from their default-on state to the real values. */
export function useFlags(): { isEnabled: (key: string) => boolean } {
  useSyncExternalStore(subscribe, () => flags, () => flags);
  return { isEnabled: featureEnabled };
}

/** The config VALUE for a flag (e.g. theme.premiumAccent) — undefined until the
 *  flags land or if the flag carries no value. Re-renders when they arrive. */
export function useFlagValue(key: string): unknown {
  return useSyncExternalStore(subscribe, () => values[key], () => values[key]);
}
