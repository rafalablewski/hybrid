import { useMemo } from "react";
import { learnedMonth, type LearnedMonth, type LoggedSession } from "@hybrid/core";
import { useVolumeModel } from "./use-volume-model";

/**
 * THE MONTHLY STORY, RESOLVED ONCE.
 *
 * All of the model resolution this needs already lives in `useVolumeModel` —
 * the measured profile, the resolved training age, the athlete's overrides and
 * the model switches — so this reads THAT and hands its `landmarkOptions`
 * straight to the core engine. Nothing about the athlete is assembled twice,
 * which is the only way the story's ceilings and the Volume screen's can be
 * guaranteed to be the same numbers.
 *
 * It is heavy by design: `learnedMonth` replays the landmark resolver at every
 * week boundary in the window and the readiness engine at every day of two
 * windows. Memoised on the inputs, so it costs that once per change of log
 * rather than per render — but it is a SCREEN-level hook either way. The two
 * callers are the story itself and the You tab's lead (which needs the whole
 * month to know which claim moved most); nothing may call it per row.
 */
export function useLearnedMonth(sessions: LoggedSession[]): LearnedMonth {
  const { landmarkOptions, recovery } = useVolumeModel(sessions);
  return useMemo(
    () => learnedMonth({ sessions, recovery, landmarks: landmarkOptions }),
    [sessions, recovery, landmarkOptions],
  );
}
