"use client";

import { useEffect, useState } from "react";

export type Theme = "dark" | "light";
const KEY = "hybrid-theme";

/**
 * App theme (dark ⇄ light). Persists to localStorage and reflects onto
 * `<html data-theme>` — which drives the brand surface/text tokens
 * (globals.css [data-theme]) and the whole Liquid Glass layer. Defaults to
 * dark (the shipped look); a light preference is applied on mount.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* private mode / storage disabled — theme still applies for the session */
    }
  }, [theme]);

  return {
    theme,
    setTheme,
    toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
  };
}
