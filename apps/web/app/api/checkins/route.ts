import { NextResponse } from "next/server";
import { CHECKIN_COOLDOWN_MS } from "@hybrid/core";
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

  // Refining the SAME day's check-in (e.g. the Today quick-readiness tap, then
  // the "log the full picture" nudge into the guided flow) UPDATES that day's
  // row — so the coarse one-tap read is replaced by the detailed one, with no
  // duplicate and no cooldown block. Only a check-in for a NEW day is subject to
  // the 6h cooldown. Same-day is a UTC-calendar-day window around weekOf.
  const dayStart = new Date(Date.UTC(weekOf.getUTCFullYear(), weekOf.getUTCMonth(), weekOf.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  const sameDay = await prisma.checkin.findFirst({
    where: { userId: me.id, weekOf: { gte: dayStart, lt: dayEnd } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  // 6h re-log cooldown: a NEW day's feeling may be logged at most once every 6
  // hours. Server-authoritative (keyed on the last row's createdAt, not client-
  // supplied weekOf), so the cap holds no matter which surface sends the POST.
  if (!sameDay) {
    const last = await prisma.checkin.findFirst({
      where: { userId: me.id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (last) {
      const retryAfterMs = CHECKIN_COOLDOWN_MS - (Date.now() - last.createdAt.getTime());
      if (retryAfterMs > 0) {
        return NextResponse.json({ error: "cooldown", retryAfterMs }, { status: 429 });
      }
    }
  }

  const adherence = num(b.adherencePct);
  const bodyMassKg = num(b.bodyMassKg);
  // Sharing a check-in with a coach is a paid feature; free users keep it private
  // (their own personal log). Silently coerce to false rather than rejecting, so
  // a free user submitting still succeeds — just unshared.
  const sharedWithCoach = b.sharedWithCoach === true && me.entitlement === "paid";
  const data = {
    weekOf,
    bodyMassKg,
    energy: int1to5(b.energy),
    sleep: int1to5(b.sleep),
    soreness: int1to5(b.soreness),
    mood: int1to5(b.mood),
    adherencePct: adherence != null ? Math.max(0, Math.min(100, Math.round(adherence))) : null,
    note: typeof b.note === "string" && b.note.trim() ? b.note.trim().slice(0, 2000) : null,
    sharedWithCoach,
  };
  const checkin = sameDay
    ? await prisma.checkin.update({ where: { id: sameDay.id }, data })
    : await prisma.checkin.create({ data: { userId: me.id, ...data } });

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
