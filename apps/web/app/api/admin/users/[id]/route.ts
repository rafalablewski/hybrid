import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { requireAdmin, audit } from "@/lib/admin";
import { prisma } from "@/lib/db";

const ROLES: Role[] = ["CLIENT", "COACH", "ADMIN"];

// One user's management record. Counts + memberships + recent-activity summary —
// NOT the raw private training content. Admin-only.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      language: true,
      createdAt: true,
      authId: true,
      memberships: { select: { role: true, org: { select: { id: true, name: true } } } },
      _count: {
        select: {
          sessions: true,
          checkins: true,
          macrocycles: true,
          clientLinks: true,
          coachLinks: true,
          videos: true,
          rtpProtocols: true,
          connections: true,
        },
      },
    },
  });
  if (!user) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [lastSession] = await prisma.session.findMany({
    where: { userId: id },
    orderBy: { startedAt: "desc" },
    take: 1,
    select: { startedAt: true, title: true },
  });

  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    language: user.language,
    createdAt: user.createdAt,
    linkedAuth: Boolean(user.authId),
    orgs: user.memberships.map((m) => ({ id: m.org.id, name: m.org.name, role: m.role })),
    counts: {
      sessions: user._count.sessions,
      checkins: user._count.checkins,
      macrocycles: user._count.macrocycles,
      clientsCoached: user._count.clientLinks,
      coaches: user._count.coachLinks,
      videos: user._count.videos,
      rtpProtocols: user._count.rtpProtocols,
      connections: user._count.connections,
    },
    lastActiveAt: lastSession?.startedAt ?? null,
  });
}

// Update a user's role / language / name. Every change is audited.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;
  const { id } = await params;

  const body = (await request.json().catch(() => ({}))) as {
    role?: string;
    language?: string;
    name?: string | null;
  };

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });

  const data: { role?: Role; language?: string; name?: string | null } = {};

  if (body.role !== undefined) {
    const next = body.role.toUpperCase() as Role;
    if (!ROLES.includes(next)) return NextResponse.json({ error: "invalid role" }, { status: 400 });
    // Safety rails: don't let an admin demote themselves, and never remove the
    // last remaining ADMIN (avoids locking the whole org out of the panel).
    if (next !== "ADMIN" && target.role === "ADMIN") {
      if (target.id === gate.admin.id)
        return NextResponse.json({ error: "you cannot remove your own admin role" }, { status: 400 });
      const admins = await prisma.user.count({ where: { role: "ADMIN" } });
      if (admins <= 1)
        return NextResponse.json({ error: "cannot demote the last remaining admin" }, { status: 400 });
    }
    data.role = next;
  }

  if (body.language !== undefined) {
    const lang = String(body.language).toLowerCase();
    if (!["en", "pl", "de"].includes(lang))
      return NextResponse.json({ error: "invalid language" }, { status: 400 });
    data.language = lang;
  }

  if (body.name !== undefined) data.name = body.name ? String(body.name).slice(0, 120) : null;

  if (Object.keys(data).length === 0)
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  const updated = await prisma.user.update({ where: { id }, data });

  await audit({
    actor: gate.admin,
    action: "user.update",
    targetType: "user",
    targetId: id,
    summary: `Updated ${target.email}`,
    metadata: {
      before: { role: target.role, language: target.language, name: target.name },
      after: { role: updated.role, language: updated.language, name: updated.name },
    },
    req: request,
  });

  return NextResponse.json({
    id: updated.id,
    email: updated.email,
    name: updated.name,
    role: updated.role,
    language: updated.language,
  });
}
