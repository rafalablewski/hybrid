import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// The signed-in athlete's own assignments (what's scheduled for them).
export async function GET(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const assignments = await prisma.assignment.findMany({
    where: { athleteId: me.id },
    orderBy: { date: "desc" },
    take: 120,
  });
  return NextResponse.json({ assignments });
}
