import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

// The moderation queue: open content reports (social profiles + comments).
// Admin-only. Tables created by reference/sql-moderation.sql — if they're
// missing we flag it rather than 500.
//
// The talent-profile approval queue was removed with the Talent Graph (2026-08
// strategy cuts) — reports are the only feeder now.
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  try {
    const reports = await prisma.report.findMany({
      where: { status: "open" },
      orderBy: { createdAt: "asc" },
      take: 100,
    });

    return NextResponse.json({
      reports: reports.map((r) => ({
        id: r.id,
        reporterEmail: r.reporterEmail,
        targetType: r.targetType,
        targetId: r.targetId,
        reason: r.reason,
        detail: r.detail,
        createdAt: r.createdAt,
      })),
    });
  } catch {
    return NextResponse.json({ reports: [], unavailable: true });
  }
}
