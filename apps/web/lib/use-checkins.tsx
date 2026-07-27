"use client";

import { useQuery } from "@tanstack/react-query";
import { toRead } from "./read";

/** A readiness check-in row as the API returns it. `weekOf` is the day the
 *  check-in covers (legacy column name). */
export type CheckinRow = {
  weekOf: string;
  energy: number | null;
  sleep: number | null;
  soreness: number | null;
  mood: number | null;
  createdAt?: string;
};

/** Query key for the athlete's readiness check-ins. */
export const checkinsKey = ["checkins"] as const;

async function fetchCheckins(): Promise<CheckinRow[]> {
  const res = await fetch("/api/checkins");
  // Signed-out / demo mode is a real answer: no check-ins.
  if (res.status === 401) return [];
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = (await res.json()) as { checkins?: CheckinRow[] } | null;
  return d?.checkins ?? [];
}

/**
 * The athlete's readiness check-ins, from the shared query cache.
 *
 * Replaces the per-screen `useState([]) + useEffect(fetch)` copies, which had
 * two problems beyond the duplicate request: they swallowed failures into an
 * empty array (indistinguishable from "you haven't checked in"), and they gave
 * the screen no way to say "we don't know yet" — so today's feeling card
 * rendered its blank state as fact until the fetch landed.
 *
 * Mirrors mobile's useCheckinsRead().
 */
export function useCheckins() {
  return toRead(useQuery({ queryKey: checkinsKey, queryFn: fetchCheckins }));
}
