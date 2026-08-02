import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { effectiveClientChoice, resolvePersona, type ClientPersona, type Persona } from "@hybrid/core";
import { useSession } from "./session";
import { getCoachLinks } from "./api";

/**
 * The app's persona shape (see @hybrid/core `Persona`). Coach/admin come from the
 * auth role; a CLIENT additionally chooses casual vs athlete at onboarding (and
 * can flip it in More). The choice is persisted on-device and read everywhere
 * the nav is shaped (More hub, command menu, later the tabs/home).
 */
const KEY = "hybrid.persona";
/** Whether the stored choice was made while the account ALREADY carried a paid
 *  entitlement — see core `effectiveClientChoice`. Absent (legacy) reads as
 *  false, so a free-era onboarding answer can't outlive the upgrade. */
const KEY_PAID = "hybrid.persona.paid";

let choice: ClientPersona | null = null;
let choiceWhilePaid = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

// Hydrate once from storage; notify subscribers when it lands. (A legacy
// "coach" choice is ignored — coach is no longer a self-serve persona.)
Promise.all([AsyncStorage.getItem(KEY), AsyncStorage.getItem(KEY_PAID)])
  .then(([v, whilePaid]) => {
    if (v === "casual" || v === "athlete") choice = v;
    choiceWhilePaid = whilePaid === "1";
    emit();
  })
  .catch(() => {});

/** Set (and persist) the client persona choice.
 *  @param whilePaid whether the account is ALREADY paid as this is chosen — pass
 *    it from the surface making the choice (Settings' mode cards). Only a
 *    Simple choice made by a PAID user counts as declining Full; a free user's
 *    onboarding answer is cleared by their later upgrade (core
 *    `effectiveClientChoice`). */
export function setClientPersona(c: ClientPersona, whilePaid = false): void {
  choice = c;
  choiceWhilePaid = whilePaid;
  AsyncStorage.setItem(KEY, c).catch(() => {});
  (whilePaid ? AsyncStorage.setItem(KEY_PAID, "1") : AsyncStorage.removeItem(KEY_PAID)).catch(() => {});
  emit();
}

/** Reset the module-level persona singletons on sign-out / user switch so the
 *  next account on this device doesn't inherit the previous user's persona,
 *  active-coach flag, or the one-shot fetch guard. Mirrors web resetPersona(). */
export function resetPersona(): void {
  choice = null;
  choiceWhilePaid = false;
  activeCoach = false;
  coachFetched = false;
  AsyncStorage.removeItem(KEY).catch(() => {});
  AsyncStorage.removeItem(KEY_PAID).catch(() => {});
  emit();
  // Re-learn the active-coach flag for the CURRENT user if anything is mounted
  // (called on sign-in too, not just sign-out — the flag is otherwise fetched
  // pre-login and never refreshed for the account that signs in).
  if (listeners.size > 0) ensureCoachFetch();
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

/** The client's EFFECTIVE choice (null until set). A "casual" stored while the
 *  account was still FREE is dropped once the account is paid — that answer
 *  predates the upgrade and must not keep a paying user on the free surface
 *  (core `effectiveClientChoice`). */
export function useClientPersonaChoice(): ClientPersona | null {
  const { entitlement } = useSession();
  const stored = useSyncExternalStore(
    subscribe,
    () => choice,
    () => choice,
  );
  const whilePaid = useSyncExternalStore(
    subscribe,
    () => choiceWhilePaid,
    () => choiceWhilePaid,
  );
  return effectiveClientChoice(stored, whilePaid, entitlement) ?? null;
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
