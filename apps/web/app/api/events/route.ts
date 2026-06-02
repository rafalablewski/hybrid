import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// Target competitions for the signed-in athlete (the peaking optimizer fits a
// plan to each). Soonest first.
export async function GET(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const events = await prisma.event.findMany({
    where: { userId: user.id },
    orderBy: { date: "asc" },
  });
  return NextResponse.json({ events });
}

export async function POST(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const b = (await request.json().catch(() => ({}))) as { name?: unknown; sport?: unknown; date?: unknown };
  if (typeof b.name !== "string" || !b.name.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (typeof b.sport !== "string" || !b.sport) return NextResponse.json({ error: "sport required" }, { status: 400 });
  if (typeof b.date !== "string" || Number.isNaN(Date.parse(b.date))) return NextResponse.json({ error: "valid date required" }, { status: 400 });

  const event = await prisma.event.create({
    data: { userId: user.id, name: b.name.trim(), sport: b.sport, date: new Date(b.date) },
  });
  return NextResponse.json({ event }, { status: 201 });
}
