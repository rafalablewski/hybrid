import { NextResponse } from "next/server";
import { requireAdmin, audit } from "@/lib/admin";
import { rateLimit, readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { audienceSize } from "@/lib/email";
import { parseCampaign, type CampaignInput } from "../shared";

// List broadcast campaigns (newest first), with the deliverable size of each
// audience attached so the console can show "→ N recipients". Admin-only.
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;
  try {
    const campaigns = await prisma.emailCampaign.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
    const withSize = await Promise.all(
      campaigns.map(async (c) => ({ ...c, audienceSize: await audienceSize(c.audience as never) })),
    );
    return NextResponse.json({ campaigns: withSize });
  } catch {
    return NextResponse.json({ campaigns: [], unavailable: true });
  }
}

// Create a draft (or scheduled) campaign. Sending is a separate, explicit action
// (POST .../[id]/send) so a click can never blast everyone by accident.
export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;
  const limited = rateLimit(request, { key: "admin-email-campaign-post", limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await readJsonLimited<CampaignInput>(request, 32 * 1024);
  if (parsed.error) return parsed.error;
  const clean = parseCampaign(parsed.data, true);
  if (!clean.ok) return NextResponse.json({ error: clean.error }, { status: 400 });

  const status = clean.data.scheduledAt ? "scheduled" : (clean.data.status ?? "draft");
  try {
    const created = await prisma.emailCampaign.create({
      data: {
        subject: clean.data.subject!,
        body: clean.data.body!,
        audience: clean.data.audience ?? "all",
        status,
        scheduledAt: clean.data.scheduledAt ?? null,
        createdById: gate.admin.id,
        createdEmail: gate.admin.email,
      },
    });
    await audit({
      actor: gate.admin,
      action: "email.campaign.create",
      targetType: "emailCampaign",
      targetId: created.id,
      summary: `Created campaign "${created.subject}"`,
      metadata: { audience: created.audience, status: created.status },
      req: request,
    });
    return NextResponse.json({ campaign: created }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Email tables aren't migrated yet — run reference/sql-email.sql." }, { status: 503 });
  }
}
