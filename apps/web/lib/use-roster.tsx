"use client";

import { useEffect, useState } from "react";

export type RosterRow = {
  linkId: string;
  name: string;
  email: string;
  sessions: number;
  lastSession: string | null;
  readiness: number | null;
  adherence: number;
  volume: number;
};

/** The coach's active roster with real, computed stats. Empty for non-coaches. */
export function useRoster() {
  const [roster, setRoster] = useState<RosterRow[]>([]);

  useEffect(() => {
    fetch("/api/coach/roster")
      .then((r) => (r.ok ? r.json() : { roster: [] }))
      .then((d: { roster?: RosterRow[] }) => setRoster(d.roster ?? []))
      .catch(() => setRoster([]));
  }, []);

  return { roster };
}
