"use client";

import { useQuery } from "@tanstack/react-query";
import type { Macrocycle, MacroBlock } from "@hybrid/core";

type Row = { id: string; goal: string; planId?: string | null; blocks: MacroBlock[]; startedAt: string };

/** Query key for the user's enrolled macrocycle. */
export const macrocycleKey = ["macrocycle"] as const;

async function fetchMacrocycleRow(): Promise<Row | null> {
  const res = await fetch("/api/macrocycles");
  if (!res.ok) return null;
  const data = (await res.json()) as { macrocycles?: Row[] };
  const row = data.macrocycles?.[0];
  return row && row.blocks?.length ? row : null;
}

/** The user's active (latest) enrolled macrocycle, reconstructed into the
 *  engine's Macrocycle shape, plus which week of it is "this week" (1-indexed,
 *  derived from when the season started) and the enrolled named-plan id (when
 *  they picked a real plan). Null when none is enrolled. Backed by the shared
 *  query cache. */
export function useMacrocycle() {
  const q = useQuery({ queryKey: macrocycleKey, queryFn: fetchMacrocycleRow });
  const row = q.data ?? null;

  let macro: Macrocycle | null = null;
  let currentWeek = 1;
  let planId: string | null = null;

  if (row) {
    const blocks = row.blocks;
    const totalWeeks = blocks[blocks.length - 1]!.endWeek;
    const started = new Date(row.startedAt).getTime();
    const elapsed = Number.isFinite(started)
      ? Math.floor((Date.now() - started) / (7 * 86400000)) + 1
      : 1;
    currentWeek = Math.max(1, Math.min(totalWeeks, elapsed));
    planId = row.planId ?? null;
    macro = { model: "", goalOrSport: row.goal, totalWeeks, eventInWeeks: null, blocks };
  }

  return { macro, currentWeek, planId, refresh: () => q.refetch() };
}
