import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// Delete a template you own.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const t = await prisma.workoutTemplate.findUnique({ where: { id } });
  if (!t) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (t.ownerId !== me.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await prisma.workoutTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
