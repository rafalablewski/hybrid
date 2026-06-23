"use client";

import { useSyncExternalStore } from "react";
import { resolvePersona, type ClientPersona, type Persona } from "@hybrid/core";
import { useSession } from "./session";

/**
 * Web persona store — mirror of the mobile one (apps/mobile/lib/persona.ts).
 * Coach/admin personas come from the auth role; a CLIENT additionally chooses
 * casual vs athlete (at onboarding, flippable in Settings). Persisted in
 * localStorage and read wherever the nav is shaped (sidebar, ⌘K hub, home).
 */
const KEY = "hybrid.persona";

function readInitial(): ClientPersona | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(KEY);
    return v === "casual" || v === "athlete" ? v : null;
  } catch {
    return null;
  }
}

let choice: ClientPersona | null = readInitial();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

// A client with an ACTIVE coach gets the full adaptive experience on their
// coach's seat (see resolvePersona). We learn this once from /api/coach/links;
// until it lands the user is treated as un-coached (casual), then it flips.
let activeCoach = false;
let coachFetched = false;
function ensureCoachFetch() {
  if (coachFetched) return;
  coachFetched = true;
  fetch("/api/coach/links")
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      const has = Array.isArray(d?.asClient) && d.asClient.some((l: { status?: string }) => l.status === "ACTIVE");
      if (has !== activeCoach) {
        activeCoach = has;
        emit();
      }
    })
    .catch(() => {});
}

export function setClientPersona(c: ClientPersona): void {
  choice = c;
  try {
    localStorage.setItem(KEY, c);
  } catch {
    /* ignore (private mode) */
  }
  emit();
}

/**
 * Reset the module-level persona state on logout / user switch. These singletons
 * live for the lifetime of the JS context (shared across whoever uses this tab),
 * so without this a second user signing in on the same tab without a full reload
 * would inherit the previous user's persona choice and active-coach flag — and
 * `coachFetched` would suppress the fresh lookup. Called from session logout.
 */
export function resetPersona(): void {
  choice = null;
  activeCoach = false;
  coachFetched = false;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore (private mode) */
  }
  emit();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  ensureCoachFetch(); // kick the one-time active-coach lookup on first use
  return () => listeners.delete(l);
}

/** Whether the signed-in client has an ACTIVE coach. Drives the READ-ONLY view
 *  of coach-assigned content for casual coached clients — it does NOT elevate the
 *  persona (a coach link never grants Full; see resolvePersona). */
export function useHasActiveCoach(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => activeCoach,
    () => false,
  );
}

/** The raw client choice (null until set). SSR snapshot is null (casual). */
export function useClientPersonaChoice(): ClientPersona | null {
  return useSyncExternalStore(
    subscribe,
    () => choice,
    () => null,
  );
}

/** The resolved persona for the signed-in user (role + client choice + billing).
 *  A coach link is intentionally NOT a factor — coached clients stay casual and
 *  get read-only assigned content via useHasActiveCoach. */
export function usePersona(): Persona {
  const { session } = useSession();
  const c = useClientPersonaChoice();
  return resolvePersona(session?.role ?? "client", c ?? undefined, session?.entitlement ?? "free");
}
