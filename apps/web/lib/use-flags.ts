"use client";

import { useEffect, useState } from "react";

// Loads the feature flags evaluated for the signed-in user. Until they load (or
// if the API is unreachable) `ready` is false and `isEnabled` returns true —
// callers should fail OPEN so a flag fetch hiccup never hides a default-on
// feature. Gate with `flags["key"] === false` when you need strict off.
export function useFlags() {
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/flags")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setFlags(d.flags ?? {});
        setValues(d.values ?? {});
        setReady(true);
      })
      .catch(() => setReady(true));
    return () => {
      alive = false;
    };
  }, []);

  return {
    flags,
    ready,
    /** True unless the flag is explicitly off (fail-open before load). */
    isEnabled: (key: string) => flags[key] !== false,
    value: (key: string) => values[key],
  };
}
