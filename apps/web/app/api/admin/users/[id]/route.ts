import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { evaluateRoleChange, isValidLanguage, normalizeRole, NAV_ITEMS } from "@hybrid/core";
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

  // Support-access accountability: an admin inspecting an individual's record
  // is logged (not a silent lookup), matching the stated privacy posture.
  await audit({
    actor: gate.admin,
    action: "user.view",
    targetType: "user",
    targetId: id,
    summary: `Viewed ${user.email}`,
    req: request,
  });

  // Per-user feature grants live in their own (soft-guarded) table.
  let featureGrants: string[] = [];
  try {
    featureGrants = (await prisma.featureGrant.findUnique({ where: { userId: id }, select: { navIds: true } }))?.navIds ?? [];
  } catch {
    /* FeatureGrant table not migrated yet */
  }

  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    language: user.language,
    featureGrants,
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

  const parsed = await readJsonLimited<{ role?: string; language?: string; name?: string | null; featureGrants?: unknown }>(request, 8 * 1024);
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });

  const data: { role?: Role; language?: string; name?: string | null } = {};

  // Per-user feature grants — validated here, persisted to the (soft-guarded)
  // FeatureGrant table below, separately from the User row.
  let grants: string[] | undefined;
  if (body.featureGrants !== undefined) {
    if (!Array.isArray(body.featureGrants))
      return NextResponse.json({ error: "featureGrants must be an array" }, { status: 400 });
    const navIds = new Set(NAV_ITEMS.map((i) => i.id));
    // Only known nav ids survive (an admin can't grant a feature nothing reads).
    grants = [...new Set(body.featureGrants.filter((g): g is string => typeof g === "string" && navIds.has(g)))].slice(0, 40);
  }

  if (body.role !== undefined) {
    // The lockout/escalation rule lives in @hybrid/core (pure + unit-tested).
    // Only count admins when we're actually demoting one — avoids the query
    // on every edit.
    const nextRole = normalizeRole(body.role);
    const willDemoteAdmin = target.role === "ADMIN" && nextRole !== "ADMIN";
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

  if (Object.keys(data).length === 0 && grants === undefined)
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  const updated = Object.keys(data).length > 0 ? await prisma.user.update({ where: { id }, data }) : target;

  let beforeGrants: string[] | undefined;
  if (grants !== undefined) {
    try {
      beforeGrants = (await prisma.featureGrant.findUnique({ where: { userId: id }, select: { navIds: true } }))?.navIds ?? [];
      await prisma.featureGrant.upsert({
        where: { userId: id },
        create: { userId: id, navIds: grants },
        update: { navIds: grants },
      });
    } catch {
      return NextResponse.json({ error: "Feature grants aren't enabled yet — run reference/sql-user-feature-grants.sql." }, { status: 503 });
    }
  }

  await audit({
    actor: gate.admin,
    action: "user.update",
    targetType: "user",
    targetId: id,
    summary: `Updated ${target.email}`,
    metadata: {
      before: { role: target.role, language: target.language, name: target.name, ...(grants !== undefined ? { featureGrants: beforeGrants } : {}) },
      after: { role: updated.role, language: updated.language, name: updated.name, ...(grants !== undefined ? { featureGrants: grants } : {}) },
    },
    req: request,
  });

  return NextResponse.json({
    id: updated.id,
    email: updated.email,
    name: updated.name,
    role: updated.role,
    language: updated.language,
    ...(grants !== undefined ? { featureGrants: grants } : {}),
  });
}
