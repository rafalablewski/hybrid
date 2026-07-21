import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// Delete a saved meal you own.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const m = await prisma.savedMeal.findUnique({ where: { id } });
  if (!m) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (m.userId !== me.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await prisma.savedMeal.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
