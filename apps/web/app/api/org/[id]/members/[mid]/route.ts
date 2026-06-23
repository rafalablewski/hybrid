import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import { canManageOrg, ORG_ROLES, type OrgRole } from "@hybrid/core";

async function manager(orgId: string, userId: string) {
  const me = await prisma.membership.findUnique({ where: { orgId_userId: { orgId, userId } } });
  return me && canManageOrg(me.role as OrgRole) ? me : null;
}

// Update a member's role and/or team assignment (managers only).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; mid: string }> }) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id, mid } = await params;
  const me = await manager(id, user.id);
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const target = await prisma.membership.findFirst({ where: { id: mid, orgId: id } });
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });

  // only an OWNER may modify another OWNER (no DIRECTOR demoting owners)
  if (target.role === "OWNER" && me.role !== "OWNER")
    return NextResponse.json({ error: "only owners can modify an owner" }, { status: 403 });

  const b = (await request.json().catch(() => ({}))) as { role?: unknown; teamId?: unknown };
  const data: { role?: string; teamId?: string | null } = {};
  if (typeof b.role === "string") {
    if (!ORG_ROLES.includes(b.role as OrgRole)) return NextResponse.json({ error: "invalid role" }, { status: 400 });
    // Only an OWNER may GRANT the OWNER role — otherwise a DIRECTOR (who also
    // passes canManageOrg) could promote themselves or anyone to OWNER and seize
    // the org. Demoting an existing owner is already guarded above + below.
    if (b.role === "OWNER" && me.role !== "OWNER")
      return NextResponse.json({ error: "only owners can grant the owner role" }, { status: 403 });
    data.role = b.role;
  }
  if (b.teamId !== undefined) data.teamId = typeof b.teamId === "string" && b.teamId ? b.teamId : null;

  // don't let the last OWNER be demoted out of existence
  if (data.role && target.role === "OWNER" && data.role !== "OWNER") {
    const owners = await prisma.membership.count({ where: { orgId: id, role: "OWNER" } });
    if (owners <= 1) return NextResponse.json({ error: "org must keep an owner" }, { status: 409 });
  }

  const m = await prisma.membership.update({ where: { id: mid }, data });
  return NextResponse.json({ member: { id: m.id, role: m.role, teamId: m.teamId } });
}

// Remove a member (managers only; can't remove the last owner).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; mid: string }> }) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id, mid } = await params;
  const me = await manager(id, user.id);
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const target = await prisma.membership.findFirst({ where: { id: mid, orgId: id } });
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (target.role === "OWNER") {
    // only an OWNER may remove another OWNER, and never the last one
    if (me.role !== "OWNER") return NextResponse.json({ error: "only owners can remove an owner" }, { status: 403 });
    const owners = await prisma.membership.count({ where: { orgId: id, role: "OWNER" } });
    if (owners <= 1) return NextResponse.json({ error: "org must keep an owner" }, { status: 409 });
  }

  await prisma.membership.delete({ where: { id: mid } });
  return NextResponse.json({ ok: true });
}
