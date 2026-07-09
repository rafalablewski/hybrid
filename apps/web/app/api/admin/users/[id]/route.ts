import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { evaluateRoleChange, isValidLanguage, normalizeRole } from "@hybrid/core";
import { requireAdmin, audit } from "@/lib/admin";
import { rateLimit, readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { setEntitlement } from "@/lib/billing";
import { createAdminClient } from "@/lib/supabase/admin";

// Permanently delete a user account and ALL of its data. Admin-only, irreversible.
// An admin can't delete themselves, and can't delete the last remaining admin
// (the same lockout guard the role change uses). The user's child rows are wiped
// table-by-table (best-effort, like account/reset) before the User row, since no
// FK cascade is defined; then the Supabase auth user, if mirrored, is removed.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const limited = await rateLimit(request, { key: "admin-user-delete", limit: 10, windowMs: 60_000 });
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
  // Coach-authored artefacts + nutrition the user owns or is the subject of.
  await wipe("coachGroups", () => prisma.coachGroup.deleteMany({ where: { coachId: id } }));
  await wipe("coachPrograms", () => prisma.coachProgram.deleteMany({ where: { coachId: id } }));
  await wipe("coachInvites", () =>
    prisma.coachInvite.deleteMany({ where: { OR: [{ coachId: id }, { claimedById: id }] } }),
  );
  await wipe("coachDiets", () =>
    prisma.coachDiet.deleteMany({ where: { OR: [{ coachId: id }, { clientId: id }] } }),
  );
  // Pending applications tied to the account.
  await wipe("coachApplication", () => prisma.coachApplication.deleteMany({ where: { userId: id } }));
  // Email footprint — enrollments + the deliverability ledger. The EmailSuppression
  // (opt-out) row is DELIBERATELY KEPT: a recorded unsubscribe/bounce must be
  // honoured permanently (CAN-SPAM / GDPR), so a re-import or re-signup of the
  // same address can never re-email someone who opted out. It holds only the
  // email + reason, none of the person's training/account data.
  if (target.email) {
    await wipe("emailEnrollments", () => prisma.emailEnrollment.deleteMany({ where: { userId: id } }));
    await wipe("emailMessages", () =>
      prisma.emailMessage.deleteMany({ where: { OR: [{ userId: id }, { email: target.email.toLowerCase() }] } }),
    );
  }

  // The User row is the PRIMARY action — never swallow its failure (that would
  // return a false success while the account still exists). Their AdminAudit
  // actor rows are set to null by the relation (onDelete: SetNull; actorEmail
  // keeps the trail readable), so an admin who performed audited actions can
  // still be deleted.
  try {
    await prisma.user.delete({ where: { id } });
  } catch (err) {
    console.error("[admin user delete] failed to delete user:", err);
    return NextResponse.json(
      {
        error:
          "Couldn't delete the account — its data was cleared but the user row failed (if this user has audit history, apply reference/sql-adminaudit-actor-nullable.sql).",
        skipped,
      },
      { status: 500 },
    );
  }

  // Finally, remove the Supabase auth user so the login can't be reused and no
  // orphaned auth identity lingers. Best-effort (degrades to a no-op without the
  // service-role key); the DB wipe is the authoritative part.
  let authDeleted: "deleted" | "skipped" | "failed" = "skipped";
  if (target.authId) {
    const admin = createAdminClient();
    if (admin) {
      try {
        const { error } = await admin.auth.admin.deleteUser(target.authId);
        authDeleted = error ? "failed" : "deleted";
        if (error) console.error("[admin user delete] auth user delete failed:", error);
      } catch (err) {
        authDeleted = "failed";
        console.error("[admin user delete] auth user delete threw:", err);
      }
    }
  }

  await audit({
    actor: gate.admin,
    action: "user.delete",
    targetType: "user",
    targetId: id,
    summary: `Deleted ${target.email}`,
    metadata: { email: target.email, role: target.role, skipped, authDeleted },
    req: request,
  });

  return NextResponse.json({ ok: true, skipped, authDeleted });
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
      entitlement: true,
      coachVerified: true,
      subscriptionStatus: true,
      stripeCustomerId: true,
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

  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    language: user.language,
    entitlement: user.entitlement,
    coachVerified: user.coachVerified,
    subscriptionStatus: user.subscriptionStatus,
    hasStripe: Boolean(user.stripeCustomerId),
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

  const limited = await rateLimit(request, { key: "admin-user-patch", limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const { id } = await params;

  const parsed = await readJsonLimited<{
    role?: string;
    language?: string;
    name?: string | null;
    entitlement?: string;
    coachVerified?: boolean;
  }>(request, 8 * 1024);
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });

  const data: { role?: Role; language?: string; name?: string | null; coachVerified?: boolean } = {};

  // Plan (entitlement) — free | paid. Applied via setEntitlement AFTER the main
  // transaction so it also mirrors into the Supabase auth metadata (both clients
  // read the plan from their session). Handled separately from `data`.
  let nextEntitlement: "free" | "paid" | undefined;
  if (body.entitlement !== undefined) {
    const e = String(body.entitlement).toLowerCase();
    if (e !== "free" && e !== "paid")
      return NextResponse.json({ error: "entitlement must be 'free' or 'paid'" }, { status: 400 });
    nextEntitlement = e;
  }

  // Verified-coach tick. Only meaningful for coaches, but we let an admin set it
  // independently (e.g. pre-verify before promotion); the UI surfaces it on COACHes.
  if (body.coachVerified !== undefined) data.coachVerified = Boolean(body.coachVerified);

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

  if (Object.keys(data).length === 0 && nextEntitlement === undefined)
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  let updated = target;
  if (Object.keys(data).length > 0) {
    try {
      updated = await prisma.user.update({ where: { id }, data });
    } catch {
      return NextResponse.json({ error: "Update failed." }, { status: 500 });
    }
  }

  // Plan change goes through setEntitlement (DB + auth metadata mirror). Done
  // after the transaction so a metadata-mirror hiccup never rolls back the row.
  if (nextEntitlement !== undefined && nextEntitlement !== target.entitlement) {
    // setEntitlement mirrors to auth metadata AND fires the `upgraded` lifecycle
    // automation when moving to paid.
    await setEntitlement({ userId: id, authId: target.authId, entitlement: nextEntitlement });
  }

  await audit({
    actor: gate.admin,
    action: "user.update",
    targetType: "user",
    targetId: id,
    summary: `Updated ${target.email}`,
    metadata: {
      before: { role: target.role, language: target.language, name: target.name, entitlement: target.entitlement, coachVerified: target.coachVerified },
      after: { role: updated.role, language: updated.language, name: updated.name, entitlement: nextEntitlement ?? target.entitlement, coachVerified: updated.coachVerified },
    },
    req: request,
  });

  return NextResponse.json({
    id: updated.id,
    email: updated.email,
    name: updated.name,
    role: updated.role,
    language: updated.language,
    entitlement: nextEntitlement ?? updated.entitlement,
    coachVerified: updated.coachVerified,
  });
}
