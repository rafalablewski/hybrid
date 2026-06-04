"use client";

import { useEffect, useState } from "react";
import { MOVEMENTS, mergeMovements, type Movement, type MuscleGroup, type LibraryMovement } from "@hybrid/core";

type ApiExercise = {
  name: string;
  pattern: string;
  muscles: string[];
  baseLoad: number | null;
  system: string | null;
  aliases: string[];
};

// Fetches the admin-managed exercise library once and folds it over the built-in
// MOVEMENTS into one catalog. Returns the merged movement map (engine-ready) and
// the sorted, deduped list of pickable names (built-ins + custom). Degrades to
// the built-ins alone when the API/table isn't available.
export function useExercises() {
  const [merged, setMerged] = useState<Record<string, Movement>>(MOVEMENTS);

  useEffect(() => {
    let alive = true;
    fetch("/api/exercises")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const custom: LibraryMovement[] = (d.exercises ?? []).map((e: ApiExercise) => ({
          name: e.name,
          pattern: e.pattern,
          muscles: e.muscles as MuscleGroup[],
          baseLoad: e.baseLoad,
          system: (e.system ?? null) as Movement["system"],
          aliases: e.aliases,
        }));
        setMerged(mergeMovements(MOVEMENTS, custom));
      })
      .catch(() => {
        /* keep the built-ins */
      });
    return () => {
      alive = false;
    };
  }, []);

  const catalog = [...new Set(Object.keys(merged))].sort((a, b) => a.localeCompare(b));
  return { movements: merged, catalog };
}
