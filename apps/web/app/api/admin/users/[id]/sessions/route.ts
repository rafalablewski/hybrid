import { NextResponse } from "next/server";
import { requireAdmin, audit } from "@/lib/admin";
import { prisma } from "@/lib/db";

// Admin maintenance: permanently delete ALL of ONE user's logged training
// sessions (their history), without touching the account itself. Admin-only;
// audited with the owner + how many rows went.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;
  const { id } = await params;

  const target = await prisma.user.findUnique({ where: { id }, select: { email: true } });
  if (!target) return NextResponse.json({ error: "user not found" }, { status: 404 });

  const { count } = await prisma.session.deleteMany({ where: { userId: id } });

  await audit({
    actor: gate.admin,
    action: "userSessions.deleteAll",
    targetType: "user",
    targetId: id,
    summary: `Deleted ${count} training session(s) for ${target.email}`,
    metadata: { ownerId: id, email: target.email, deleted: count },
    req: request,
  });

  return NextResponse.json({ ok: true, deleted: count });
}
