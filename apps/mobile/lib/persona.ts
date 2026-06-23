import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { resolvePersona, type ClientPersona, type Persona } from "@hybrid/core";
import { useSession } from "./session";
import { getCoachLinks } from "./api";

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

// Hydrate once from storage; notify subscribers when it lands. (A legacy
// "coach" choice is ignored — coach is no longer a self-serve persona.)
AsyncStorage.getItem(KEY)
  .then((v) => {
    if (v === "casual" || v === "athlete") choice = v;
    emit();
  })
  .catch(() => {});

/** Set (and persist) the client persona choice. */
export function setClientPersona(c: ClientPersona): void {
  choice = c;
  AsyncStorage.setItem(KEY, c).catch(() => {});
  emit();
}

/** Reset the module-level persona singletons on sign-out / user switch so the
 *  next account on this device doesn't inherit the previous user's persona,
 *  active-coach flag, or the one-shot fetch guard. Mirrors web resetPersona(). */
export function resetPersona(): void {
  choice = null;
  activeCoach = false;
  coachFetched = false;
  AsyncStorage.removeItem(KEY).catch(() => {});
  emit();
}

// A client with an ACTIVE coach gets the full adaptive experience on their
// coach's seat (see resolvePersona). Learned once from /api/coach/links.
let activeCoach = false;
let coachFetched = false;
function ensureCoachFetch() {
  if (coachFetched) return;
  coachFetched = true;
  getCoachLinks()
    .then((d) => {
      const has = (d.asClient ?? []).some((l) => l.status === "ACTIVE");
      if (has !== activeCoach) {
        activeCoach = has;
        emit();
      }
    })
    .catch(() => {});
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  ensureCoachFetch(); // one-time active-coach lookup on first use
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

/** The resolved persona for the signed-in user (role + client choice + billing).
 *  A coach link is intentionally NOT a factor — coached clients stay casual and
 *  get read-only assigned content via useHasActiveCoach. */
export function usePersona(): Persona {
  const { role, entitlement } = useSession();
  const c = useClientPersonaChoice();
  return resolvePersona(role, c ?? undefined, entitlement);
}
