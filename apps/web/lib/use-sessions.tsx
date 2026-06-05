"use client";

import { useCallback, useEffect, useState } from "react";
import type { LoggedSession } from "@hybrid/core";

/** Fetches the signed-in user's sessions from the API. In demo mode (no auth)
 *  the API returns 401, so this resolves to an empty list and callers render
 *  honest empty states (no sample data). */
export function useSessions() {
  const [sessions, setSessions] = useState<LoggedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sessions");
      if (res.ok) {
        const data = (await res.json()) as { sessions?: LoggedSession[] };
        setSessions(data.sessions ?? []);
        setError(null);
      } else if (res.status === 401) {
        setSessions([]);
        setError(null);
      } else {
        setError(`HTTP ${res.status}`);
      }
    } catch {
      setError("network");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { sessions, loading, error, refresh };
}
