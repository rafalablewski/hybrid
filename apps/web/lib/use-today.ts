"use client";

import { useEffect, useState } from "react";
import { localTodayKey, msUntilNextLocalDay } from "@hybrid/core";

/**
 * The current LOCAL calendar day, as a reactive value. The web twin of mobile's
 * lib/use-today.ts — same contract, same reason.
 *
 * "Today" is not a pure function of the fetched data. Every day-scoped memo
 * (today's check-in, today's prescription, the masthead date, which chip the
 * week rail calls today) used to derive `new Date()` INSIDE a `useMemo` keyed
 * only on its data, so a tab left open across midnight — or a laptop reopened
 * the next morning — kept rendering yesterday as today.
 *
 * Depending on this key makes the day an explicit input. Two triggers, because
 * neither is sufficient alone:
 *   • a timer armed to the next local midnight — covers a tab open across the
 *     boundary;
 *   • visibilitychange → visible — covers the common case, where the machine
 *     slept and background timers were throttled or never ran.
 *
 * The setter compares before writing, so a wake on the same day doesn't
 * re-render.
 */
export function useToday(): string {
  const [day, setDay] = useState(localTodayKey);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const sync = () => {
      setDay((cur) => {
        const next = localTodayKey();
        return next === cur ? cur : next;
      });
      // Re-arm from the NEW now, not by adding 24h: DST days are 23 or 25 hours
      // and a drifting timer would eventually fire on the wrong side of midnight.
      timer = setTimeout(sync, msUntilNextLocalDay());
    };

    timer = setTimeout(sync, msUntilNextLocalDay());

    const onWake = () => {
      if (document.visibilityState !== "visible") return;
      if (timer) clearTimeout(timer);
      sync();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);

    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, []);

  return day;
}
