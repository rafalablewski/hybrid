import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

// Recent agent runs across the whole org — the global run-history feed. Admin-
// only. Optional ?status=ok|error filter. Flags if the table doesn't exist yet.
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const status = new URL(request.url).searchParams.get("status");
  const where = status === "ok" || status === "error" ? { status } : {};

  try {
    const runs = await prisma.agentRun.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 });
    return NextResponse.json({ runs });
  } catch {
    return NextResponse.json({ runs: [], unavailable: true });
  }
}
