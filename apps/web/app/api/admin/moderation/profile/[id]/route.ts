import { NextResponse } from "next/server";
import { requireAdmin, audit } from "@/lib/admin";
import { rateLimit, readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";

// Moderate a discoverable talent profile: approve (surfaces in discovery) or
// reject (kept out). Audited.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const limited = rateLimit(request, { key: "admin-moderation-profile", limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  const { id } = await params;

  const parsed = await readJsonLimited<{ action?: unknown; note?: unknown }>(request, 4 * 1024);
  if (parsed.error) return parsed.error;
  const action = parsed.data.action;
  if (action !== "approve" && action !== "reject")
    return NextResponse.json({ error: "action must be approve|reject" }, { status: 400 });
  const note = typeof parsed.data.note === "string" ? parsed.data.note.trim().slice(0, 1000) : null;

  const profile = await prisma.talentProfile.findUnique({ where: { id }, include: { user: { select: { email: true } } } });
  if (!profile) return NextResponse.json({ error: "not found" }, { status: 404 });

  const moderationStatus = action === "approve" ? "approved" : "rejected";
  await prisma.talentProfile.update({ where: { id }, data: { moderationStatus, moderationNote: note } });

  await audit({
    actor: gate.admin,
    action: `moderation.profile.${action}`,
    targetType: "talentProfile",
    targetId: id,
    summary: `${action === "approve" ? "Approved" : "Rejected"} ${profile.user.email}'s discoverable profile`,
    metadata: { note },
    req: request,
  });

  return NextResponse.json({ ok: true, moderationStatus });
}
