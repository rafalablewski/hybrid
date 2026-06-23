"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// App-wide TanStack Query client. Created in state (once per browser tab) — NOT
// at module scope — so the cache is never shared across requests/users on the
// server, and survives client re-renders.
//
// Defaults tuned for this app: data the user is actively looking at should feel
// live, but we don't want a refetch storm. staleTime keeps a freshly-fetched
// query "fresh" for a few seconds (so tab-switching back doesn't refire), while
// refetchOnWindowFocus revalidates when the user returns to the tab. Mutations
// explicitly invalidate the keys they affect.
export default function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            retry: 1,
            refetchOnWindowFocus: true,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
