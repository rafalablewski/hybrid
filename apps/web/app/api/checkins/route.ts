import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// The athlete's own weekly check-ins. GET lists newest-first; POST submits one.
export async function GET(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const checkins = await prisma.checkin.findMany({
    where: { userId: me.id },
    orderBy: { weekOf: "desc" },
    take: 52,
  });
  return NextResponse.json({ checkins });
}

const int1to5 = (v: unknown) => (typeof v === "number" && v >= 1 && v <= 5 ? Math.round(v) : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export async function POST(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const weekOf =
    typeof b.weekOf === "string" && !Number.isNaN(Date.parse(b.weekOf)) ? new Date(b.weekOf) : new Date();

  const adherence = num(b.adherencePct);
  const checkin = await prisma.checkin.create({
    data: {
      userId: me.id,
      weekOf,
      bodyMassKg: num(b.bodyMassKg),
      energy: int1to5(b.energy),
      sleep: int1to5(b.sleep),
      soreness: int1to5(b.soreness),
      mood: int1to5(b.mood),
      adherencePct: adherence != null ? Math.max(0, Math.min(100, Math.round(adherence))) : null,
      note: typeof b.note === "string" && b.note.trim() ? b.note.trim().slice(0, 2000) : null,
    },
  });
  return NextResponse.json({ checkin }, { status: 201 });
}
