import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { signalUnit, SIGNAL_KINDS, HEAT_TEMP_BOUNDS, HEAT_MINUTES_BOUNDS, type SignalKind } from "@hybrid/core";

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
  // `kind` accepts a COMMA-SEPARATED LIST, and that is the fix for a real
  // starvation bug rather than a convenience. This route returns the 500 newest
  // rows of ANY kind, and one logged food writes up to eight of them
  // (energyIntake/protein/carbs/fat plus the satFat/sugar/fiber/salt panel) —
  // so on a diligent nutrition logger the unfiltered window covers barely a
  // fortnight, and priorBaseline() was reading an athlete's HRV baseline out of
  // whatever had not yet been evicted by their lunch. A caller that knows which
  // stream it needs can now ask for it and never compete with an unrelated one.
  const kinds = (url.searchParams.get("kind") ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter((k) => KINDS.includes(k as SignalKind));
  const signals = await prisma.signal.findMany({
    where: { userId: user.id, ...(kinds.length ? { kind: { in: kinds } } : {}) },
    orderBy: { ts: "desc" },
    take: 500,
  });
  return NextResponse.json({ signals });
}

export async function POST(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = await readJsonLimited<Record<string, unknown>>(request, 16 * 1024);
  if (parsed.error) return parsed.error;
  const b = parsed.data as {
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

  // HEAT IS TYPED, so it is the one kind that can carry a fat-finger. Bounce it
  // rather than clamping: 900 °C is a typo, and silently storing 120 would turn
  // a mistake into the hottest sauna in the world and score it accordingly.
  const bounds =
    kind === "saunaTemp" ? HEAT_TEMP_BOUNDS : kind === "sauna" ? HEAT_MINUTES_BOUNDS : null;
  if (bounds && (b.value < bounds[0] || b.value > bounds[1]))
    return NextResponse.json(
      { error: `${kind} must be between ${bounds[0]} and ${bounds[1]}` },
      { status: 400 },
    );
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
