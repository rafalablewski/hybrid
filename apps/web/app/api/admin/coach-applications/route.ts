import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

// The pending coach-application queue. Admin-only.
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  try {
    const applications = await prisma.coachApplication.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      select: { id: true, userEmail: true, credentials: true, status: true, createdAt: true },
    });
    return NextResponse.json({ applications });
  } catch {
    return NextResponse.json({ applications: [], unavailable: true });
  }
}
