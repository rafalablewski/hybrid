import { NextResponse } from "next/server";
import { requireAdmin, audit } from "@/lib/admin";
import { rateLimit, readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { parseCampaign, type CampaignInput } from "../../shared";

// Edit a draft/scheduled campaign. A campaign that's already been sent is locked
// (no edits to the historical record).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;
  const limited = rateLimit(request, { key: "admin-email-campaign-patch", limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const { id } = await params;

  const parsed = await readJsonLimited<CampaignInput>(request, 32 * 1024);
  if (parsed.error) return parsed.error;
  const clean = parseCampaign(parsed.data, false);
  if (!clean.ok) return NextResponse.json({ error: clean.error }, { status: 400 });

  const before = await prisma.emailCampaign.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (before.status === "sent" || before.status === "sending")
    return NextResponse.json({ error: "A sent campaign can't be edited." }, { status: 409 });

  // Setting a schedule moves a draft to "scheduled"; clearing it returns to draft.
  const data = { ...clean.data };
  if (clean.data.scheduledAt !== undefined)
    (data as { status?: string }).status = clean.data.scheduledAt ? "scheduled" : "draft";

  const updated = await prisma.emailCampaign.update({ where: { id }, data });
  await audit({
    actor: gate.admin,
    action: "email.campaign.update",
    targetType: "emailCampaign",
    targetId: id,
    summary: `Updated campaign "${updated.subject}"`,
    req: request,
  });
  return NextResponse.json({ campaign: updated });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;
  const { id } = await params;
  const existing = await prisma.emailCampaign.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  await prisma.emailCampaign.delete({ where: { id } });
  await audit({
    actor: gate.admin,
    action: "email.campaign.delete",
    targetType: "emailCampaign",
    targetId: id,
    summary: `Deleted campaign "${existing.subject}"`,
    req: request,
  });
  return NextResponse.json({ ok: true });
}
