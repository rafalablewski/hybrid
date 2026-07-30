import { NextResponse } from "next/server";
import {
  deviceWorkoutBlocks,
  deviceWorkoutTitle,
  exerciseNameAliasMap,
  migrateBlocks,
  planDeviceImport,
  sanitizeDeviceWorkout,
  type DeviceWorkout,
  type LoggedSession,
} from "@hybrid/core";
import { Prisma } from "@prisma/client";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { readJsonLimited, rateLimit } from "@/lib/guard";
import { getCachedPublishedExercises } from "@/lib/cache";
import { prisma } from "@/lib/db";

/**
 * DEVICE IMPORT — the workouts the athlete's watch already recorded, written
 * into the log in one call.
 *
 * POST { workouts: DeviceWorkout[] } → { created, attached, linked, skipped }
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
  if (workouts.length === 0) return NextResponse.json({ created: 0, attached: 0, linked: 0, skipped });

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
      if (res.count > 0) attached += 1;
      else linked += 1;
      continue;
    }
    await prisma.session.create({
      data: {
        userId: user.id,
        title: deviceWorkoutTitle(item.workout).slice(0, 200),
        // The session lands where the TRAINING happened, not when the sync ran.
        startedAt: new Date(item.workout.start),
        completedAt: new Date(item.workout.end),
        blocks: deviceWorkoutBlocks(item.workout) as unknown as object,
        device,
      },
    });
    created += 1;
  }

  return NextResponse.json({ created, attached, linked, skipped });
}
