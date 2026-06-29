import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { onlineManager, useQueryClient } from "@tanstack/react-query";
import { pingHealth } from "./api";

// Connectivity manager (mobile). The app has no native NetInfo module, and
// TanStack Query's default online detection is browser-only — so without this a
// transient API hiccup or a slow cold-start reads as a confusing empty screen
// ("feels offline"). This probes the backend's public /api/health endpoint to
// learn the REAL reachability (any HTTP response = up; only a network throw =
// down), feeds it to TanStack's onlineManager (so queries refetch on reconnect),
// and exposes it so the app shell can show a slim "no connection" banner + a
// manual Retry. NB: the QueryClient runs networkMode:'always', so this NEVER
// blocks fetches — it only INFORMS the user and triggers a refresh on recovery.

type Ctx = { online: boolean; checking: boolean; retry: () => void };
const NetCtx = createContext<Ctx>({ online: true, checking: false, retry: () => {} });

const OFFLINE_RECHECK_MS = 5000; // while down, poll for recovery
const ONLINE_RECHECK_MS = 60_000; // while up, a light heartbeat

export function ConnectivityProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  // Start optimistic (online) so a healthy launch never flashes the banner.
  const [online, setOnline] = useState(true);
  const [checking, setChecking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const wasOnline = useRef(true);

  const clearTimer = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };

  const probe = useCallback(async () => {
    setChecking(true);
    const ok = await pingHealth();
    if (!mounted.current) return;
    setChecking(false);
    setOnline(ok);
    onlineManager.setOnline(ok);
    // Recovered from an outage → revalidate everything so screens refill.
    if (ok && !wasOnline.current) qc.invalidateQueries();
    wasOnline.current = ok;
    // Reschedule: poll fast while down, heartbeat slowly while up.
    clearTimer();
    timer.current = setTimeout(() => { void probe(); }, ok ? ONLINE_RECHECK_MS : OFFLINE_RECHECK_MS);
  }, [qc]);

  useEffect(() => {
    mounted.current = true;
    void probe();
    // Re-check the moment the app returns to the foreground (likely back online).
    const sub = AppState.addEventListener("change", (s: AppStateStatus) => { if (s === "active") void probe(); });
    return () => { mounted.current = false; clearTimer(); sub.remove(); };
  }, [probe]);

  const retry = useCallback(() => { void probe(); }, [probe]);

  return <NetCtx.Provider value={{ online, checking, retry }}>{children}</NetCtx.Provider>;
}

export function useConnectivity(): Ctx {
  return useContext(NetCtx);
}
