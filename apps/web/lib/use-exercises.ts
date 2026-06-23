"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { MOVEMENTS, mergeMovements, type Movement, type MuscleGroup, type LibraryMovement } from "@hybrid/core";

type ApiExercise = {
  name: string;
  pattern: string;
  muscles: string[];
  baseLoad: number | null;
  system: string | null;
  aliases: string[];
};

/** Query key for the admin-managed exercise library. */
export const exercisesKey = ["exercises"] as const;

async function fetchCustomMovements(): Promise<LibraryMovement[]> {
  const res = await fetch("/api/exercises");
  if (!res.ok) return [];
  const d = (await res.json()) as { exercises?: ApiExercise[] };
  return (d.exercises ?? []).map((e) => ({
    name: e.name,
    pattern: e.pattern,
    muscles: e.muscles as MuscleGroup[],
    baseLoad: e.baseLoad,
    system: (e.system ?? null) as Movement["system"],
    aliases: e.aliases,
  }));
}

// Fetches the admin-managed exercise library and folds it over the built-in
// MOVEMENTS into one catalog. Returns the merged movement map (engine-ready) and
// the sorted, deduped list of pickable names (built-ins + custom). Degrades to
// the built-ins alone when the API/table isn't available.
//
// Backed by the shared query cache: the catalog is effectively static, so it's
// held with a long staleTime — the logger's exercise picker (re)mounts constantly
// and now reuses one cached fetch instead of re-hitting /api/exercises each time.
export function useExercises() {
  const { data: custom } = useQuery({
    queryKey: exercisesKey,
    queryFn: fetchCustomMovements,
    staleTime: 10 * 60_000, // catalog rarely changes within a session
  });
  const merged = useMemo(
    () => (custom && custom.length ? mergeMovements(MOVEMENTS, custom) : MOVEMENTS),
    [custom],
  );
  const catalog = useMemo(
    () => [...new Set(Object.keys(merged))].sort((a, b) => a.localeCompare(b)),
    [merged],
  );
  return { movements: merged, catalog };
}
