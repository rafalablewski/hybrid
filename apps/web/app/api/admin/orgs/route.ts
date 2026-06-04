import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

// Organizations across the platform: teams + membership counts. Management
// metadata only. Admin-only.
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const orgs = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      name: true,
      createdAt: true,
      _count: { select: { teams: true, memberships: true } },
    },
  });

  return NextResponse.json({
    orgs: orgs.map((o) => ({
      id: o.id,
      name: o.name,
      createdAt: o.createdAt,
      teams: o._count.teams,
      members: o._count.memberships,
    })),
  });
}
