import { NextResponse } from "next/server";
import { requireAdmin, audit } from "@/lib/admin";
import { rateLimit, readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";

// Approve (→ add the feature to the user's featureGrants) or deny a request.
// Both audited. Admin-only.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const limited = rateLimit(request, { key: "admin-access-req", limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  const { id } = await params;
  const parsed = await readJsonLimited<{ action?: unknown }>(request, 4 * 1024);
  if (parsed.error) return parsed.error;
  const action = parsed.data.action;
  if (action !== "approve" && action !== "deny")
    return NextResponse.json({ error: "action must be approve|deny" }, { status: 400 });

  const req = await prisma.accessRequest.findUnique({ where: { id } });
  if (!req) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (action === "approve") {
    // Add the feature to the user's grant row (dedup) AND mark the request
    // approved in one transaction so the two never drift. Soft-guarded: if the
    // FeatureGrant table isn't migrated, return a clear 503 (request untouched).
    try {
      // Read-modify-write inside the interactive transaction so concurrent
      // approvals for the same user can't lose each other's grant.
      await prisma.$transaction(async (tx) => {
        const existing = (await tx.featureGrant.findUnique({ where: { userId: req.userId }, select: { navIds: true } }))?.navIds ?? [];
        const navIds = [...new Set([...existing, req.navId])].slice(0, 40);
        await tx.featureGrant.upsert({ where: { userId: req.userId }, create: { userId: req.userId, navIds }, update: { navIds } });
        await tx.accessRequest.update({ where: { id }, data: { status: "approved", decidedAt: new Date() } });
      });
    } catch {
      return NextResponse.json({ error: "Feature grants aren't enabled yet — run reference/sql-user-feature-grants.sql." }, { status: 503 });
    }
    await audit({
      actor: gate.admin,
      action: "access.grant",
      targetType: "user",
      targetId: req.userId,
      summary: `Granted ${req.navId} to ${req.userEmail}`,
      metadata: { navId: req.navId, via: "request" },
      req: request,
    });
    return NextResponse.json({ ok: true, status: "approved" });
  }

  await prisma.accessRequest.update({ where: { id }, data: { status: "denied", decidedAt: new Date() } });
  await audit({
    actor: gate.admin,
    action: "access.deny",
    targetType: "user",
    targetId: req.userId,
    summary: `Denied ${req.navId} for ${req.userEmail}`,
    metadata: { navId: req.navId },
    req: request,
  });
  return NextResponse.json({ ok: true, status: "denied" });
}
