/**
 * THE OPENED POST — the whole workout behind a feed card.
 *
 * A feed row deliberately shows two or three lines (feed-card.ts `topSetLines`):
 * the stream is a stream, not a training log. But a card that can't be OPENED
 * makes the top sets the whole story — you can see that someone squatted 180,
 * never what the session actually was. This module is the other half: the
 * complete ledger of one session, every exercise and every set, as the athlete
 * logged it.
 *
 * It is PURE and unit-agnostic like the card model — loads stay kg, durations
 * stay minutes, nothing here is English — so web and mobile render the identical
 * workout from one computation.
 *
 * DEVICE TRUTH (CLAUDE.md): the blocks are read through `deviceTrueSession`, so
 * an opened post shows what the watch measured, never what was typed beside it.
 * The stat header is `sessionStats` — the SAME row the card carries, so opening
 * a post can never contradict the row it came from.
 *
 * PRIVACY: this reads only what the feed already carries — title, times, blocks
 * and the device recording. The private post-workout reflection (note / mood /
 * tags) is owner-only by schema and must never be passed in here.
 */
import { deviceTrueSession } from "./device-truth";
import {
  blockSummary,
  blockTopLoad,
  setType,
  setTypeBadge,
  supersetLabels,
  type LoggedSession,
  type SessionBlock,
  type SetType,
  type StrengthBlock,
} from "./engines";
import { sessionStats, type FeedStat } from "./feed-card";

/** One logged set, as it will be read on the opened post. */
export interface FeedWorkoutSet {
  /** the set's mark in the ledger: "1", "2" … or "W" / "C" / "↓" (setTypeBadge). */
  badge: string;
  /** working / warmup / cooldown / drop — the clients colour the badge by it. */
  type: SetType;
  /** load in kg, or null for bodyweight / time / distance work. */
  loadKg: number | null;
  /** reps AS LOGGED ("5", "10/leg", "30 s") — never re-parsed into a number. */
  reps: string;
  rpe?: string;
  /** mean concentric velocity, m/s (VBT), as logged. */
  velocity?: string;
}

/** One exercise of the workout. Strength blocks carry their sets; everything
 *  else (a run, a metcon) carries the one-line summary it reads as everywhere. */
export interface FeedWorkoutExercise {
  name: string;
  kind: SessionBlock["kind"];
  /** "A1"/"A2" when this block is part of a superset, else null. */
  superset: string | null;
  /** heaviest working load on the exercise, kg; null when there isn't one. */
  topLoadKg: number | null;
  sets: FeedWorkoutSet[];
  /** the non-strength one-liner (cardio / conditioning); null for strength. */
  summary: string | null;
}

/** The whole workout behind a post. */
export interface FeedWorkoutView {
  title: string;
  startedAt: string;
  completedAt: string | null;
  /** the card's own stat row — device-true, so the two surfaces agree. */
  stats: FeedStat[];
  exercises: FeedWorkoutExercise[];
  /** the session carries a matched device recording. */
  device: boolean;
  exerciseCount: number;
  /** strength sets logged across the session (the ledger's length). */
  setCount: number;
}

const isStrength = (b: SessionBlock): b is StrengthBlock => b.kind === "strength";

const num = (s: string | undefined): number | null => {
  const n = parseFloat(s ?? "");
  return Number.isFinite(n) ? n : null;
};

/**
 * The complete workout behind a feed post, read through device truth.
 *
 * `blockTopLoad` is bodyweight-aware for the athlete who logged it, and a
 * viewer does NOT know a stranger's body mass — so the top load here is the
 * plain logged load. An opened post shows what was on the bar, and never
 * invents a bodyweight-adjusted figure the author never saw.
 */
export function feedWorkoutView(session: LoggedSession): FeedWorkoutView {
  const s = deviceTrueSession(session);
  const labels = supersetLabels(s.blocks);
  let setCount = 0;

  const exercises: FeedWorkoutExercise[] = s.blocks.map((b, i) => {
    if (!isStrength(b)) {
      return {
        name: b.name,
        kind: b.kind,
        superset: labels[i] ?? null,
        topLoadKg: null,
        sets: [],
        summary: blockSummary(b),
      };
    }
    setCount += b.sets.length;
    const top = blockTopLoad(b);
    return {
      name: b.name,
      kind: b.kind,
      superset: labels[i] ?? null,
      topLoadKg: top > 0 ? top : null,
      sets: b.sets.map((set, j) => ({
        badge: setTypeBadge(set, j),
        type: setType(set),
        loadKg: num(set.load),
        reps: (set.reps ?? "").trim(),
        ...(set.rpe ? { rpe: set.rpe } : {}),
        ...(set.vel ? { velocity: set.vel } : {}),
      })),
      summary: null,
    };
  });

  return {
    title: session.title,
    startedAt: session.startedAt,
    completedAt: session.completedAt ?? null,
    stats: sessionStats(session),
    exercises,
    device: !!session.device,
    exerciseCount: exercises.length,
    setCount,
  };
}
