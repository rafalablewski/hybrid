import { NextResponse } from "next/server";
import { requireAdmin, audit } from "@/lib/admin";
import { rateLimit, readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { patchUserMetadata } from "@/lib/supabase/admin";
import { enrollInTrigger } from "@/lib/email";

// Approve (→ promote the applicant to COACH) or deny a coach application.
// Both audited. Admin-only.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const limited = await rateLimit(request, { key: "admin-coach-app", limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  const { id } = await params;
  const parsed = await readJsonLimited<{ action?: unknown }>(request, 4 * 1024);
  if (parsed.error) return parsed.error;
  const action = parsed.data.action;
  if (action !== "approve" && action !== "deny")
    return NextResponse.json({ error: "action must be approve|deny" }, { status: 400 });

  const app = await prisma.coachApplication.findUnique({ where: { id } });
  if (!app) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (action === "approve") {
    // Promote the applicant to COACH AND mark the application approved in one
    // transaction so the two never drift.
    // Approving an application also VERIFIES the coach (an admin has vetted their
    // credentials) — this is what drives the verified tick on their profile.
    const [updated] = await prisma.$transaction([
      prisma.user.update({ where: { id: app.userId }, data: { role: "COACH", coachVerified: true }, select: { authId: true, email: true, entitlement: true } }),
      prisma.coachApplication.update({ where: { id }, data: { status: "approved", decidedAt: new Date() } }),
    ]);
    // Mirror the new role into Supabase auth metadata — both clients read the
    // active role from the session, so without this the user wouldn't see the
    // coach surface until they next re-authenticated.
    await patchUserMetadata(updated.authId, { role: "coach" });
    // Fire the coach-welcome lifecycle automation (best-effort / no-op until set up).
    await enrollInTrigger("coach_approved", { id: app.userId, email: updated.email, role: "COACH", entitlement: updated.entitlement });
    await audit({
      actor: gate.admin,
      action: "coach.approve",
      targetType: "user",
      targetId: app.userId,
      summary: `Approved coach ${app.userEmail}`,
      metadata: { via: "application" },
      req: request,
    });
    return NextResponse.json({ ok: true });
  }

  await prisma.coachApplication.update({ where: { id }, data: { status: "denied", decidedAt: new Date() } });
  await audit({
    actor: gate.admin,
    action: "coach.deny",
    targetType: "user",
    targetId: app.userId,
    summary: `Denied coach ${app.userEmail}`,
    metadata: { via: "application" },
    req: request,
  });
  return NextResponse.json({ ok: true });
}
