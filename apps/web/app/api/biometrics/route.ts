import { NextResponse } from "next/server";
import { HRV_BOUNDS, RESTING_HR_BOUNDS, SLEEP_BOUNDS, keep, type Bounds } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";

// The user's biometric readings (manual entry now; wearables later). Readiness
// reads these via buildBiometrics. Scoped to the user.
export async function GET(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const entries = await prisma.biometric.findMany({
    where: { userId: user.id },
    orderBy: { date: "desc" },
    take: 30,
  });
  return NextResponse.json({ entries });
}

export async function POST(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = await readJsonLimited<Record<string, unknown>>(request, 16 * 1024);
  if (parsed.error) return parsed.error;
  const b = parsed.data as {
    hrv?: unknown;
    restingHr?: unknown;
    sleepH?: unknown;
  };
  // Bounded, not merely finite. These three ARE the readiness model's inputs:
  // every reading joins a rolling baseline, and a baseline is what every z-score
  // is measured against — so one absurd value does not produce one absurd day,
  // it shifts the athlete's own normal and quietly mis-reads the weeks after it.
  const numOrNull = (v: unknown, b: Bounds) => keep(v, b);

  const entry = await prisma.biometric.create({
    data: {
      userId: user.id,
      date: new Date(),
      hrv: numOrNull(b.hrv, HRV_BOUNDS),
      restingHr: numOrNull(b.restingHr, RESTING_HR_BOUNDS),
      sleepH: numOrNull(b.sleepH, SLEEP_BOUNDS),
      source: "manual",
    },
  });
  return NextResponse.json({ entry }, { status: 201 });
}
