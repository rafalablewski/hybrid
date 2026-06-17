import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// The athlete's own daily check-ins. GET lists newest-first; POST submits one.
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
  const bodyMassKg = num(b.bodyMassKg);
  // Sharing a check-in with a coach is a paid feature; free users keep it private
  // (their own personal log). Silently coerce to false rather than rejecting, so
  // a free user submitting still succeeds — just unshared.
  const sharedWithCoach = b.sharedWithCoach === true && me.entitlement === "paid";
  const checkin = await prisma.checkin.create({
    data: {
      userId: me.id,
      weekOf,
      bodyMassKg,
      energy: int1to5(b.energy),
      sleep: int1to5(b.sleep),
      soreness: int1to5(b.soreness),
      mood: int1to5(b.mood),
      adherencePct: adherence != null ? Math.max(0, Math.min(100, Math.round(adherence))) : null,
      note: typeof b.note === "string" && b.note.trim() ? b.note.trim().slice(0, 2000) : null,
      sharedWithCoach,
    },
  });

  // Mirror the weigh-in into the Signal ontology (bodyMass) so the nutrition
  // engine's maintenance estimate + the smoothed bodyweight trend run on the
  // athlete's REAL weight instead of a cold-start default. Best-effort: a
  // duplicate (same week already logged) must not fail the check-in.
  if (bodyMassKg != null && bodyMassKg > 0) {
    await prisma.signal
      .create({ data: { userId: me.id, kind: "bodyMass", value: bodyMassKg, unit: "kg", source: "checkin", ts: weekOf } })
      .catch(() => {});
  }

  return NextResponse.json({ checkin }, { status: 201 });
}
