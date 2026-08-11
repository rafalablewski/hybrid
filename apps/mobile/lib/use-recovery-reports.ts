import { useMemo } from "react";
import {
  readReports, placeReads, QUICK_CHECKIN_METRIC,
  type LoggedSession, type RecoveryReport,
} from "@hybrid/core";
import { useCheckinsQuery } from "./queries";

/**
 * THE CHECK-IN HISTORY ON THE ENGINE'S OWN TERMS.
 *
 * Extracted from `use-volume-model` because a second consumer arrived (the heat
 * clearance comparison) and the mapping is not trivial enough to write twice:
 * a day is EVERY READ it carries, not one value. The card asks again once a
 * session has drained, so a day can hold "wrecked at 09:30" and "good at
 * 22:00" — which is precisely the pair `athleteClearance` and `saunaClearance`
 * need, and which one stored value could never express. `readReports` gives the
 * day its DECISIVE read (freshness, sleep and mood travel with it, answered
 * once) and emits the others as timed reads of their own.
 *
 * Duplicating that would have been the drift, not the abstraction.
 */
export function useRecoveryReports(sessions: LoggedSession[]): RecoveryReport[] {
  const { data: checkins = [] } = useCheckinsQuery();
  const sessionEnds = useMemo(
    () => sessions.map((s) => Date.parse(s.completedAt ?? s.startedAt ?? "")).filter((t) => Number.isFinite(t)),
    [sessions],
  );
  return useMemo(
    () =>
      checkins.flatMap((c) => {
        const day: RecoveryReport = {
          date: c.weekOf, soreness: c.soreness, sleep: c.sleep,
          energy: c.energy, mood: c.mood, loggedAt: c.createdAt ?? null,
        };
        const rows = (c.reads ?? []).filter((r) => r.metric === QUICK_CHECKIN_METRIC);
        if (rows.length < 2) return [day];
        return readReports(
          day,
          placeReads(rows.map((r) => ({ value: r.value, at: Date.parse(r.loggedAt) })), sessionEnds),
        ) as RecoveryReport[];
      }),
    [checkins, sessionEnds],
  );
}
