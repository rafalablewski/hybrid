"use client";

import { useCallback, useEffect, useState } from "react";
import type { Macrocycle, MacroBlock } from "@hybrid/core";

type Row = { id: string; goal: string; blocks: MacroBlock[]; startedAt: string };

/** The user's active (latest) enrolled macrocycle, reconstructed into the
 *  engine's Macrocycle shape. Null when none is enrolled (or in demo mode). */
export function useMacrocycle() {
  const [macro, setMacro] = useState<Macrocycle | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/macrocycles");
      if (!res.ok) return setMacro(null);
      const data = (await res.json()) as { macrocycles?: Row[] };
      const row = data.macrocycles?.[0];
      if (!row || !row.blocks?.length) return setMacro(null);
      const blocks = row.blocks;
      setMacro({
        model: "",
        goalOrSport: row.goal,
        totalWeeks: blocks[blocks.length - 1]!.endWeek,
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

  return { macro, refresh };
}
