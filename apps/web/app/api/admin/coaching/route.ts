import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

// Coach↔client relationships across the platform. Shows the link graph (who
// coaches whom, status) — never the private notes or training content. Admin-only.
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const url = new URL(request.url);
  const status = url.searchParams.get("status"); // PENDING | ACTIVE | ENDED | null

  const [byStatus, links] = await Promise.all([
    prisma.coachLink.groupBy({ by: ["status"], _count: { status: true } }),
    prisma.coachLink.findMany({
      where: status === "PENDING" || status === "ACTIVE" || status === "ENDED" ? { status } : {},
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        status: true,
        createdAt: true,
        coach: { select: { email: true, name: true } },
        client: { select: { email: true, name: true } },
        _count: { select: { notes: true } },
      },
    }),
  ]);

  return NextResponse.json({
    counts: byStatus.map((s) => ({ status: s.status, n: s._count.status })),
    links: links.map((l) => ({
      id: l.id,
      status: l.status,
      createdAt: l.createdAt,
      coach: l.coach.name || l.coach.email,
      client: l.client.name || l.client.email,
      notes: l._count.notes,
    })),
  });
}
