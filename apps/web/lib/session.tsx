"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import type { Entitlement } from "@hybrid/core";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { resetPersona } from "@/lib/persona";

// Role model mirrors the Prisma schema (CLIENT | COACH | ADMIN).
export type Role = "client" | "coach" | "admin";

// Device-level prefs that are NOT user data and may safely survive a logout.
// Everything else under the `hybrid.` namespace is user-scoped and is wiped so a
// shared device never leaks one account's state (persona, sport, in-progress
// workout draft, onboarding answers, coach invite token, …) to the next user.
const KEEP_ON_LOGOUT = new Set(["hybrid.lang", "hybrid.tourSeen", "hybrid.announce.dismissed"]);

/** Wipe all user-scoped client state (localStorage namespace + persona module
 *  singletons) so nothing carries across a logout or user switch. */
function clearClientState() {
  resetPersona();
  try {
    const drop: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("hybrid.") && !KEEP_ON_LOGOUT.has(k)) drop.push(k);
    }
    drop.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore storage failures (private mode, etc.)
  }
}

export type Session = {
  name: string;
  email: string;
  role: Role;
  entitlement: Entitlement;
  provider: "apple" | "google" | "email" | "demo";
  /** When the user finished (or skipped) onboarding; null until they have. The
   *  clients gate the questionnaire on this. Only meaningful in live auth. */
  onboardedAt?: string | null;
};

type SessionContext = {
  session: Session | null;
  /** The account's billing entitlement (free unless signed in & paid). */
  entitlement: Entitlement;
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
  // The DB stores uppercase roles (CLIENT|COACH|ADMIN); normalize so strict
  // equality against the lowercase Role type never silently fails.
  const rawRole = String(meta.role ?? "client").toLowerCase();
  const role: Role = rawRole === "coach" || rawRole === "admin" ? rawRole : "client";
  const entitlement: Entitlement =
    String(meta.entitlement ?? "free").toLowerCase() === "paid" ? "paid" : "free";
  const name =
    (meta.name as string) ||
    (meta.full_name as string) ||
    (email ? email.split("@")[0]! : "Athlete");
  const provider = (user.app_metadata?.provider as Session["provider"]) ?? "email";
  return {
    name: name.charAt(0).toUpperCase() + name.slice(1),
    email,
    role,
    entitlement,
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
        entitlement?: Entitlement;
        onboardedAt?: string | null;
      };
      return {
        name: me.name
          ? me.name.charAt(0).toUpperCase() + me.name.slice(1)
          : fallback.name,
        email: me.email ?? fallback.email,
        role: me.role ? ((me.role as string).toLowerCase() as Role) : fallback.role,
        entitlement: me.entitlement ?? fallback.entitlement,
        provider: fallback.provider,
        onboardedAt: me.onboardedAt ?? null,
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
        else {
          // Token expiry / cross-tab sign-out: wipe user-scoped state too.
          clearClientState();
          setSession(null);
        }
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

  // After a Stripe success redirect (/app?upgraded=1) the JWT still carries the
  // old entitlement — refresh the session so the freshly-set "paid" metadata is
  // picked up, then the flag can be ignored.
  useEffect(() => {
    if (!live) return;
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("upgraded") !== "1") return;
    createClient().auth.refreshSession().catch(() => {});
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
    clearClientState();
  };

  return (
    <Ctx.Provider value={{ session, entitlement: session?.entitlement ?? "free", ready, live, login, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
