import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// Delete a custom product you own.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const p = await prisma.foodProduct.findUnique({ where: { id } });
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (p.userId !== me.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await prisma.foodProduct.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
