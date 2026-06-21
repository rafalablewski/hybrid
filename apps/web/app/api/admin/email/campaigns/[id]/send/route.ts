import { NextResponse } from "next/server";
import { requireAdmin, audit } from "@/lib/admin";
import { rateLimit } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { sendCampaign, emailConfigured } from "@/lib/email";

// Send a campaign NOW (explicit, separate from create/edit so a broadcast is
// always a deliberate act). Marks it sending → sent/failed and records the
// tallies. Admin-only + rate-limited. Refuses if email isn't configured so a
// campaign can't silently "send" to nobody.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;
  const limited = rateLimit(request, { key: "admin-email-campaign-send", limit: 10, windowMs: 60_000 });
  if (limited) return limited;
  const { id } = await params;

  if (!emailConfigured())
    return NextResponse.json(
      { error: "Email isn't configured — set RESEND_API_KEY + EMAIL_FROM before sending." },
      { status: 503 },
    );

  const campaign = await prisma.emailCampaign.findUnique({ where: { id } });
  if (!campaign) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (campaign.status === "sent" || campaign.status === "sending")
    return NextResponse.json({ error: "This campaign has already been sent." }, { status: 409 });

  await prisma.emailCampaign.update({ where: { id }, data: { status: "sending" } });

  let sent = 0;
  let failed = 0;
  try {
    ({ sent, failed } = await sendCampaign(campaign));
    await prisma.emailCampaign.update({
      where: { id },
      data: { status: failed > 0 && sent === 0 ? "failed" : "sent", sentAt: new Date(), sentCount: sent, failedCount: failed },
    });
  } catch (e) {
    await prisma.emailCampaign.update({ where: { id }, data: { status: "failed" } });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Send failed." }, { status: 500 });
  }

  await audit({
    actor: gate.admin,
    action: "email.campaign.send",
    targetType: "emailCampaign",
    targetId: id,
    summary: `Sent campaign "${campaign.subject}" (${sent} ok, ${failed} failed)`,
    metadata: { audience: campaign.audience, sent, failed },
    req: request,
  });

  return NextResponse.json({ ok: true, sent, failed });
}
