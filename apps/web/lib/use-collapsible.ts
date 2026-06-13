"use client";

import { useEffect, useState } from "react";

/**
 * A collapsed/expanded boolean persisted under `key` in localStorage. Shared by
 * the consumer + admin sidebars so the collapse behaviour lives in one place.
 */
export function useCollapsible(key: string) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (typeof localStorage !== "undefined" && localStorage.getItem(key) === "1") setCollapsed(true);
  }, [key]);

  const toggle = () =>
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(key, next ? "1" : "0");
      } catch {
        /* storage disabled — collapse still works for the session */
      }
      return next;
    });

  return { collapsed, toggle };
}
