"use client";

import { useQuery } from "@tanstack/react-query";
import type { FuelLogRow } from "@hybrid/core";

/** Query key for the athlete's food diary entries. */
export const foodLogsKey = ["foodLogs"] as const;

async function fetchFoodLogs(): Promise<FuelLogRow[]> {
  const res = await fetch("/api/nutrition/log");
  // Signed-out is a real answer: nothing logged.
  if (res.status === 401) return [];
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = (await res.json()) as { logs?: FuelLogRow[] } | null;
  return d?.logs ?? [];
}

/**
 * The athlete's logged food/meal entries (FoodLog rows plus the Signal-derived
 * ones), from the shared query cache — the same payload the Nutrition Diary
 * lists. Today's Fuel widget reads it to show WHAT was eaten alongside the
 * macros, so the day's meals don't have to be dug out of Nutrition.
 *
 * Cached rather than fetched per screen: every nutrition write already calls
 * revalidate.recovery(), which drops this key too, so the plate stays honest.
 * Mirrors mobile's useFoodLogsQuery().
 */
export function useFoodLogs() {
  const q = useQuery({ queryKey: foodLogsKey, queryFn: fetchFoodLogs });
  return { logs: q.data ?? [], loading: q.isLoading };
}
