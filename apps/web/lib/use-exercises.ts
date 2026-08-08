"use client";

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { MOVEMENTS, mergeMovements, catalogNames, aliasNames, categoriesByName, setExerciseCatalog, setExerciseMediaCatalog, type Movement, type MuscleGroup, type LibraryMovement } from "@hybrid/core";

type ApiExercise = {
  name: string;
  pattern: string;
  muscles: string[];
  baseLoad: number | null;
  system: string | null;
  aliases: string[];
  category: string | null;
  videoUrl: string | null;
  thumbUrl: string | null;
};

/** Query key for the admin-managed exercise library. */
export const exercisesKey = ["exercises"] as const;

async function fetchCustomMovements(): Promise<LibraryMovement[]> {
  const res = await fetch("/api/exercises");
  if (!res.ok) return [];
  const d = (await res.json()) as { exercises?: ApiExercise[] };
  // The rows also carry each lift's admin-set DEMO MEDIA — published to core's
  // media resolver here so the exercise demo shows the real asset (see
  // lib/exercise-catalog.ts, which does the same on the engine path).
  setExerciseMediaCatalog((d.exercises ?? []).map((e) => ({ name: e.name, videoUrl: e.videoUrl, thumbUrl: e.thumbUrl })));
  return (d.exercises ?? []).map((e) => ({
    name: e.name,
    pattern: e.pattern,
    muscles: e.muscles as MuscleGroup[],
    baseLoad: e.baseLoad,
    system: (e.system ?? null) as Movement["system"],
    aliases: e.aliases,
    category: e.category ?? null,
  }));
}

// Fetches the admin-managed exercise library and folds it over the built-in
// MOVEMENTS into one catalog. Returns the merged movement map (engine-ready), the
// sorted list of PICKABLE names (built-ins + custom, aliases excluded) and the
// set of aliased names to hide from the picker. Degrades to the built-ins alone
// when the API/table isn't available.
//
// `movements` keeps every alias key so the engines still RESOLVE an old logged
// session that used one; `catalog`/`aliases` exist so the picker shows each lift
// ONCE under its primary name (a custom "Barbell Bench Press" that aliases the
// built-in "Bench Press" hides "Bench Press" rather than listing both).
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
    () => [...new Set(catalogNames(MOVEMENTS, custom ?? []))].sort((a, b) => a.localeCompare(b)),
    [custom],
  );
  const aliases = useMemo(() => aliasNames(custom ?? []), [custom]);
  const categoryByName = useMemo(() => categoriesByName(custom ?? []), [custom]);
  // Keep the ENGINE catalog in step with the picker's. The engines' first load is
  // guaranteed by useSessions (it awaits ensureExerciseCatalog before the sessions
  // land); this only tops it up when a long-lived session refetches the library.
  useEffect(() => { if (custom) setExerciseCatalog(custom); }, [custom]);
  return { movements: merged, catalog, aliases, categoryByName };
}
