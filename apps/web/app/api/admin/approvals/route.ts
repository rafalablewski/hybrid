import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

// Pending run approvals awaiting a second operator. Admin-only (read). Flags if
// the table isn't migrated yet.
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  try {
    const approvals = await prisma.agentApproval.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json({ approvals });
  } catch {
    return NextResponse.json({ approvals: [], unavailable: true });
  }
}
