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

// Device-level prefs that may safely survive a sign-out (everything else under
// the `hybrid.` namespace is user-scoped and is wiped so a shared device never
// leaks one account's state to the next). Mirrors web session.tsx.
const KEEP_ON_LOGOUT = new Set(["hybrid.lang", "hybrid.tourSeen", "hybrid.announce.dismissed"]);

/** Wipe all user-scoped on-device state (AsyncStorage namespace + persona module
 *  singletons) so nothing carries across a sign-out or user switch. */
async function clearClientState() {
  resetPersona();
  try {
    const keys = await AsyncStorage.getAllKeys();
    const drop = keys.filter((k) => k.startsWith("hybrid.") && !KEEP_ON_LOGOUT.has(k));
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
export type Role = AuthRole;

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
      // First real sign-in: carry any guest workouts up to the account.
      if (event === "SIGNED_IN") { flushGuestSessions().catch(() => {}); void claimStoredCoachInvite(); }
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
  const entitlement: Entitlement = normalizeEntitlement(meta.entitlement);

  return (
    <SessionCtx.Provider
      value={{
        session,
        ready,
        name,
        role,
        entitlement,
        signOut: async () => {
          await supabase.auth.signOut();
          await clearClientState();
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
