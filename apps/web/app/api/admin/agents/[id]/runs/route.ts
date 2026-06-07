import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

// Recent run history for one agent (newest first) — the transcript view. Admin-
// only. If the AgentRun table doesn't exist yet, flag it rather than 500.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const { id } = await params;
  try {
    const runs = await prisma.agentRun.findMany({
      where: { agentId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return NextResponse.json({ runs });
  } catch {
    return NextResponse.json({ runs: [], unavailable: true });
  }
}
