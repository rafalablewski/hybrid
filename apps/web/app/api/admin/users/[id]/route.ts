import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { evaluateRoleChange, isValidLanguage } from "@hybrid/core";
import { requireAdmin, audit } from "@/lib/admin";
import { rateLimit, readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";

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

  const limited = rateLimit(request, { key: "admin-user-patch", limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const { id } = await params;

  const parsed = await readJsonLimited<{ role?: string; language?: string; name?: string | null }>(request, 8 * 1024);
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });

  const data: { role?: Role; language?: string; name?: string | null } = {};

  if (body.role !== undefined) {
    // The lockout/escalation rule lives in @hybrid/core (pure + unit-tested).
    // Only count admins when we're actually demoting one — avoids the query
    // on every edit.
    const willDemoteAdmin = target.role === "ADMIN" && body.role.toUpperCase() !== "ADMIN";
    const totalAdmins = willDemoteAdmin ? await prisma.user.count({ where: { role: "ADMIN" } }) : Infinity;
    const decision = evaluateRoleChange({
      currentRole: target.role,
      requestedRole: body.role,
      targetIsActor: target.id === gate.admin.id,
      totalAdmins,
    });
    if (!decision.ok) return NextResponse.json({ error: decision.reason }, { status: 400 });
    data.role = decision.nextRole;
  }

  if (body.language !== undefined) {
    if (!isValidLanguage(body.language))
      return NextResponse.json({ error: "invalid language" }, { status: 400 });
    data.language = body.language;
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
