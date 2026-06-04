import { NextResponse } from "next/server";
import { requireAdmin, audit } from "@/lib/admin";
import { rateLimit, readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";

// Resolve a content report: dismiss (no action), resolve (handled out-of-band),
// or takedown (reject the reported target so it leaves discovery) — all close the
// report. Audited.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const limited = rateLimit(request, { key: "admin-moderation-report", limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  const { id } = await params;

  const parsed = await readJsonLimited<{ action?: unknown; note?: unknown }>(request, 4 * 1024);
  if (parsed.error) return parsed.error;
  const action = parsed.data.action;
  if (action !== "dismiss" && action !== "resolve" && action !== "takedown")
    return NextResponse.json({ error: "action must be dismiss|resolve|takedown" }, { status: 400 });
  const note = typeof parsed.data.note === "string" ? parsed.data.note.trim().slice(0, 1000) : null;

  const report = await prisma.report.findUnique({ where: { id } });
  if (!report) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (report.status !== "open") return NextResponse.json({ error: "already resolved" }, { status: 409 });

  // A takedown rejects the reported target so it drops out of discovery.
  if (action === "takedown" && report.targetType === "talentProfile") {
    await prisma.talentProfile.updateMany({
      where: { id: report.targetId },
      data: { moderationStatus: "rejected", moderationNote: note ?? "Removed after report" },
    });
  }

  const status = action === "dismiss" ? "dismissed" : "resolved";
  await prisma.report.update({
    where: { id },
    data: { status, resolution: note, resolvedById: gate.admin.id, resolvedByEmail: gate.admin.email, resolvedAt: new Date() },
  });

  await audit({
    actor: gate.admin,
    action: `moderation.report.${action}`,
    targetType: "report",
    targetId: id,
    summary: `${action} report on ${report.targetType}:${report.targetId.slice(0, 8)}`,
    metadata: { reason: report.reason, note },
    req: request,
  });

  return NextResponse.json({ ok: true, status });
}
