"use client";

import { useCallback, useEffect, useState } from "react";
import type { Macrocycle, MacroBlock } from "@hybrid/core";

type Row = { id: string; goal: string; blocks: MacroBlock[]; startedAt: string };

/** The user's active (latest) enrolled macrocycle, reconstructed into the
 *  engine's Macrocycle shape, plus which week of it is "this week" (1-indexed,
 *  derived from when the season started). Null when none is enrolled. */
export function useMacrocycle() {
  const [macro, setMacro] = useState<Macrocycle | null>(null);
  const [currentWeek, setCurrentWeek] = useState(1);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/macrocycles");
      if (!res.ok) return setMacro(null);
      const data = (await res.json()) as { macrocycles?: Row[] };
      const row = data.macrocycles?.[0];
      if (!row || !row.blocks?.length) return setMacro(null);
      const blocks = row.blocks;
      const totalWeeks = blocks[blocks.length - 1]!.endWeek;
      const started = new Date(row.startedAt).getTime();
      const elapsed = Number.isFinite(started)
        ? Math.floor((Date.now() - started) / (7 * 86400000)) + 1
        : 1;
      setCurrentWeek(Math.max(1, Math.min(totalWeeks, elapsed)));
      setMacro({
        model: "",
        goalOrSport: row.goal,
        totalWeeks,
        eventInWeeks: null,
        blocks,
      });
    } catch {
      setMacro(null);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { macro, currentWeek, refresh };
}
