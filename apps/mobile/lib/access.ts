import { useEffect, useSyncExternalStore } from "react";
import type { PersonaAccess } from "@hybrid/core";
import { UPSELL_NAV_IDS } from "@hybrid/core";
import { fetchPersonaAccess, fetchUpsellNav } from "./api";

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

// The admin's casual upsell ("locked bait") set — which features a free user
// sees locked rather than hidden, so the mobile nav baits the same as web.
// Defaults to the code default (Cockpit) until/unless the admin configures it.
let upsell: string[] = UPSELL_NAV_IDS;
let upsellInflight = false;
const upsellListeners = new Set<() => void>();
const emitUpsell = () => upsellListeners.forEach((l) => l());

export function refreshUpsellNav(): void {
  if (upsellInflight) return;
  upsellInflight = true;
  fetchUpsellNav()
    .then((u) => {
      upsell = u ?? UPSELL_NAV_IDS; // unset flag → default
      emitUpsell();
    })
    .finally(() => {
      upsellInflight = false;
    });
}

export function useUpsellNav(): string[] {
  const value = useSyncExternalStore(
    (l) => {
      upsellListeners.add(l);
      return () => upsellListeners.delete(l);
    },
    () => upsell,
    () => upsell,
  );
  useEffect(() => {
    refreshUpsellNav();
  }, []);
  return value;
}
