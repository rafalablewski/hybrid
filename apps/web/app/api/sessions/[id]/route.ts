import { NextResponse } from "next/server";
import { sanitizeNote, sanitizeMood, sanitizeTags } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// Manage one of the athlete's own logged workouts. Both clients call this.
// Every query is scoped to the authenticated user's id — a user can only
// archive/restore/delete their OWN Session rows.

// PATCH { archived?, title?, note?, mood?, tags? } — soft-archive (hide from
// History, recoverable) / restore, rename the workout, and/or set the private
// post-workout reflection (note + mood + tags). Both the rename and the note
// back finish-screen affordances that happen AFTER saving (opt-in). note/mood/
// tags are owner-only and stay off every non-owner view.
// Archived rows stay in the DB but drop out of the default History list + engines.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = (await request.json().catch(() => ({}))) as { archived?: unknown; title?: unknown; note?: unknown; mood?: unknown; tags?: unknown };
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);
  const hasArchived = typeof body.archived === "boolean";
  const hasTitle = typeof body.title === "string" && body.title.trim().length > 0;
  // note/mood/tags are settable AND clearable, so presence of the key (not a
  // truthy value) is what counts — sending note:"" or mood:null clears them.
  const hasNote = has("note");
  const hasMood = has("mood");
  const hasTags = has("tags");
  if (!hasArchived && !hasTitle && !hasNote && !hasMood && !hasTags)
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  const existing = await prisma.session.findUnique({ where: { id }, select: { userId: true } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (existing.userId !== me.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const session = await prisma.session.update({
    where: { id },
    data: {
      ...(hasArchived ? { archivedAt: body.archived ? new Date() : null } : {}),
      ...(hasTitle ? { title: (body.title as string).trim().slice(0, 200) } : {}),
      ...(hasNote ? { note: sanitizeNote(body.note) } : {}),
      ...(hasMood ? { mood: sanitizeMood(body.mood) } : {}),
      ...(hasTags ? { tags: sanitizeTags(body.tags) } : {}),
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
