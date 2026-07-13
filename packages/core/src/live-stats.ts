/**
 * Live in-session stats — the running scoreboard shown WHILE an empty-log
 * workout is in progress (and the numbers behind the finish summary + share
 * cards). One pure helper both clients call so the web logger and the mobile
 * live logger can't drift.
 *
 * It reads the same SessionBlock shape both editors build, and reuses the
 * canonical session/record engines (sessionVolume, newPrsInSession,
 * newCardioPrsInSession) so volume + PR detection stay single-source.
 */
import type { SessionBlock, LoggedSession } from "./engines";
import { sessionVolume, newPrsInSession, newCardioPrsInSession } from "./engines";

export interface LiveStats {
  /** Exercises with at least one logged set / a logged effort. */
  exercises: number;
  /** Working/logged sets entered so far (a cardio/conditioning effort counts as 1). */
  sets: number;
  /** Tonnage moved (kg) across strength working sets. */
  volume: number;
  /** Strength PRs hit so far this session vs. prior history. */
  prs: number;
  /** Cardio PRs (distance / pace) hit so far this session vs. prior history. */
  cardioPrs: number;
}

const filled = (v: unknown): boolean => typeof v === "string" && v.trim().length > 0;

/**
 * Compute the live scoreboard for an in-progress (or just-finished) session.
 * `prior` is the athlete's previous sessions, used only for PR counts — pass an
 * empty array (the default) when you just want exercises/sets/volume. Pass the
 * athlete's `bodyweightKg` so bodyweight lifts count their true tonnage.
 */
export function liveSessionStats(
  blocks: SessionBlock[],
  prior: LoggedSession[] = [],
  opts: { bodyweightKg?: number | null } = {},
): LiveStats {
  let exercises = 0;
  let sets = 0;
  for (const b of blocks) {
    if (b.kind === "strength") {
      // A set counts once the athlete has typed reps or a load into it.
      const logged = b.sets.filter((s) => filled(s.reps) || filled(s.load));
      if (logged.length) {
        exercises += 1;
        sets += logged.length;
      }
    } else if (b.kind === "cardio") {
      if (b.distance != null || b.minutes != null) {
        exercises += 1;
        sets += 1;
      }
    } else {
      if (b.minutes != null) {
        exercises += 1;
        sets += 1;
      }
    }
  }

  const volume = sessionVolume(blocks, false, opts.bodyweightKg);

  // PRs need a LoggedSession shape; the live blocks ARE that session-in-progress.
  const live: LoggedSession = {
    id: "live",
    title: "",
    startedAt: new Date().toISOString(),
    blocks,
  };
  const prs = prior.length ? newPrsInSession(live, prior).length : 0;
  const cardioPrs = prior.length ? newCardioPrsInSession(live, prior).length : 0;

  return { exercises, sets, volume, prs, cardioPrs };
}
