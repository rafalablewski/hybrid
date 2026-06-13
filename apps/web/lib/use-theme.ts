"use client";

import { useEffect, useState } from "react";

export type Theme = "dark" | "light";
const KEY = "hybrid-theme";

const isTheme = (v: unknown): v is Theme => v === "dark" || v === "light";

/**
 * App theme (dark ⇄ light). Persists to BOTH a cookie (read server-side in
 * app/layout.tsx so the correct `data-theme` is in the first paint — no flash)
 * and localStorage. Initialises from the server-rendered `<html data-theme>`
 * so the client never overrides what SSR already painted. Defaults to dark.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    // On the client, trust what the server already put on <html> (from the
    // cookie); on the server this returns the default and is corrected by SSR.
    if (typeof document !== "undefined" && isTheme(document.documentElement.dataset.theme)) {
      return document.documentElement.dataset.theme as Theme;
    }
    return "dark";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* storage disabled — theme still applies for the session */
    }
    // 1-year cookie so SSR can paint the right theme on the next request.
    document.cookie = `${KEY}=${theme}; path=/; max-age=31536000; samesite=lax`;
  }, [theme]);

  return {
    theme,
    setTheme,
    toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
  };
}
