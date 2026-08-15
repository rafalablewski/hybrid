/**
 * THE POST — the whole workout behind a feed card.
 *
 * A feed row deliberately shows two or three lines (feed-card.ts `topSetLines`):
 * the stream is a stream, not a training log. But a card that can't be OPENED
 * makes the top sets the whole story — you can see that someone squatted 180,
 * never what the session actually was. This module is the other half: the
 * complete ledger of one session, every exercise and every set, every figure
 * the session can honestly produce (minutes, tonnage, sets, reps, distance,
 * pace) — and the RECORDS it set, listed one after another.
 *
 * It is PURE and unit-agnostic like the card model — loads stay kg, durations
 * stay minutes, paces stay seconds-per-km, nothing here is English — so web and
 * mobile render the identical post from one computation.
 *
 * DEVICE TRUTH (CLAUDE.md): the blocks are read through `deviceTrueSession`, so
 * an opened post shows what the watch measured, never what was typed beside it,
 * and every derived rate (the paces here) divides the device's own seconds
 * rather than display-rounded minutes. The stat header EXTENDS the card's own
 * `sessionStats` — the same figures in the same order, with the ones a row had
 * no space for appended — so a post can never contradict the row it came from.
 *
 * PRIVACY: this reads only what the feed already carries — title, times, blocks
 * and the device recording. The private post-workout reflection (note / mood /
 * tags) is owner-only by schema and must never be passed in here.
 */
import { deviceTrueSession } from "./device-truth";
import {
  blockSummary,
  blockTopLoad,
  cardioPace,
  cardioSeconds,
  sessionVolume,
  setType,
  setTypeBadge,
  supersetLabels,
  type LoggedSession,
  type SessionBlock,
  type SetType,
  type StrengthBlock,
} from "./engines";
import { sessionStats, type FeedPrLine, type FeedStat } from "./feed-card";
import { orderFigures } from "./figure-order";

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
  /** sets logged on this exercise (0 for a run). */
  setCount: number;
  /** reps logged across those sets — 0 when the exercise counts in seconds or
   *  metres, which are never summed as reps. */
  reps: number;
  /** tonnage moved on this exercise, kg (the same engine the session total
   *  uses, so the parts add up to the whole). 0 when the work isn't tonnage. */
  volumeKg: number;
  /** distance covered, km — cardio only. */
  distanceKm: number | null;
  /** time on the clock, minutes — cardio / conditioning only. */
  minutes: number | null;
  /** the effort's pace in ITS OWN unit ("5:42 /km", "1:38 /100m"), derived from
   *  the device's seconds where a device measured them. Null when unpaced. */
  pace: string | null;
}

/** The session's own figures, once. Every one of these is also in `stats` (the
 *  row both surfaces render); this is the same data addressable by name, for a
 *  client that wants one figure rather than the row. */
export interface FeedWorkoutTotals {
  minutes: number;
  /** tonnage, kg. */
  volumeKg: number;
  sets: number;
  reps: number;
  exercises: number;
  distanceKm: number;
  /** seconds per km across the session's cardio, distance-weighted. */
  paceSecPerKm: number | null;
  avgHr: number | null;
  kcal: number | null;
  elevationM: number;
}

/** The whole workout behind a post. */
export interface FeedWorkoutView {
  title: string;
  startedAt: string;
  completedAt: string | null;
  /** the card's own stat row, EXTENDED with the figures a row had no space for
   *  (reps, distance, pace, kcal) — same computation, so the two agree. */
  stats: FeedStat[];
  totals: FeedWorkoutTotals;
  exercises: FeedWorkoutExercise[];
  /** the records this workout set, heaviest first. Empty on an ordinary day —
   *  and a record is never a post of its own (see feed-card.ts). */
  prs: FeedPrLine[];
  /** the session carries a matched device recording. */
  device: boolean;
  exerciseCount: number;
  /** strength sets logged across the session (the ledger's length). */
  setCount: number;
}

const isStrength = (b: SessionBlock): b is StrengthBlock => b.kind === "strength";

/** The i18n key for a SET COUNT, singular or plural. One exercise really can
 *  have one set, and "1 sets" is the kind of thing a training app cannot say. */
export const setCountKey = (n: number): string => (n === 1 ? "feed.session.set" : "feed.session.sets");

const num = (s: string | undefined): number | null => {
  const n = parseFloat(s ?? "");
  return Number.isFinite(n) ? n : null;
};

/**
 * The stat row for the POST: everything the card carries, plus the figures a
 * two-or-three-cell row could never fit — total reps, the distance that a
 * heart-rate reading pushed out of the card, the pace it implies and the energy
 * the device measured.
 *
 * It EXTENDS `sessionStats` rather than recomputing: the cells are literally
 * the card's, so opening a post can't restate its minutes differently. The
 * extras used to be APPENDED, which put reps after duration and distance on an
 * opened post while the card beside it had them the other way round; the whole
 * row sorts through the app's one reading order (figure-order.ts) instead, so
 * the post reads as the card with more of it rather than as a second layout.
 */
export function feedWorkoutStats(session: LoggedSession): FeedStat[] {
  const s = deviceTrueSession(session);
  const dev = session.device;
  const stats = [...sessionStats(session)];
  const has = (key: FeedStat["key"]) => stats.some((x) => x.key === key);

  let reps = 0;
  let distanceKm = 0;
  let seconds = 0;
  for (const b of s.blocks) {
    if (isStrength(b)) {
      for (const set of b.sets) {
        const n = num(set.reps);
        // "10/leg" parses to 10 — the leading count is the honest read, and the
        // per-side notation is preserved verbatim on the set line itself.
        if (n != null && n > 0) reps += n;
      }
      continue;
    }
    if (b.kind === "cardio") {
      distanceKm += b.distance ?? 0;
      seconds += (b.distance ?? 0) > 0 ? cardioSeconds(b) ?? 0 : 0;
    }
  }

  if (reps > 0) stats.push({ key: "reps", value: reps });
  if (distanceKm > 0 && !has("distance")) stats.push({ key: "distance", value: distanceKm, device: !!dev?.distanceKm });
  // Pace divides the DEVICE's seconds where it recorded them (CLAUDE.md) — a
  // pace derived from the rounded minutes beside it would contradict them.
  if (distanceKm > 0 && seconds > 0) stats.push({ key: "pace", value: Math.round(seconds / distanceKm), device: !!dev?.durationSec });
  if (dev?.kcal) stats.push({ key: "kcal", value: dev.kcal, device: true });
  return orderFigures(stats, (x) => x.key);
}

/**
 * The complete workout behind a feed post, read through device truth.
 *
 * `blockTopLoad` is bodyweight-aware for the athlete who logged it, and a
 * viewer does NOT know a stranger's body mass — so the top load here is the
 * plain logged load. An opened post shows what was on the bar, and never
 * invents a bodyweight-adjusted figure the author never saw.
 *
 * `prs` are the records the session set, as the feed already computed them
 * (feed-card.ts `sessionDetail`) — passed in rather than recomputed, because
 * detecting a record needs everything the athlete did BEFORE this session and
 * the post only ever holds the session itself.
 */
export function feedWorkoutView(session: LoggedSession, prs: FeedPrLine[] = []): FeedWorkoutView {
  const s = deviceTrueSession(session);
  const labels = supersetLabels(s.blocks);
  let setCount = 0;

  const exercises: FeedWorkoutExercise[] = s.blocks.map((b, i) => {
    const superset = labels[i] ?? null;
    if (!isStrength(b)) {
      const distanceKm = b.kind === "cardio" ? b.distance ?? null : null;
      return {
        name: b.name,
        kind: b.kind,
        superset,
        topLoadKg: null,
        sets: [],
        summary: blockSummary(b),
        setCount: 0,
        reps: 0,
        volumeKg: 0,
        distanceKm: distanceKm && distanceKm > 0 ? distanceKm : null,
        minutes: b.minutes && b.minutes > 0 ? b.minutes : null,
        pace: b.kind === "cardio" ? cardioPace(b) : null,
      };
    }
    setCount += b.sets.length;
    const top = blockTopLoad(b);
    let reps = 0;
    for (const set of b.sets) {
      const n = num(set.reps);
      if (n != null && n > 0) reps += n;
    }
    return {
      name: b.name,
      kind: b.kind,
      superset,
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
      setCount: b.sets.length,
      reps,
      // One block through the SAME engine the session total uses, so the
      // per-exercise tonnages add up to the figure in the header.
      volumeKg: sessionVolume([b]),
      distanceKm: null,
      minutes: null,
      pace: null,
    };
  });

  const stats = feedWorkoutStats(session);
  const stat = (key: FeedStat["key"]) => stats.find((x) => x.key === key)?.value ?? null;

  return {
    title: session.title,
    startedAt: session.startedAt,
    completedAt: session.completedAt ?? null,
    stats,
    totals: {
      minutes: stat("duration") ?? 0,
      volumeKg: stat("volume") ?? 0,
      sets: stat("sets") ?? 0,
      reps: stat("reps") ?? 0,
      exercises: exercises.length,
      distanceKm: stat("distance") ?? 0,
      paceSecPerKm: stat("pace"),
      avgHr: stat("hr"),
      kcal: stat("kcal"),
      elevationM: s.blocks.reduce((m, b) => m + (b.kind === "cardio" ? b.elevation ?? 0 : 0), 0),
    },
    exercises,
    prs,
    device: !!session.device,
    exerciseCount: exercises.length,
    setCount,
  };
}
