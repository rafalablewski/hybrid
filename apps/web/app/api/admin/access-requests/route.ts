import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

// The pending feature-access requests queue. Admin-only.
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  try {
    const requests = await prisma.accessRequest.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      select: { id: true, userId: true, userEmail: true, navId: true, createdAt: true },
    });
    return NextResponse.json({ requests });
  } catch {
    return NextResponse.json({ requests: [], unavailable: true });
  }
}
