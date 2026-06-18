import { useSyncExternalStore } from "react";
import { fetchFeatureFlags } from "./api";

/**
 * Mobile feature-flag store — mirrors web lib/use-flags. Fetches the evaluated
 * boolean flags once from /api/flags; isEnabled defaults to TRUE until they land
 * (and for unknown keys), so a flag hiccup never hides a default-on feature.
 */
let flags: Record<string, boolean> = {};
let fetched = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function ensure() {
  if (fetched) return;
  fetched = true;
  fetchFeatureFlags()
    .then((f) => { flags = f; emit(); })
    .catch(() => {});
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
