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

import type { Entitlement } from "@hybrid/core";

type Role = "client" | "coach" | "admin";

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
  const rawRole = String(meta.role ?? "client").toLowerCase();
  const role: Role = rawRole === "coach" || rawRole === "admin" ? rawRole : "client";
  const entitlement: Entitlement =
    String(meta.entitlement ?? "free").toLowerCase() === "paid" ? "paid" : "free";

  return (
    <SessionCtx.Provider
      value={{ session, ready, name, role, entitlement, signOut: async () => void (await supabase.auth.signOut()) }}
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
