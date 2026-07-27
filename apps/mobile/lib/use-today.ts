import { useEffect, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { localTodayKey, msUntilNextLocalDay } from "@hybrid/core";

/**
 * The current LOCAL calendar day, as a reactive value.
 *
 * "Today" is not a pure function of the fetched data, which is the trap this
 * closes. Every day-scoped memo in the app (today's check-in, today's
 * prescription, the masthead date, which chip the week rail calls today) used
 * to derive `new Date()` INSIDE a `useMemo` keyed only on its data — so the
 * clock could roll past midnight and nothing recomputed. A phone left
 * backgrounded overnight (the normal case, not the edge case) then woke showing
 * yesterday's date, yesterday's feeling card and yesterday's session as "today".
 *
 * Depending on this key instead makes the day an explicit input: the memo
 * re-runs when the day flips, and only then. Two triggers, because neither one
 * is sufficient alone:
 *   • a timer armed to the next local midnight — covers the app being open
 *     across the boundary;
 *   • AppState → active — covers the far more common case, where the phone was
 *     asleep and JS timers never fired at all.
 *
 * The setter is a no-op comparison, so a wake that lands on the same day
 * doesn't re-render.
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

    const sub = AppState.addEventListener("change", (status: AppStateStatus) => {
      if (status !== "active") return;
      if (timer) clearTimeout(timer);
      sync();
    });

    return () => {
      if (timer) clearTimeout(timer);
      sub.remove();
    };
  }, []);

  return day;
}
