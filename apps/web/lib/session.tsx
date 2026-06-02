"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

// Sprint-0.5 DEMO auth. The role model mirrors the Prisma schema
// (CLIENT | COACH | ADMIN). This is intentionally client-side and temporary —
// Sprint 1 replaces it with Supabase Auth + server-enforced RLS, but the screens
// and the role gating below stay exactly the same.
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
  login: (s: Session) => void;
  logout: () => void;
};

const Ctx = createContext<SessionContext | null>(null);
const KEY = "hybrid.session";

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setSession(JSON.parse(raw) as Session);
    } catch {
      // ignore malformed/absent storage
    }
    setReady(true);
  }, []);

  const login = (s: Session) => {
    setSession(s);
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      // ignore storage failures (private mode, etc.)
    }
  };

  const logout = () => {
    setSession(null);
    try {
      localStorage.removeItem(KEY);
    } catch {
      // ignore
    }
  };

  return (
    <Ctx.Provider value={{ session, ready, login, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
