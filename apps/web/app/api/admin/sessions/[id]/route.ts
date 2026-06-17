import { NextResponse } from "next/server";
import { requireAdmin, audit } from "@/lib/admin";
import { prisma } from "@/lib/db";

// Admin moderation: permanently delete ANY user's logged workout (e.g. abusive
// content / cleanup). Admin-only; audited with the owner it belonged to.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;
  const { id } = await params;

  const existing = await prisma.session.findUnique({ where: { id }, select: { userId: true, title: true } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.session.delete({ where: { id } });
  await audit({
    actor: gate.admin,
    action: "session.delete",
    targetType: "session",
    targetId: id,
    summary: `Deleted "${existing.title}"`,
    metadata: { ownerId: existing.userId },
    req: request,
  });
  return NextResponse.json({ ok: true });
}
