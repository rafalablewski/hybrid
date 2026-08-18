import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Session as SupaSession } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { flushGuestSessions } from "./guest";
import { claimCoachInvite } from "./api";
import { resetPersona } from "./persona";
import { resetPlanMaxes } from "./plan-maxes";
import { resetQuestionnaire } from "./questionnaire";
import { resetWeighIn } from "./weigh-in";
import { resetFlags } from "./flags";
import { disablePush } from "./push";

// Device-level prefs that may safely survive a sign-out (everything else under
// the `hybrid.` namespace is user-scoped and is wiped so a shared device never
// leaks one account's state to the next). Mirrors web session.tsx.
const KEEP_ON_LOGOUT = new Set(["hybrid.lang", "hybrid.tourSeen", "hybrid.announce.dismissed"]);

/** Wipe all user-scoped on-device state (AsyncStorage namespace + persona module
 *  singletons) so nothing carries across a sign-out or user switch. */
async function clearClientState() {
  resetPersona();
  resetPlanMaxes();
  resetQuestionnaire();
  resetWeighIn();
  resetFlags();
  try {
    const keys = await AsyncStorage.getAllKeys();
    // Drop every user-scoped `hybrid.*` key AND the Supabase auth token (`sb-*`).
    // Wiping the auth token ourselves is what makes a sign-out actually STICK:
    // supabase.auth.signOut() only removes the persisted session when its network
    // revoke succeeds, so an offline/failed revoke would otherwise leave the token
    // behind and silently sign the user back in on the next launch.
    const drop = keys.filter((k) => (k.startsWith("hybrid.") && !KEEP_ON_LOGOUT.has(k)) || k.startsWith("sb-"));
    await Promise.all(drop.map((k) => AsyncStorage.removeItem(k)));
  } catch {
    // best-effort
  }
}

// Finish a coach-led onboarding claim: a QR/link invite token stashed before
// sign-up (see app/invite/[token]) is claimed once we're authenticated.
async function claimStoredCoachInvite() {
  try {
    const token = await AsyncStorage.getItem("hybrid.coachInviteToken");
    if (!token) return;
    const r = await claimCoachInvite(token);
    if (r.ok || /no longer valid|expired|coach yourself/i.test(r.error || "")) {
      await AsyncStorage.removeItem("hybrid.coachInviteToken");
    }
  } catch {
    // best-effort — try again next launch
  }
}

import { type Entitlement, type AuthRole, normalizeAuthRole, normalizeEntitlement } from "@hybrid/core";

// Shared with web via core so both clients normalize identical access-control input.
type Role = AuthRole;

type Ctx = {
  session: SupaSession | null;
  ready: boolean;
  name: string;
  /** auth role (CLIENT|COACH|ADMIN, lowercased); defaults to client. */
  role: Role;
  /** billing entitlement — "paid" unlocks the Full (athlete) experience. */
  entitlement: Entitlement;
  signOut: () => Promise<void>;
};

const SessionCtx = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SupaSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
      // Restored a signed-in session: flush any workouts saved offline.
      if (data.session) { flushGuestSessions().catch(() => {}); void claimStoredCoachInvite(); }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      // First real sign-in: carry any guest workouts up to the account, and
      // RE-FETCH the per-user one-shot stores (flags / persona / plan-maxes /
      // questionnaire).
      // These are typically first fetched BEFORE login (the nav mounts at app
      // start), so without a reset here the signed-in user keeps the logged-out
      // (or previous user's) flags, coach access and maxes until a process
      // restart. resetX() re-fetches immediately when something is mounted.
      if (event === "SIGNED_IN") {
        flushGuestSessions().catch(() => {});
        void claimStoredCoachInvite();
        resetFlags();
        resetPersona();
        resetPlanMaxes();
        resetQuestionnaire();
      }
    });
    // Back to foreground (likely back online): retry the offline sync.
    const appSub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) flushGuestSessions().catch(() => {});
      });
    });
    return () => {
      sub.subscription.unsubscribe();
      appSub.remove();
    };
  }, []);

  const meta = session?.user.user_metadata ?? {};
  const name =
    (meta.name as string) ||
    (session?.user.email ? session.user.email.split("@")[0]! : "Athlete");
  const role: Role = normalizeAuthRole(meta.role);
  // Entitlement is mirrored into app_metadata (server-only, not user-writable).
  // Prefer it; fall back to legacy user_metadata for pre-move sessions.
  const appMeta = session?.user.app_metadata ?? {};
  const entitlement: Entitlement = normalizeEntitlement(
    (appMeta.entitlement as string | undefined) ?? meta.entitlement,
  );

  return (
    <SessionCtx.Provider
      value={{
        session,
        ready,
        name,
        role,
        entitlement,
        signOut: async () => {
          // Retire this phone's push token FIRST, while the access token that
          // authorises the call still exists. Without it, the account that just
          // signed out keeps receiving its notifications on a phone somebody
          // else may now be holding — a co-sign request naming a lift, on a
          // borrowed handset. Best-effort, and never a reason to stay signed in.
          await disablePush().catch(() => {});
          // Local scope — sign THIS device out; the explicit "sign out
          // everywhere" (account.ts) is the global one. Best-effort: a
          // failed/offline network revoke must never leave us signed in, so we
          // force-clear the persisted auth token + app state and null the
          // session regardless of the result (the auth listener only fires
          // SIGNED_OUT when the revoke succeeds).
          try {
            await supabase.auth.signOut({ scope: "local" });
          } catch {
            // fall through to the forced teardown below
          }
          await clearClientState();
          setSession(null);
        },
      }}
    >
      {children}
    </SessionCtx.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionCtx);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
