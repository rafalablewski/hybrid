import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import { canManageOrg, type OrgRole } from "@hybrid/core";

// Revoke a pending invitation (managers only).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; iid: string }> }) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id, iid } = await params;
  const me = await prisma.membership.findUnique({ where: { orgId_userId: { orgId: id, userId: user.id } } });
  if (!me || !canManageOrg(me.role as OrgRole)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const inv = await prisma.orgInvite.findFirst({ where: { id: iid, orgId: id } });
  if (!inv) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.orgInvite.update({ where: { id: iid }, data: { status: "revoked" } });
  return NextResponse.json({ ok: true });
}
