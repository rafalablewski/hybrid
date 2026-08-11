import { useMemo } from "react";
import { recoveryReports, sessionEndTimes, type LoggedSession, type RecoveryReport } from "@hybrid/core";
import { useCheckinsQuery } from "./queries";

/**
 * THE CHECK-IN HISTORY ON THE ENGINE'S OWN TERMS.
 *
 * The mapping itself moved to core (`recoveryReports`) once the admin Engine
 * Room needed the same thing: a day is EVERY READ it carries, not one value,
 * and the console has to be able to check an athlete's clearance split against
 * the identical inputs their phone used. Writing it twice is how the two would
 * come to disagree about one athlete.
 *
 * What is left here is the hook part — the cache read — which is all a hook
 * should ever have been.
 */
export function useRecoveryReports(sessions: LoggedSession[]): RecoveryReport[] {
  const { data: checkins = [] } = useCheckinsQuery();
  const ends = useMemo(() => sessionEndTimes(sessions), [sessions]);
  return useMemo(() => recoveryReports(checkins, ends), [checkins, ends]);
}
