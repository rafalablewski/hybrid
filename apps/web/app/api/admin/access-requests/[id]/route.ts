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
    // Grant the feature to the user (dedup), then mark the request approved — in
    // one transaction so the two never drift.
    const target = await prisma.user.findUnique({ where: { id: req.userId }, select: { featureGrants: true, email: true } });
    if (!target) return NextResponse.json({ error: "user not found" }, { status: 404 });
    const grants = [...new Set([...(target.featureGrants ?? []), req.navId])].slice(0, 40);
    await prisma.$transaction([
      prisma.user.update({ where: { id: req.userId }, data: { featureGrants: grants } }),
      prisma.accessRequest.update({ where: { id }, data: { status: "approved", decidedAt: new Date() } }),
    ]);
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
