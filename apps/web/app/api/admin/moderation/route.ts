import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

// The moderation queue: discoverable talent profiles awaiting approval + open
// content reports. Admin-only. Tables created by reference/sql-moderation.sql —
// if they're missing we flag it rather than 500.
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  try {
    const [pendingProfiles, reports] = await Promise.all([
      prisma.talentProfile.findMany({
        where: { visibility: "discoverable", moderationStatus: "pending" },
        include: { user: { select: { name: true, email: true } } },
        orderBy: { updatedAt: "asc" },
        take: 100,
      }),
      prisma.report.findMany({ where: { status: "open" }, orderBy: { createdAt: "asc" }, take: 100 }),
    ]);

    // Resolve each report's target (best-effort) so the moderator sees what was
    // flagged without a second round-trip.
    const profileIds = reports.filter((r) => r.targetType === "talentProfile").map((r) => r.targetId);
    const targets = profileIds.length
      ? await prisma.talentProfile.findMany({
          where: { id: { in: profileIds } },
          include: { user: { select: { name: true, email: true } } },
        })
      : [];
    const targetById = new Map(targets.map((t) => [t.id, t]));

    return NextResponse.json({
      pendingProfiles: pendingProfiles.map((p) => ({
        id: p.id,
        name: p.user.name ?? "Athlete",
        email: p.user.email,
        sport: p.sport,
        sex: p.sex,
        age: p.age,
        metrics: p.metrics,
        updatedAt: p.updatedAt,
      })),
      reports: reports.map((r) => {
        const t = r.targetType === "talentProfile" ? targetById.get(r.targetId) : undefined;
        return {
          id: r.id,
          reporterEmail: r.reporterEmail,
          targetType: r.targetType,
          targetId: r.targetId,
          reason: r.reason,
          detail: r.detail,
          createdAt: r.createdAt,
          target: t ? { name: t.user.name ?? "Athlete", email: t.user.email, sport: t.sport, visibility: t.visibility, moderationStatus: t.moderationStatus } : null,
        };
      }),
    });
  } catch {
    return NextResponse.json({ pendingProfiles: [], reports: [], unavailable: true });
  }
}
