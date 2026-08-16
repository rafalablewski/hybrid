import { NextResponse } from "next/server";
import {
  deviceWorkoutBlocks,
  deviceWorkoutTitle,
  exerciseNameAliasMap,
  migrateBlocks,
  planDeviceImport,
  sanitizeDeviceWorkout,
  sanitizeSessionBlocks,
  type DeviceWorkout,
  type LoggedSession,
} from "@hybrid/core";
import { Prisma } from "@prisma/client";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { readJsonLimited, rateLimit } from "@/lib/guard";
import { getCachedPublishedExercises } from "@/lib/cache";
import { athleteBodyweight, projectSessionSafely } from "@/lib/session-projection";
import { prisma } from "@/lib/db";

/**
 * DEVICE IMPORT — the workouts the athlete's watch already recorded, written
 * into the log in one call.
 *
 * POST { workouts: DeviceWorkout[] } → { created, attached, linked, skipped, landed }
 *
 * The client (only the phone can read a health store) hands over what it read;
 * the SERVER decides what each recording means, by running the same shared plan
 * both clients render — core/device-import.ts. That placement is the whole
 * safety story: an auto-sync fires unattended, retries on a flaky network and
 * can race a second device, so "don't create the same session twice" has to be
 * decided against the database, not against whatever list a client last saw.
 *
 * Recordings already carried by a session are no-ops (matched on the store's own
 * uuid), a recording that IS a session the athlete logged by hand gets attached
 * to that row instead of duplicating it, and only what's genuinely new becomes a
 * session — with the recording attached, so THE MEASUREMENT WINS downstream
 * exactly as it does for a hand-matched session (see core/session-device.ts).
 *
 * `landed` NAMES THE ROWS, and that is not bookkeeping. A watch measures every
 * figure of a session except the one the load model needs from a person — how
 * hard it felt — so an import that returns only counts leaves the client with
 * nothing to ask about, and the athlete has to go find the session and open its
 * summary to rate it. Nobody does that. Returning the rows lets the import end
 * in the question (see the mobile sheet's rate phase).
 */
export async function POST(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // An auto-sync can fire on every foreground, so this is throttled harder than
  // the hand-driven logging path. 256 KB fits a fortnight of recordings many
  // times over.
  const limited = await rateLimit(request, { key: "device-import", limit: 20, windowMs: 60_000 });
  if (limited) return limited;
  const parsed = await readJsonLimited<{ workouts?: unknown }>(request, 256 * 1024);
  if (parsed.error) return parsed.error;

  const raw = Array.isArray(parsed.data?.workouts) ? parsed.data.workouts : null;
  if (!raw) return NextResponse.json({ error: "workouts array is required" }, { status: 400 });

  // Sanitize FIRST — a malformed entry is dropped, never a 400 for the batch: a
  // single odd recording must not block the fortnight around it from importing.
  const seen = new Set<string>();
  const workouts: DeviceWorkout[] = [];
  for (const input of raw.slice(0, 200)) {
    const clean = sanitizeDeviceWorkout(input);
    if (!clean || seen.has(clean.uuid)) continue;
    seen.add(clean.uuid);
    workouts.push(clean);
  }
  const skipped = raw.length - workouts.length;
  if (workouts.length === 0) return NextResponse.json({ created: 0, attached: 0, linked: 0, skipped, landed: [] });

  // Plan against the window the recordings actually span, widened by a day at
  // each end so a session logged either side of midnight is still a candidate.
  const stamps = workouts.map((w) => Date.parse(w.start));
  const from = new Date(Math.min(...stamps) - 86_400_000);
  const to = new Date(Math.max(...stamps) + 86_400_000);
  const rows = await prisma.session.findMany({
    where: { userId: user.id, archivedAt: null, startedAt: { gte: from, lte: to } },
    orderBy: { startedAt: "desc" },
    take: 400,
  });
  const aliasMap = exerciseNameAliasMap(await getCachedPublishedExercises());
  const existing = rows.map(
    (s) =>
      ({
        ...s,
        startedAt: s.startedAt.toISOString(),
        completedAt: s.completedAt?.toISOString() ?? null,
        blocks: migrateBlocks(s.blocks, aliasMap),
      }) as unknown as LoggedSession,
  );

  const plan = planDeviceImport(workouts, existing);
  const stamp = () => new Date().toISOString();
  let created = 0;
  let attached = 0;
  let linked = 0;
  /** The rows this call actually put in (or joined), for the client's ask. */
  const landed: {
    id: string;
    title: string;
    startedAt: string;
    completedAt: string;
    /** The DEVICE's moving time — the trusted duration, so the load figure the
     *  rating produces is built from what was measured, not a wall-clock span. */
    minutes: number;
    /** Already rated rows are handed back too, marked, so the client asks about
     *  the right ones rather than re-asking a question already answered on an
     *  attach. */
    rated: boolean;
    /** The store's own id for the recording behind this row. Named so the
     *  client can go back and read what the SUMMARY threw away — the
     *  heart-rate trace, the route, the laps — and upload it against this
     *  session. Only the phone can read a health store, and only while the
     *  recording is still in it, so an import that returns no uuid is an
     *  import whose streams are lost. */
    uuid: string;
  }[] = [];
  /** Sessions this call created or attached a recording to — every one of them
   *  needs its fact rows rebuilt, because attaching a recording CHANGES THE
   *  FIGURES: the measurement outranks what was typed, and a projection made
   *  before the attach would record the typed duration and distance forever. */
  const touched: string[] = [];

  for (const item of plan) {
    const device = { ...item.workout, matchedAt: stamp() } as unknown as Prisma.InputJsonValue;
    if (item.action === "linked") {
      linked += 1;
      continue;
    }
    if (item.action === "attach") {
      // Guarded on `device: null` so a concurrent sync that already claimed this
      // row loses the write instead of overwriting a different recording.
      const res = await prisma.session.updateMany({
        where: { id: item.sessionId, userId: user.id, device: { equals: Prisma.DbNull } },
        data: { device },
      });
      if (res.count === 0) {
        linked += 1;
        continue;
      }
      attached += 1;
      if (item.sessionId) touched.push(item.sessionId);
      // `sessionId` is optional on the plan item — an attach always carries one,
      // and the row it names came out of the query the plan was built against,
      // so this find is what proves it rather than a non-null assertion.
      const joined = rows.find((r) => r.id === item.sessionId);
      if (joined)
        landed.push({
          id: joined.id,
          title: item.sessionTitle ?? deviceWorkoutTitle(item.workout),
          startedAt: joined.startedAt.toISOString(),
          completedAt: new Date(item.workout.end).toISOString(),
          minutes: item.workout.durationMin,
          rated: typeof joined.feel === "number",
          uuid: item.workout.uuid,
        });
      continue;
    }
    const row = await prisma.session.create({
      data: {
        userId: user.id,
        title: deviceWorkoutTitle(item.workout).slice(0, 200),
        // The session lands where the TRAINING happened, not when the sync ran.
        startedAt: new Date(item.workout.start),
        completedAt: new Date(item.workout.end),
        // Through the same sanitiser as every other write. A recording is
        // already bounded on its way in (sanitizeDeviceWorkout), but its caps
        // are single-field and sport-blind — a 300 km "swim" clears them — and
        // "one definition of a storable workout" has to mean every path, or it
        // means the paths somebody remembered.
        blocks: (sanitizeSessionBlocks(deviceWorkoutBlocks(item.workout)) ??
          []) as unknown as object,
        device,
      },
    });
    created += 1;
    touched.push(row.id);
    landed.push({
      id: row.id,
      title: row.title,
      startedAt: row.startedAt.toISOString(),
      completedAt: new Date(item.workout.end).toISOString(),
      minutes: item.workout.durationMin,
      // A row this call created cannot carry an answer — nobody has been asked.
      rated: false,
      uuid: item.workout.uuid,
    });
  }

  // Rebuild the fact rows for everything this import touched — re-read first,
  // so each projection runs against the row as it now stands (with its
  // recording attached) rather than the shape it had when the plan was built.
  // ONE bodyweight lookup for the whole batch: a fortnight of recordings is one
  // athlete, and resolving their weight history 40 times would be 40 queries
  // for one answer.
  if (touched.length) {
    const bw = await athleteBodyweight(user.id);
    const fresh = await prisma.session.findMany({ where: { id: { in: touched }, userId: user.id } });
    for (const s of fresh) await projectSessionSafely(s, bw);
  }

  return NextResponse.json({ created, attached, linked, skipped, landed });
}
