import { useEffect, useState, useRef, useCallback, type ReactNode } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useFocusEffect } from "expo-router";
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
} from "@tanstack/react-query";
import { flushNotifications } from "./notif-read";

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
  // Foregrounding is where a phone most often regains connectivity, so it is
  // also when any notification decisions taken offline get another chance to
  // reach the server (lib/notif-read.ts holds them until they do).
  if (status === "active") flushNotifications();
}

export default function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            retry: 1,
            // RN has no window focus; we drive it via AppState (below).
            refetchOnWindowFocus: true,
          },
        },
      }),
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", onAppStateChange);
    return () => sub.remove();
  }, []);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
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
