"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

// Role model mirrors the Prisma schema (CLIENT | COACH | ADMIN).
export type Role = "client" | "coach" | "admin";

export type Session = {
  name: string;
  email: string;
  role: Role;
  provider: "apple" | "google" | "email" | "demo";
};

type SessionContext = {
  session: Session | null;
  ready: boolean;
  /** True when real Supabase auth is active; false in demo mode. */
  live: boolean;
  login: (s: Session) => void;
  logout: () => Promise<void>;
};

const Ctx = createContext<SessionContext | null>(null);
const KEY = "hybrid.session";

/** Map a Supabase user to our Session shape. Role + name live in user metadata
 *  until the Prisma `User` row is the source of truth (later in Sprint 1). */
function fromSupabaseUser(user: User): Session {
  const meta = user.user_metadata ?? {};
  const email = user.email ?? "";
  const role = (meta.role as Role) ?? "client";
  const name =
    (meta.name as string) ||
    (meta.full_name as string) ||
    (email ? email.split("@")[0]! : "Athlete");
  const provider = (user.app_metadata?.provider as Session["provider"]) ?? "email";
  return {
    name: name.charAt(0).toUpperCase() + name.slice(1),
    email,
    role,
    provider: provider === "apple" || provider === "google" ? provider : "email",
  };
}

/** Resolve a Supabase user to a Session, preferring the DB role from /api/me
 *  (the source of truth) and falling back to auth metadata if that call fails. */
async function resolveSession(user: User): Promise<Session> {
  const fallback = fromSupabaseUser(user);
  try {
    const res = await fetch("/api/me");
    if (res.ok) {
      const me = (await res.json()) as {
        name?: string | null;
        email?: string;
        role?: Role;
      };
      return {
        name: me.name
          ? me.name.charAt(0).toUpperCase() + me.name.slice(1)
          : fallback.name,
        email: me.email ?? fallback.email,
        role: me.role ?? fallback.role,
        provider: fallback.provider,
      };
    }
  } catch {
    // network/route error — fall back to metadata
  }
  return fallback;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const live = isSupabaseConfigured();

  useEffect(() => {
    // --- Real auth: hydrate from Supabase and follow auth-state changes ---
    if (live) {
      const supabase = createClient();
      supabase.auth.getUser().then(async ({ data }) => {
        setSession(data.user ? await resolveSession(data.user) : null);
        setReady(true);
      });
      const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
        if (s?.user) resolveSession(s.user).then(setSession);
        else setSession(null);
      });
      return () => sub.subscription.unsubscribe();
    }

    // --- Demo auth: persist a chosen session in localStorage ---
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setSession(JSON.parse(raw) as Session);
    } catch {
      // ignore malformed/absent storage
    }
    setReady(true);
  }, [live]);

  const login = (s: Session) => {
    // In live mode the Supabase listener owns session state; this is the demo path.
    setSession(s);
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      // ignore storage failures (private mode, etc.)
    }
  };

  const logout = async () => {
    if (live) {
      try {
        await createClient().auth.signOut();
      } catch {
        // ignore network/signout failures
      }
    }
    setSession(null);
    try {
      localStorage.removeItem(KEY);
    } catch {
      // ignore
    }
  };

  return (
    <Ctx.Provider value={{ session, ready, live, login, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
