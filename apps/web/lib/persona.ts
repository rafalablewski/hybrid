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

export function setClientPersona(c: ClientPersona): void {
  choice = c;
  try {
    localStorage.setItem(KEY, c);
  } catch {
    /* ignore (private mode) */
  }
  emit();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The raw client choice (null until set). SSR snapshot is null (casual). */
export function useClientPersonaChoice(): ClientPersona | null {
  return useSyncExternalStore(
    subscribe,
    () => choice,
    () => null,
  );
}

/** The resolved persona for the signed-in user (role + client choice). */
export function usePersona(): Persona {
  const { session } = useSession();
  const c = useClientPersonaChoice();
  return resolvePersona(session?.role ?? "client", c ?? undefined);
}
