import { NextResponse } from "next/server";
import { EMAIL_AUDIENCES } from "@hybrid/core";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { emailStatus, audienceSize } from "@/lib/email";

// Email console overview — provider status, audience sizes, and headline ledger
// counts. Admin-only. Soft-degrades to an "unavailable" flag if the email tables
// haven't been migrated yet.
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const status = emailStatus();

  // Audience sizes always work (they only read User).
  const audiences = await Promise.all(
    EMAIL_AUDIENCES.map(async (a) => ({ id: a.id, label: a.label, size: await audienceSize(a.id) })),
  );

  let sent = 0;
  let failed = 0;
  let suppressed = 0;
  let campaigns = 0;
  let sequences = 0;
  let unavailable = false;
  try {
    [sent, failed, suppressed, campaigns, sequences] = await Promise.all([
      prisma.emailMessage.count({ where: { status: "sent" } }),
      prisma.emailMessage.count({ where: { status: "failed" } }),
      prisma.emailSuppression.count(),
      prisma.emailCampaign.count(),
      prisma.emailSequence.count(),
    ]);
  } catch {
    unavailable = true;
  }

  return NextResponse.json({
    configured: status.configured,
    from: status.from,
    audiences,
    totals: { sent, failed, suppressed, campaigns, sequences },
    unavailable,
  });
}
