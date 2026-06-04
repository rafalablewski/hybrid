import { NextResponse } from "next/server";
import { requireAdmin, audit } from "@/lib/admin";
import { rateLimit } from "@/lib/guard";
import { prisma } from "@/lib/db";

// Reset a flag to its registry default by removing the override row. Audited.
export async function DELETE(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const limited = rateLimit(request, { key: "admin-flag-delete", limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  const { key } = await params;
  const decoded = decodeURIComponent(key);

  const existing = await prisma.featureFlag.findUnique({ where: { key: decoded } });
  if (!existing) return NextResponse.json({ ok: true, alreadyDefault: true });

  await prisma.featureFlag.delete({ where: { key: decoded } });

  await audit({
    actor: gate.admin,
    action: "flag.reset",
    targetType: "flag",
    targetId: decoded,
    summary: `Reset ${decoded} to default`,
    req: request,
  });

  return NextResponse.json({ ok: true });
}
