import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import { athleteState } from "@/lib/athlete-state";

// Negative-sample instrumentation (admin). Positives are captured at injury
// time (RTP open); this records one injured=false RiskOutcome per non-injured
// athlete per day — the balancing class the calibration needs to actually
// learn. Athletes with an active RTP are skipped (they're currently injured),
// and same-day duplicates are deduped. Run daily (manually or scheduled).
export async function POST(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const users = await prisma.user.findMany({ select: { id: true }, take: 500 });
  const ids = users.map((u) => u.id);

  // Batch the two eligibility lookups into ONE query each (instead of 2 per user
  // = ~1,000 queries): who currently has an active RTP (injured), and who already
  // has today's negative sample.
  const [injuredRows, alreadyRows] = await Promise.all([
    prisma.rtpProtocol.findMany({ where: { status: "active", userId: { in: ids } }, select: { userId: true }, distinct: ["userId"] }),
    prisma.riskOutcome.findMany({ where: { injured: false, ts: { gte: dayStart }, userId: { in: ids } }, select: { userId: true }, distinct: ["userId"] }),
  ]);
  const injured = new Set(injuredRows.map((r) => r.userId));
  const already = new Set(alreadyRows.map((r) => r.userId));

  const eligible = ids.filter((id) => !injured.has(id) && !already.has(id));
  const skipped = ids.length - eligible.length;

  // athleteState is the engine compute (inherently per-athlete, several queries
  // each); run it SEQUENTIALLY for the eligible athletes so we don't fan out
  // hundreds of concurrent connections and exhaust the pool, then persist every
  // sample in a single createMany.
  const samples: { userId: string; score: number; injured: boolean }[] = [];
  for (const id of eligible) {
    const { risk } = await athleteState(id);
    samples.push({ userId: id, score: risk.overall, injured: false });
  }
  if (samples.length) await prisma.riskOutcome.createMany({ data: samples });

  return NextResponse.json({ written: samples.length, skipped, athletes: users.length });
}
