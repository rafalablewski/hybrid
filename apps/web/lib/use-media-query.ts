"use client";

import { useEffect, useState } from "react";

/**
 * SSR-safe media-query hook. Returns whether `query` currently matches. During
 * server render (and the first client paint) it returns `false` so markup is
 * deterministic; it then syncs to the real value on mount. Shared by the
 * consumer + admin shells so the responsive breakpoint lives in one place.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [query]);

  return matches;
}

/** The shared mobile breakpoint for the app/admin shells (sidebar → drawer). */
export const MOBILE_MAX = 900;

/** True when the viewport is at/below the shared mobile breakpoint. */
export function useIsMobile(): boolean {
  return useMediaQuery(`(max-width: ${MOBILE_MAX}px)`);
}
