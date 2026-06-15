import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { resolvePersona, type ClientPersona, type Persona } from "@hybrid/core";
import { useSession } from "./session";

/**
 * The app's persona shape (see @hybrid/core `Persona`). Coach/admin come from the
 * auth role; a CLIENT additionally chooses casual vs athlete at onboarding (and
 * can flip it in More). The choice is persisted on-device and read everywhere
 * the nav is shaped (More hub, command menu, later the tabs/home).
 */
const KEY = "hybrid.persona";

let choice: ClientPersona | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

// Hydrate once from storage; notify subscribers when it lands.
AsyncStorage.getItem(KEY)
  .then((v) => {
    if (v === "casual" || v === "athlete" || v === "coach") choice = v;
    emit();
  })
  .catch(() => {});

/** Set (and persist) the client persona choice. */
export function setClientPersona(c: ClientPersona): void {
  choice = c;
  AsyncStorage.setItem(KEY, c).catch(() => {});
  emit();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The raw client choice (null until set). */
export function useClientPersonaChoice(): ClientPersona | null {
  return useSyncExternalStore(
    subscribe,
    () => choice,
    () => choice,
  );
}

/** The resolved persona for the signed-in user (role + client choice). */
export function usePersona(): Persona {
  const { role } = useSession();
  const c = useClientPersonaChoice();
  return resolvePersona(role, c ?? undefined);
}
