import { NextResponse } from "next/server";
import { sanitizeNote, sanitizeMood, sanitizeTags, sanitizeFeelLevel, sanitizeDeviceWorkout, sanitizeSessionBlocks } from "@hybrid/core";
import { Prisma } from "@prisma/client";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// Manage one of the athlete's own logged workouts. Both clients call this.
// Every query is scoped to the authenticated user's id — a user can only
// archive/restore/delete their OWN Session rows.

// PATCH { archived?, title?, blocks?, note?, mood?, tags?, feel?, fatigue?, device? } —
// soft-archive (hide from History, recoverable) / restore, rename the workout,
// CORRECT what was logged (blocks — the "Edit workout" sheet; a skipped distance,
// a fat-fingered time, a mis-typed load, without deleting the workout and the
// PRs, feel report and device match attached to it),
// set the private post-workout reflection (note + mood + tags), record the
// post-workout self-report (feel = perceived effort 1..5, fatigue = how
// spent 1..5 — the Wrapped's "How did that feel?"), and/or attach the device's
// read of the same workout (the summary's Apple Watch match — a frozen
// DeviceWorkout object, null to unlink; see core/session-device.ts). All of
// these back affordances that happen AFTER saving (opt-in), and all are
// owner-only: they stay off every non-owner view.
// Archived rows stay in the DB but drop out of the default History list + engines.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = (await request.json().catch(() => ({}))) as { archived?: unknown; title?: unknown; blocks?: unknown; note?: unknown; mood?: unknown; tags?: unknown; feel?: unknown; fatigue?: unknown; device?: unknown };
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);
  const hasArchived = typeof body.archived === "boolean";
  const hasTitle = typeof body.title === "string" && body.title.trim().length > 0;
  const hasBlocks = has("blocks");
  // note/mood/tags/feel/fatigue are settable AND clearable, so presence of the
  // key (not a truthy value) is what counts — sending note:"" or mood:null
  // clears them.
  const hasNote = has("note");
  const hasMood = has("mood");
  const hasTags = has("tags");
  const hasFeel = has("feel");
  const hasFatigue = has("fatigue");
  const hasDevice = has("device");
  if (!hasArchived && !hasTitle && !hasBlocks && !hasNote && !hasMood && !hasTags && !hasFeel && !hasFatigue && !hasDevice)
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  // A corrected workout. Unlike the create route — which stores what our own
  // logger built — this one OVERWRITES an existing session, so the blocks are
  // validated: a malformed edit must never replace a good workout with junk.
  // Anything that doesn't sanitize is a 400, never a partial write.
  let blocksValue: Prisma.InputJsonValue | undefined;
  if (hasBlocks) {
    const clean = sanitizeSessionBlocks(body.blocks);
    if (!clean) return NextResponse.json({ error: "invalid blocks" }, { status: 400 });
    blocksValue = clean as unknown as Prisma.InputJsonValue;
  }

  // The device match: null unlinks; anything else must sanitize to a real
  // DeviceWorkout (a malformed object is a 400, never a silent clear). The
  // match moment is stamped HERE — same reasoning as feelLoggedAt: the client
  // clock is neither trustworthy nor necessary.
  let deviceValue: Prisma.InputJsonValue | typeof Prisma.DbNull | undefined;
  if (hasDevice) {
    if (body.device === null) deviceValue = Prisma.DbNull;
    else {
      const clean = sanitizeDeviceWorkout(body.device);
      if (!clean) return NextResponse.json({ error: "invalid device workout" }, { status: 400 });
      deviceValue = { ...clean, matchedAt: new Date().toISOString() } as unknown as Prisma.InputJsonValue;
    }
  }

  const existing = await prisma.session.findUnique({ where: { id }, select: { userId: true } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (existing.userId !== me.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const session = await prisma.session.update({
    where: { id },
    data: {
      ...(hasArchived ? { archivedAt: body.archived ? new Date() : null } : {}),
      ...(hasTitle ? { title: (body.title as string).trim().slice(0, 200) } : {}),
      ...(blocksValue !== undefined ? { blocks: blocksValue } : {}),
      ...(hasNote ? { note: sanitizeNote(body.note) } : {}),
      ...(hasMood ? { mood: sanitizeMood(body.mood) } : {}),
      ...(hasTags ? { tags: sanitizeTags(body.tags) } : {}),
      ...(hasFeel ? { feel: sanitizeFeelLevel(body.feel) } : {}),
      ...(hasFatigue ? { fatigue: sanitizeFeelLevel(body.fatigue) } : {}),
      ...(deviceValue !== undefined ? { device: deviceValue } : {}),
      // Stamp WHEN the answer was given — server-side, because the lag between
      // the session ending and this moment is what the recovery model reads,
      // and a client clock is neither trustworthy nor necessary here. Clearing
      // both answers clears the stamp with them; re-answering later re-stamps,
      // which is correct — a report edited the next day IS a next-day report.
      ...(hasFeel || hasFatigue
        ? {
            feelLoggedAt:
              (hasFeel ? sanitizeFeelLevel(body.feel) : undefined) == null && (hasFatigue ? sanitizeFeelLevel(body.fatigue) : undefined) == null && hasFeel && hasFatigue
                ? null
                : new Date(),
          }
        : {}),
    },
  });
  return NextResponse.json({ session });
}

// DELETE — permanently remove one of your own workouts.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const existing = await prisma.session.findUnique({ where: { id }, select: { userId: true } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (existing.userId !== me.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  await prisma.session.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
