"use client";

import { useSyncExternalStore } from "react";
import { effectiveClientChoice, resolvePersona, type ClientPersona, type Persona } from "@hybrid/core";
import { useSession } from "./session";

/**
 * Web persona store — mirror of the mobile one (apps/mobile/lib/persona.ts).
 * Coach/admin personas come from the auth role; a CLIENT additionally chooses
 * casual vs athlete (at onboarding, flippable in Settings). Persisted in
 * localStorage and read wherever the nav is shaped (sidebar, ⌘K hub, home).
 */
const KEY = "hybrid.persona";
/** Whether the stored choice was made while the account ALREADY carried a paid
 *  entitlement — see core `effectiveClientChoice`. Absent (legacy) reads as
 *  false, so a free-era onboarding answer can't outlive the upgrade. */
const KEY_PAID = "hybrid.persona.paid";

function readInitial(): ClientPersona | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(KEY);
    return v === "casual" || v === "athlete" ? v : null;
  } catch {
    return null;
  }
}

function readInitialWhilePaid(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(KEY_PAID) === "1";
  } catch {
    return false;
  }
}

let choice: ClientPersona | null = readInitial();
let choiceWhilePaid = readInitialWhilePaid();
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

/** Set (and persist) the client persona choice.
 *  @param whilePaid whether the account is ALREADY paid as this is chosen — pass
 *    it from the surface making the choice (Settings' mode cards). Only a
 *    Simple choice made by a PAID user counts as declining Full; a free user's
 *    onboarding answer is cleared by their later upgrade (core
 *    `effectiveClientChoice`). */
export function setClientPersona(c: ClientPersona, whilePaid = false): void {
  choice = c;
  choiceWhilePaid = whilePaid;
  try {
    localStorage.setItem(KEY, c);
    if (whilePaid) localStorage.setItem(KEY_PAID, "1");
    else localStorage.removeItem(KEY_PAID);
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
  choiceWhilePaid = false;
  activeCoach = false;
  coachFetched = false;
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(KEY_PAID);
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

/** The client's EFFECTIVE choice (null until set). SSR snapshot is null (casual).
 *  A "casual" stored while the account was still FREE is dropped once the
 *  account is paid — that answer predates the upgrade and must not keep a
 *  paying user on the free surface (core `effectiveClientChoice`). */
export function useClientPersonaChoice(): ClientPersona | null {
  const { entitlement } = useSession();
  const stored = useSyncExternalStore(
    subscribe,
    () => choice,
    () => null,
  );
  const whilePaid = useSyncExternalStore(
    subscribe,
    () => choiceWhilePaid,
    () => false,
  );
  return effectiveClientChoice(stored, whilePaid, entitlement) ?? null;
}

/** The resolved persona for the signed-in user (role + client choice + billing).
 *  A coach link is intentionally NOT a factor — coached clients stay casual and
 *  get read-only assigned content via useHasActiveCoach. */
export function usePersona(): Persona {
  const { session } = useSession();
  const c = useClientPersonaChoice();
  return resolvePersona(session?.role ?? "client", c ?? undefined, session?.entitlement ?? "free");
}
