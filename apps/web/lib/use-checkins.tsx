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
  // The details half of the row. The API has always returned these; the type
  // didn't name them, so the wizard editing this row couldn't prefill them and
  // submitted blanks over the athlete's own entries.
  bodyMassKg?: number | null;
  adherencePct?: number | null;
  note?: string | null;
  sharedWithCoach?: boolean | null;
  createdAt?: string;
  /**
   * Every readiness answer given on this day, oldest first. The day's `energy`
   * above is the DECISIVE one (the latest not taken minutes after training);
   * these are what make it interpretable — "flat at 09:30" and "flat at 22:00"
   * are two measurements, and the gap between them is a read of the athlete's
   * own clearance rate. Absent on a database that hasn't run
   * reference/sql-checkin-reads.sql yet, which every consumer treats as "one
   * read, the stored value". See core/readiness-reads.ts.
   */
  reads?: { metric: string; value: number; loggedAt: string; sinceSessionH?: number | null }[];
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
