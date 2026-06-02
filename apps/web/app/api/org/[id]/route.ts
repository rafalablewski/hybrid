import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import { canRead, type OrgRole, type TeamNode } from "@hybrid/core";

// Org detail: the team tree + the staff/athlete roster, gated by membership.
// Medical-tier fields are only included when the caller's role may read them.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const me = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId: id, userId: user.id } },
  });
  if (!me) return NextResponse.json({ error: "not a member" }, { status: 403 });
  const myRole = me.role as OrgRole;

  const [org, teamRows, memberRows] = await Promise.all([
    prisma.organization.findUnique({ where: { id } }),
    prisma.team.findMany({ where: { orgId: id }, orderBy: { createdAt: "asc" } }),
    prisma.membership.findMany({ where: { orgId: id }, include: { user: true }, orderBy: { createdAt: "asc" } }),
  ]);
  if (!org) return NextResponse.json({ error: "not found" }, { status: 404 });

  const teams: TeamNode[] = teamRows.map((t) => ({ id: t.id, name: t.name, parentId: t.parentId }));
  const showMedical = canRead(myRole, "medical");

  const members = memberRows.map((m) => ({
    id: m.id,
    userId: m.userId,
    name: m.user.name ?? m.user.email,
    role: m.role as OrgRole,
    teamId: m.teamId,
    // medical-tier fields only surface to roles allowed to read them
    email: showMedical ? m.user.email : undefined,
  }));

  return NextResponse.json({ org: { id: org.id, name: org.name }, myRole, teams, members });
}

// Add a team to the org (managers only).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const me = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId: id, userId: user.id } },
  });
  if (!me) return NextResponse.json({ error: "not a member" }, { status: 403 });
  if (me.role !== "OWNER" && me.role !== "DIRECTOR")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const b = (await request.json().catch(() => ({}))) as { name?: unknown; parentId?: unknown };
  if (typeof b.name !== "string" || !b.name.trim())
    return NextResponse.json({ error: "name required" }, { status: 400 });

  const team = await prisma.team.create({
    data: {
      orgId: id,
      name: b.name.trim(),
      parentId: typeof b.parentId === "string" && b.parentId ? b.parentId : null,
    },
  });
  return NextResponse.json({ team: { id: team.id, name: team.name, parentId: team.parentId } }, { status: 201 });
}
