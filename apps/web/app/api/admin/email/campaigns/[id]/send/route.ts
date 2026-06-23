import { NextResponse } from "next/server";
import { requireAdmin, audit } from "@/lib/admin";
import { rateLimit } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { sendCampaign, emailConfigured, audienceSize } from "@/lib/email";

// Give the inline send headroom (60s is the safe ceiling across Vercel plans,
// incl. Hobby; larger audiences are queued to the cron worker below anyway).
export const maxDuration = 60;

// A campaign whose audience is larger than this isn't sent inline (it would risk
// the serverless request timeout); it's handed to the background cron worker by
// marking it scheduled-for-now, which sends it on the next tick. Small audiences
// send inline so the admin gets an immediate result.
const INLINE_LIMIT = 250;

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

  // Large audience → queue for the worker instead of blocking the request.
  const size = await audienceSize(campaign.audience as never);
  if (size > INLINE_LIMIT) {
    await prisma.emailCampaign.update({ where: { id }, data: { status: "scheduled", scheduledAt: new Date() } });
    await audit({
      actor: gate.admin,
      action: "email.campaign.queue",
      targetType: "emailCampaign",
      targetId: id,
      summary: `Queued campaign "${campaign.subject}" for ${size} recipients`,
      metadata: { audience: campaign.audience, size },
      req: request,
    });
    return NextResponse.json({ ok: true, queued: true, size });
  }

  // Atomic claim: flip to "sending" only if it isn't already sent/sending.
  // The findUnique check above is advisory (TOCTOU) — two near-simultaneous
  // admin clicks (the 10/min limit lets both through) could both pass it and
  // double-send. This guarded updateMany is the real gate: the loser 409s.
  const claim = await prisma.emailCampaign.updateMany({
    where: { id, status: { notIn: ["sent", "sending"] } },
    data: { status: "sending" },
  });
  if (claim.count === 0) return NextResponse.json({ error: "This campaign has already been sent." }, { status: 409 });

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
