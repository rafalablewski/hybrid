import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import { canManageOrg, ORG_ROLES, type OrgRole } from "@hybrid/core";

// Invite an existing user into the org with a role (managers only). v1 adds
// users who already have an account, by email — no pending-invite flow yet.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const me = await prisma.membership.findUnique({ where: { orgId_userId: { orgId: id, userId: user.id } } });
  if (!me || !canManageOrg(me.role as OrgRole))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const b = (await request.json().catch(() => ({}))) as { email?: unknown; role?: unknown; teamId?: unknown };
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  const role = b.role as OrgRole;
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });
  if (!ORG_ROLES.includes(role)) return NextResponse.json({ error: "invalid role" }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { email } });
  if (!target) return NextResponse.json({ error: "no account for that email" }, { status: 404 });

  const existing = await prisma.membership.findUnique({ where: { orgId_userId: { orgId: id, userId: target.id } } });
  if (existing) return NextResponse.json({ error: "already a member" }, { status: 409 });

  const m = await prisma.membership.create({
    data: {
      orgId: id,
      userId: target.id,
      role,
      teamId: typeof b.teamId === "string" && b.teamId ? b.teamId : null,
    },
  });
  return NextResponse.json({ member: { id: m.id, name: target.name ?? target.email, role: m.role, teamId: m.teamId } }, { status: 201 });
}
