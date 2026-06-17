import { useEffect, useSyncExternalStore } from "react";
import type { PersonaAccess } from "@hybrid/core";
import { fetchPersonaAccess } from "./api";

/**
 * The admin's per-persona nav-access override (Admin → Access control), so the
 * mobile nav honours the same "who sees what" the admin configures on web. Held
 * in a tiny store; refreshed when a consumer mounts (after auth). Defaults to {}
 * (pure code defaults) until it loads.
 */
let access: PersonaAccess = {};
let inflight = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function refreshNavAccess(): void {
  if (inflight) return;
  inflight = true;
  fetchPersonaAccess()
    .then((a) => {
      access = a;
      emit();
    })
    .finally(() => {
      inflight = false;
    });
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useNavAccess(): PersonaAccess {
  const value = useSyncExternalStore(
    subscribe,
    () => access,
    () => access,
  );
  useEffect(() => {
    refreshNavAccess();
  }, []);
  return value;
}
