import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import type { Session as SupaSession } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { flushGuestSessions } from "./guest";

type Ctx = {
  session: SupaSession | null;
  ready: boolean;
  name: string;
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
      if (data.session) flushGuestSessions().catch(() => {});
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      // First real sign-in: carry any guest workouts up to the account.
      if (event === "SIGNED_IN") flushGuestSessions().catch(() => {});
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

  return (
    <SessionCtx.Provider
      value={{ session, ready, name, signOut: async () => void (await supabase.auth.signOut()) }}
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
