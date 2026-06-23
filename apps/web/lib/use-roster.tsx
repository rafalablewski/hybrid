"use client";

import { useQuery } from "@tanstack/react-query";

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

/** Query key for the coach's roster. */
export const rosterKey = ["coach-roster"] as const;

async function fetchRoster(): Promise<RosterRow[]> {
  const res = await fetch("/api/coach/roster");
  if (!res.ok) return [];
  const d = (await res.json()) as { roster?: RosterRow[] };
  return d.roster ?? [];
}

/** The coach's active roster with real, computed stats. Empty for non-coaches.
 *  Backed by the shared query cache. */
export function useRoster() {
  const q = useQuery({ queryKey: rosterKey, queryFn: fetchRoster });
  return { roster: q.data ?? [], refresh: () => q.refetch() };
}
