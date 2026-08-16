import {
  bodyweightLookup,
  deriveSessionLaps,
  exerciseNameAliasMap,
  migrateBlocks,
  sessionSetFacts,
  streamSummary,
  STREAM_UNIT,
  type BodyweightLookup,
  type LoggedSession,
  type SessionLap,
  type SessionStream,
  type SetFact,
} from "@hybrid/core";
import type { Prisma, Session } from "@prisma/client";
import { getCachedPublishedExercises, publishExerciseCatalog } from "@/lib/cache";
import { prisma } from "@/lib/db";

/**
 * THE PROJECTION WRITER — keeping the queryable tables in step with the document.
 *
 * `Session.blocks` is the source of truth and stays that way: it is what the
 * logger writes, what the clients read, and what every screen renders. What it
 * cannot be is QUERIED — a set inside a jsonb column is not a value Postgres can
 * see, so before `SessionSet` existed every cross-athlete question was a
 * full-session scan in this lambda under a row cap that silently truncates the
 * answer.
 *
 * So the document gets projected. Every write of a session's blocks rewrites its
 * fact rows here from core's `sessionSetFacts` — the one implementation of what
 * a set means, shared with the engines so an aggregate and a screen can never
 * disagree. The rewrite itself is transactional (delete-then-insert); it follows
 * the session write rather than joining it, for the reason in (2) below.
 *
 * THREE PROPERTIES THIS FILE HAS TO KEEP:
 *
 *  1. IDEMPOTENT. Rewriting is delete-then-insert inside a transaction, keyed on
 *     the session. Re-running it on an unchanged session produces byte-identical
 *     rows, which is what makes the backfill safe to run repeatedly.
 *
 *  2. NEVER FATAL TO THE WRITE IT FOLLOWS. A projection failure must not lose an
 *     athlete's workout. The session write is committed first and the projection
 *     is attempted after it; if it throws (an unmigrated database, most likely),
 *     the failure is logged and swallowed, and the backfill route repairs it.
 *     A derived table is not worth a 500 on the core logging path.
 *
 *  3. DENORMALISED IN STEP. userId / performedAt / archived are copied onto
 *     every row so an aggregate never joins back to Session — which means an
 *     archive, a re-date or a delete has to touch these rows too. Every mutation
 *     that changes one of those three on a session calls in here.
 */

/** How the API hands a session row to the projection — the stored row, as
 *  Prisma returns it. Canonicalisation happens inside (see `toLogged`). */
export type ProjectableSession = Pick<
  Session,
  "id" | "userId" | "startedAt" | "completedAt" | "archivedAt" | "title"
> & { blocks: unknown; device?: unknown };

const toLogged = (s: ProjectableSession, aliasMap: Record<string, string>): LoggedSession => ({
  id: s.id,
  title: s.title,
  startedAt: s.startedAt.toISOString(),
  completedAt: s.completedAt?.toISOString() ?? null,
  // Canonicalised on the way in, exactly as the read path does it: `exercise` is
  // the column every cross-athlete aggregate GROUPs BY, so a lift stored under a
  // superseded name has to project under its CURRENT one. Without this a rename
  // would split one lift's history into two exercises that never add up again.
  blocks: migrateBlocks(s.blocks, aliasMap),
  device: (s.device ?? null) as LoggedSession["device"],
});

/**
 * The admin exercise library, published to the engines and folded into a rename
 * map — the two things `movementFor` and `migrateBlocks` need to resolve a lift
 * the built-in catalog doesn't carry verbatim.
 *
 * It matters MORE here than on a read path. A name that doesn't resolve gets a
 * null `movement` and an empty `muscles`, which is not an error anywhere — it is
 * a row that quietly attributes to nothing, and a pattern-balance aggregate
 * built from those rows reports a gap the athlete does not have.
 */
async function exerciseContext(): Promise<Record<string, string>> {
  await publishExerciseCatalog();
  return exerciseNameAliasMap(await getCachedPublishedExercises());
}

/**
 * The athlete's bodyweight over time, as a dated lookup.
 *
 * Bodyweight-dependent lifts (pull-ups, dips, assisted work) resolve against the
 * weight the athlete WAS at each session's date — 10 pull-ups at 70 kg is 700 kg
 * of work even if they are 75 kg today. Reading the latest weight and applying
 * it to a year of history would rewrite the past.
 *
 * Bounded: the most recent 400 weigh-ins is more history than any lookup needs
 * and keeps the projection's cost flat for an athlete who syncs a scale daily.
 */
export async function athleteBodyweight(userId: string): Promise<BodyweightLookup> {
  const rows = await prisma.bodyMetric.findMany({
    where: { userId, weightKg: { not: null } },
    orderBy: { measuredAt: "desc" },
    take: 400,
    select: { measuredAt: true, weightKg: true },
  });
  return bodyweightLookup(
    rows.map((r) => ({ date: r.measuredAt.toISOString(), weightKg: r.weightKg! })),
  );
}

/** One fact → the row shape Prisma writes. Kept beside the projection so a new
 *  column on the fact can't be forgotten here. */
const factRow = (
  f: SetFact,
  s: ProjectableSession,
): Prisma.SessionSetCreateManyInput => ({
  sessionId: s.id,
  userId: s.userId,
  performedAt: s.startedAt,
  archived: s.archivedAt != null,
  blockIndex: f.blockIndex,
  setIndex: f.setIndex,
  kind: f.kind,
  exercise: f.exercise,
  movement: f.movement,
  muscles: f.muscles,
  discipline: f.discipline,
  role: f.role,
  drop: f.drop,
  reps: f.reps,
  loadKg: f.loadKg,
  bodyweightKg: f.bodyweightKg,
  effectiveLoadKg: f.effectiveLoadKg,
  volumeKg: f.volumeKg,
  e1rmKg: f.e1rmKg,
  rpe: f.rpe,
  velocityMs: f.velocityMs,
  peakVelocityMs: f.peakVelocityMs,
  romCm: f.romCm,
  restSec: f.restSec,
  distanceKm: f.distanceKm,
  durationSec: f.durationSec,
  paceSecPerKm: f.paceSecPerKm,
  elevationM: f.elevationM,
  watts: f.watts,
  zone: f.zone,
  rounds: f.rounds,
  measured: f.measured,
});

/**
 * Rewrite one session's fact rows. Delete-then-insert in a transaction, so a
 * reader either sees the old projection or the new one — never a half-written
 * session whose tonnage is missing three sets.
 *
 * Throws on failure; callers on a write path should use `projectSessionSafely`.
 */
export async function projectSession(
  session: ProjectableSession,
  bw?: BodyweightLookup,
): Promise<number> {
  const lookup = bw ?? (await athleteBodyweight(session.userId));
  const facts = sessionSetFacts(toLogged(session, await exerciseContext()), lookup);
  const rows = facts.map((f) => factRow(f, session));
  await prisma.$transaction([
    prisma.sessionSet.deleteMany({ where: { sessionId: session.id } }),
    ...(rows.length ? [prisma.sessionSet.createMany({ data: rows })] : []),
  ]);
  return rows.length;
}

/**
 * `projectSession`, but a failure is logged and swallowed.
 *
 * Used by every route that has already committed the athlete's workout. The
 * projection is derived data: losing it costs an analytic until the next write
 * or the next backfill, whereas failing the request would cost the athlete the
 * session they just finished. That trade is never close.
 */
export async function projectSessionSafely(
  session: ProjectableSession,
  bw?: BodyweightLookup,
): Promise<void> {
  try {
    await projectSession(session, bw);
  } catch (e) {
    console.error("[session-projection] failed for", session.id, e);
  }
}

/**
 * Mirror an archive/restore onto the projections.
 *
 * `archived` is denormalised precisely so an analytic never joins Session, which
 * means it is this call's job to keep it true. Archived workouts stay out of
 * every aggregate exactly as they stay out of History.
 */
export async function setProjectionArchived(sessionId: string, archived: boolean): Promise<void> {
  try {
    const where = { sessionId };
    await prisma.$transaction([
      prisma.sessionSet.updateMany({ where, data: { archived } }),
      prisma.sessionStream.updateMany({ where, data: { archived } }),
      prisma.sessionLap.updateMany({ where, data: { archived } }),
    ]);
  } catch (e) {
    console.error("[session-projection] archive mirror failed for", sessionId, e);
  }
}

/**
 * Store a recording's STREAMS and LAPS against a session.
 *
 * Replace-in-place, not append: a re-import of the same recording (a repaired
 * read, a better device match) must overwrite what it already stored rather than
 * stack a second copy of the same series. The unique keys on both tables make
 * that structural, and the transaction makes it atomic.
 *
 * The laps written are `deriveSessionLaps`' output — the device's own laps PLUS
 * the splits and best efforts derived from the distance series. That derivation
 * happens once, on write, because the whole point of keeping the series is that
 * the questions it answers become indexed rows.
 */
export async function writeSessionStreams(
  session: Pick<Session, "id" | "userId" | "startedAt" | "archivedAt">,
  streams: SessionStream[],
  laps: SessionLap[],
): Promise<{ streams: number; laps: number }> {
  const archived = session.archivedAt != null;
  const streamRows: Prisma.SessionStreamCreateManyInput[] = streams.map((s) => {
    const sum = streamSummary(s);
    return {
      sessionId: session.id,
      userId: session.userId,
      performedAt: session.startedAt,
      archived,
      kind: s.kind,
      unit: STREAM_UNIT[s.kind],
      provider: s.provider,
      uuid: s.uuid,
      startedAt: new Date(s.startedAt),
      offsets: s.offsets,
      values: s.values,
      valuesB: s.valuesB ?? [],
      sampleCount: sum.sampleCount,
      durationSec: sum.durationSec,
      min: sum.min,
      max: sum.max,
      avg: sum.avg,
    };
  });
  const lapRows: Prisma.SessionLapCreateManyInput[] = laps.map((l) => ({
    sessionId: session.id,
    userId: session.userId,
    performedAt: session.startedAt,
    archived,
    kind: l.kind,
    index: l.index,
    startOffsetSec: l.startOffsetSec,
    durationSec: l.durationSec,
    distanceKm: l.distanceKm,
    avgHr: l.avgHr,
    maxHr: l.maxHr,
    avgWatts: l.avgWatts,
    elevationM: l.elevationM,
    paceSecPerKm: l.paceSecPerKm,
  }));

  await prisma.$transaction([
    prisma.sessionStream.deleteMany({ where: { sessionId: session.id } }),
    prisma.sessionLap.deleteMany({ where: { sessionId: session.id } }),
    ...(streamRows.length ? [prisma.sessionStream.createMany({ data: streamRows })] : []),
    ...(lapRows.length ? [prisma.sessionLap.createMany({ data: lapRows })] : []),
  ]);
  return { streams: streamRows.length, laps: lapRows.length };
}

/** The split interval and record rungs the ingest derives laps at, by activity.
 *  Metre sports split at 100 m and are chased over pool distances; everything
 *  on the road splits at 1 km. Deliberately small and explicit — an invented
 *  rung is the fabricated metric the sport catalog exists to prevent. */
export function lapDerivationFor(activityLabel: string | null | undefined): {
  splitKm: number;
  rungsKm: number[];
} {
  const label = (activityLabel ?? "").toLowerCase();
  if (label.includes("swim")) return { splitKm: 0.1, rungsKm: [0.1, 0.4, 1.5] };
  if (label.includes("row")) return { splitKm: 0.5, rungsKm: [0.5, 2, 5] };
  return { splitKm: 1, rungsKm: [1, 5, 10, 21.0975, 42.195] };
}

/** `deriveSessionLaps` with the activity's own split/rung set applied. */
export function lapsForRecording(
  streams: SessionStream[],
  deviceLaps: SessionLap[],
  activityLabel: string | null | undefined,
): SessionLap[] {
  return deriveSessionLaps(streams, deviceLaps, lapDerivationFor(activityLabel));
}
