import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
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

  const b = (await request.json().catch(() => ({}))) as {
    hrv?: unknown;
    restingHr?: unknown;
    sleepH?: unknown;
  };
  const numOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

  const entry = await prisma.biometric.create({
    data: {
      userId: user.id,
      date: new Date(),
      hrv: numOrNull(b.hrv),
      restingHr: numOrNull(b.restingHr),
      sleepH: numOrNull(b.sleepH),
      source: "manual",
    },
  });
  return NextResponse.json({ entry }, { status: 201 });
}
