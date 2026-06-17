import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// Delete one of the caller's OWN custom exercises. Scoped to the author —
// a user can only ever remove a source:"user" row they created.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const existing = await prisma.exercise.findUnique({ where: { id }, select: { authorId: true, source: true } });
  if (!existing || existing.source !== "user" || existing.authorId !== user.id)
    return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.exercise.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
