import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import { canManageOrg, canAssignRole, ORG_ROLES, type OrgRole } from "@hybrid/core";

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
  // A DIRECTOR manages staff but must not mint an OWNER (privilege escalation).
  if (!canAssignRole(me.role as OrgRole, role))
    return NextResponse.json({ error: "only an owner can grant the owner role" }, { status: 403 });

  const teamId = typeof b.teamId === "string" && b.teamId ? b.teamId : null;
  const target = await prisma.user.findUnique({ where: { email } });

  // No account yet → record a pending invite, claimed on their first sign-in.
  if (!target) {
    await prisma.orgInvite.upsert({
      where: { orgId_email: { orgId: id, email } },
      update: { role, teamId, status: "pending" },
      create: { orgId: id, email, role, teamId, status: "pending" },
    });
    return NextResponse.json({ pending: true, email }, { status: 201 });
  }

  const existing = await prisma.membership.findUnique({ where: { orgId_userId: { orgId: id, userId: target.id } } });
  if (existing) return NextResponse.json({ error: "already a member" }, { status: 409 });

  const m = await prisma.membership.create({
    data: { orgId: id, userId: target.id, role, teamId },
  });
  return NextResponse.json({ member: { id: m.id, name: target.name ?? target.email, role: m.role, teamId: m.teamId } }, { status: 201 });
}
