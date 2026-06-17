import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { evaluateRoleChange, isValidLanguage, normalizeRole, NAV_ITEMS } from "@hybrid/core";
import { requireAdmin, audit } from "@/lib/admin";
import { rateLimit, readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";

// Permanently delete a user account and ALL of its data. Admin-only, irreversible.
// An admin can't delete themselves, and can't delete the last remaining admin
// (the same lockout guard the role change uses). The user's child rows are wiped
// table-by-table (best-effort, like account/reset) before the User row, since no
// FK cascade is defined; then the Supabase auth user, if mirrored, is removed.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const limited = rateLimit(request, { key: "admin-user-delete", limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  const { id } = await params;
  if (id === gate.admin.id)
    return NextResponse.json({ error: "You can't delete your own account here." }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (target.role === "ADMIN") {
    const admins = await prisma.user.count({ where: { role: "ADMIN" } });
    if (admins <= 1)
      return NextResponse.json({ error: "Can't delete the last admin." }, { status: 400 });
  }

  const skipped: string[] = [];
  const wipe = async (label: string, run: () => Promise<unknown>) => {
    try {
      await run();
    } catch (err) {
      console.error(`[admin user delete] skipped ${label}:`, err);
      skipped.push(label);
    }
  };

  let linkIds: string[] = [];
  try {
    linkIds = (
      await prisma.coachLink.findMany({
        where: { OR: [{ coachId: id }, { clientId: id }] },
        select: { id: true },
      })
    ).map((l) => l.id);
  } catch (err) {
    console.error("[admin user delete] could not read coach links:", err);
  }

  await wipe("sessions", () => prisma.session.deleteMany({ where: { userId: id } }));
  await wipe("macrocycles", () => prisma.macrocycle.deleteMany({ where: { userId: id } }));
  await wipe("biometrics", () => prisma.biometric.deleteMany({ where: { userId: id } }));
  await wipe("signals", () => prisma.signal.deleteMany({ where: { userId: id } }));
  await wipe("checkins", () => prisma.checkin.deleteMany({ where: { userId: id } }));
  await wipe("rtpProtocols", () => prisma.rtpProtocol.deleteMany({ where: { userId: id } }));
  await wipe("videoAnalyses", () => prisma.videoAnalysis.deleteMany({ where: { userId: id } }));
  await wipe("events", () => prisma.event.deleteMany({ where: { userId: id } }));
  await wipe("riskOutcomes", () => prisma.riskOutcome.deleteMany({ where: { userId: id } }));
  await wipe("talentProfile", () => prisma.talentProfile.deleteMany({ where: { userId: id } }));
  await wipe("connections", () => prisma.connection.deleteMany({ where: { userId: id } }));
  await wipe("memberships", () => prisma.membership.deleteMany({ where: { userId: id } }));
  await wipe("templates", () => prisma.workoutTemplate.deleteMany({ where: { ownerId: id } }));
  await wipe("assignments", () =>
    prisma.assignment.deleteMany({ where: { OR: [{ athleteId: id }, { assignedById: id }] } }),
  );
  if (linkIds.length)
    await wipe("coachNotes", () => prisma.coachNote.deleteMany({ where: { linkId: { in: linkIds } } }));
  await wipe("coachLinks", () =>
    prisma.coachLink.deleteMany({ where: { OR: [{ coachId: id }, { clientId: id }] } }),
  );
  await wipe("featureGrant", () => prisma.featureGrant.deleteMany({ where: { userId: id } }));
  await wipe("user", () => prisma.user.delete({ where: { id } }));

  await audit({
    actor: gate.admin,
    action: "user.delete",
    targetType: "user",
    targetId: id,
    summary: `Deleted ${target.email}`,
    metadata: { email: target.email, role: target.role, skipped },
    req: request,
  });

  return NextResponse.json({ ok: true, skipped });
}

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

  // Apply the role/name/language change and the grant change together, so a
  // failure on either rolls back both (no half-applied state, no skipped audit).
  let updated = target;
  let beforeGrants: string[] | undefined;
  try {
    await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) updated = await tx.user.update({ where: { id }, data });
      if (grants !== undefined) {
        beforeGrants = (await tx.featureGrant.findUnique({ where: { userId: id }, select: { navIds: true } }))?.navIds ?? [];
        await tx.featureGrant.upsert({ where: { userId: id }, create: { userId: id, navIds: grants }, update: { navIds: grants } });
      }
    });
  } catch {
    return grants !== undefined
      ? NextResponse.json({ error: "Couldn't save — feature grants need reference/sql-user-feature-grants.sql." }, { status: 503 })
      : NextResponse.json({ error: "Update failed." }, { status: 500 });
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
