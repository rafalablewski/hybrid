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
  let written = 0;
  let skipped = 0;

  for (const u of users) {
    const [activeRtp, already] = await Promise.all([
      prisma.rtpProtocol.count({ where: { userId: u.id, status: "active" } }),
      prisma.riskOutcome.findFirst({ where: { userId: u.id, injured: false, ts: { gte: dayStart } } }),
    ]);
    if (activeRtp > 0 || already) {
      skipped++;
      continue;
    }
    const { risk } = await athleteState(u.id);
    await prisma.riskOutcome.create({ data: { userId: u.id, score: risk.overall, injured: false } });
    written++;
  }

  return NextResponse.json({ written, skipped, athletes: users.length });
}
