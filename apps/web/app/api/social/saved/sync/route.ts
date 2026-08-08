import { NextResponse } from "next/server";
import { FEED_SAVED_LIMIT, feedSubjectKey, parseFeedSubjectKey } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import { tableMissing } from "@/lib/social";

/**
 * THE SHELF, ON THE SERVER — SavedPost (reference/sql-saved-post.sql).
 *
 * The sibling route (../route.ts) turns saved KEYS into cards. This one is the
 * keys themselves, so the shelf follows the athlete between phone and laptop.
 *
 *   GET — my saved keys, newest save first.
 *   PUT — apply a device's changes: `{ save: [...], unsave: [...] }`, and get
 *         the resulting list back so the caller never has to guess.
 *
 * WHY OPS AND NOT "HERE IS MY WHOLE LIST". A device that pushes its full list
 * cannot express a removal: the server sees a key missing and has no way to
 * tell "the athlete unsaved this" from "this device hasn't heard about it yet".
 * Whole-list writes therefore resurrect unsaved posts from any stale device.
 * The reconcile policy lives in core (`reconcileFeedSaved`) — the union runs
 * exactly once per device, and this route only ever does what it is told.
 *
 * BEFORE THE TABLE EXISTS both verbs soft-degrade to `unavailable` rather than
 * erroring (P2021/P2010, the pattern the whole social API uses), so the app
 * keeps working on device-only storage until the SQL is run. The clients treat
 * that as "no server shelf yet" and leave the device list untouched.
 *
 * ORDER IS THE DEVICE'S. A first sync pushes the device's list in its own
 * order, and `savedAt` is stamped backwards from now (one ms apart) so that
 * order survives the round trip instead of collapsing into one timestamp.
 */

const listFor = async (userId: string): Promise<string[]> => {
  const rows = await prisma.savedPost.findMany({
    where: { userId },
    orderBy: { savedAt: "desc" },
    take: FEED_SAVED_LIMIT,
    select: { subjectType: true, subjectId: true },
  });
  return rows.map(feedSubjectKey);
};

export async function GET(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ ids: await listFor(me.id) });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ ids: [], unavailable: true });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  // The trust boundary, same as the resolve route: these keys come out of
  // device storage. Anything that isn't a well-formed key for a real feed
  // subject is dropped before it reaches a write.
  const clean = (v: unknown) =>
    (Array.isArray(v) ? v : []).map(parseFeedSubjectKey).filter((r): r is NonNullable<typeof r> => !!r).slice(0, FEED_SAVED_LIMIT);
  const save = clean((body as { save?: unknown })?.save);
  const unsave = clean((body as { unsave?: unknown })?.unsave);

  try {
    if (unsave.length) {
      await prisma.savedPost.deleteMany({
        where: { userId: me.id, OR: unsave.map((r) => ({ subjectType: r.subjectType, subjectId: r.subjectId })) },
      });
    }
    if (save.length) {
      // Stamped backwards from now, one ms apart, so the device's own order
      // survives — otherwise a first sync collapses the whole shelf onto one
      // timestamp and the newest-first read comes back arbitrary.
      const now = Date.now();
      await prisma.savedPost.createMany({
        data: save.map((r, i) => ({ userId: me.id, subjectType: r.subjectType, subjectId: r.subjectId, savedAt: new Date(now - i) })),
        // Saving twice is saving once (the (userId, type, id) unique) — a retried
        // or overlapping sync must be a no-op, not a duplicate-key error.
        skipDuplicates: true,
      });
    }
    return NextResponse.json({ ids: await listFor(me.id) });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ ids: [], unavailable: true });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
