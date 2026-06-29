import { useEffect, useState, useRef, useCallback, type ReactNode } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useFocusEffect } from "expo-router";
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
} from "@tanstack/react-query";
import { ConnectivityProvider } from "./net";

// TanStack Query for the mobile app — parity with the web data-layer so both
// clients dedupe fetches, cache across navigation, and revalidate by key on
// mutation. Two RN specifics handled here:
//   1. focusManager is wired to AppState (React Query's default window-focus
//      detection is web-only) so queries refetch when the app returns to the
//      foreground.
//   2. Per-screen navigation focus is handled by useRefreshOnFocus below, since
//      RN screens stay mounted in the navigator (a back-navigation doesn't
//      remount, so refetchOnMount alone wouldn't revalidate).

function onAppStateChange(status: AppStateStatus) {
  focusManager.setFocused(status === "active");
}

export default function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            // Retry transient network blips with exponential backoff (≤4s) so a
            // cold-start hiccup or a flaky gym signal self-heals instead of
            // rendering an empty "feels-offline" screen.
            retry: 2,
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
            // RN has no window focus; we drive it via AppState (below).
            refetchOnWindowFocus: true,
            // Refetch once the connectivity manager reports we're back online.
            refetchOnReconnect: true,
            // CRITICAL (RN): never let the (browser-oriented) online detection
            // PAUSE a fetch. The connectivity manager (lib/net.tsx) owns the
            // real online signal and uses it only to inform the user + refetch
            // on reconnect — it must not gate requests, or a wrong reading would
            // freeze every screen. So always attempt the fetch.
            networkMode: "always",
          },
          mutations: { networkMode: "always" },
        },
      }),
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", onAppStateChange);
    return () => sub.remove();
  }, []);

  return (
    <QueryClientProvider client={client}>
      <ConnectivityProvider>{children}</ConnectivityProvider>
    </QueryClientProvider>
  );
}

/** Refetch a query when its screen regains focus (the RN analogue of the web's
 *  refetchOnWindowFocus). Skips the very first focus so it doesn't double-fetch
 *  the initial mount. */
export function useRefreshOnFocus(refetch: () => unknown) {
  // A REF, not state: useState returns a fresh [value, setter] tuple every
  // render, so putting it in the callback deps made the callback change on
  // every render → useFocusEffect re-fired while focused → refetch → re-render
  // → an endless refetch loop (the "refreshes every second" bug). A ref is
  // stable and doesn't trigger a render, so the callback only depends on the
  // (stable) refetch fn and fires once per real focus.
  const firstTime = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstTime.current) {
        firstTime.current = false;
        return;
      }
      refetch();
    }, [refetch]),
  );
}
