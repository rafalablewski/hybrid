import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import { signalUnit, SIGNAL_KINDS, type SignalKind } from "@hybrid/core";

// The Performance State's universal time-series. Any source (manual, HealthKit,
// WHOOP, Garmin, Catapult, nutrition…) writes one Signal shape here; the engines
// read the stream via toBiometrics / the Performance State. The accepted-kind allow-list is
// the single source of truth in @hybrid/core so it never drifts. Scoped to the
// user; coaches read via the active-link RLS policy.
const KINDS: SignalKind[] = SIGNAL_KINDS;

export async function GET(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const signals = await prisma.signal.findMany({
    where: { userId: user.id, ...(kind ? { kind } : {}) },
    orderBy: { ts: "desc" },
    take: 500,
  });
  return NextResponse.json({ signals });
}

export async function POST(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const b = (await request.json().catch(() => ({}))) as {
    kind?: unknown;
    value?: unknown;
    unit?: unknown;
    source?: unknown;
    ts?: unknown;
  };

  if (typeof b.kind !== "string" || !KINDS.includes(b.kind as SignalKind))
    return NextResponse.json({ error: "invalid kind" }, { status: 400 });
  if (typeof b.value !== "number" || !Number.isFinite(b.value))
    return NextResponse.json({ error: "invalid value" }, { status: 400 });

  const kind = b.kind as SignalKind;
  const ts = typeof b.ts === "string" && !Number.isNaN(Date.parse(b.ts)) ? new Date(b.ts) : new Date();

  const signal = await prisma.signal.create({
    data: {
      userId: user.id,
      kind,
      value: b.value,
      unit: typeof b.unit === "string" && b.unit ? b.unit : signalUnit(kind),
      source: typeof b.source === "string" && b.source ? b.source : "manual",
      ts,
    },
  });
  return NextResponse.json({ signal }, { status: 201 });
}
