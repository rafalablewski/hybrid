import { NextResponse } from "next/server";
import { HEIGHT_MIN_CM, HEIGHT_MAX_CM } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// Body metrics — dated weight + tape measurements (Profile → Private → Body &
// progress). Owner-only (RLS in reference/sql-private-tab.sql). GET lists
// newest-first; POST logs one measurement; DELETE removes one.

// A finite positive number in a sane human range, else null. Keeps a fat-finger
// (negative / absurd) value out of the trend without rejecting the whole log.
const num = (v: unknown, max: number): number | null =>
  typeof v === "number" && Number.isFinite(v) && v > 0 && v <= max ? v : null;

// Height has a FLOOR as well as a ceiling: unlike a tape measurement, a value
// below ~120 cm is a unit mix-up (inches typed into a cm field) rather than a
// small athlete, and it would feed the volume model a frame nobody has.
const heightCm = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= HEIGHT_MIN_CM && v <= HEIGHT_MAX_CM ? v : null;

export async function GET(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const metrics = await prisma.bodyMetric.findMany({
    where: { userId: me.id },
    orderBy: { measuredAt: "desc" },
    take: 120,
  });
  return NextResponse.json({ metrics });
}

export async function POST(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const measuredAt =
    typeof b.measuredAt === "string" && !Number.isNaN(Date.parse(b.measuredAt)) ? new Date(b.measuredAt) : new Date();
  const data = {
    userId: me.id,
    measuredAt,
    weightKg: num(b.weightKg, 500),
    heightCm: heightCm(b.heightCm),
    bodyFatPct: num(b.bodyFatPct, 75),
    neckCm: num(b.neckCm, 100),
    chestCm: num(b.chestCm, 250),
    waistCm: num(b.waistCm, 250),
    hipsCm: num(b.hipsCm, 250),
    thighCm: num(b.thighCm, 150),
    armCm: num(b.armCm, 100),
    calfCm: num(b.calfCm, 100),
    note: typeof b.note === "string" && b.note.trim() ? b.note.trim().slice(0, 500) : null,
  };
  // Require at least one real value so an all-empty submit doesn't create noise.
  const hasValue = Object.entries(data).some(([k, v]) => k !== "userId" && k !== "measuredAt" && k !== "note" && v != null);
  if (!hasValue) return NextResponse.json({ error: "empty" }, { status: 400 });
  const metric = await prisma.bodyMetric.create({ data });

  // Mirror the profile weigh-in into the Signal ontology (bodyMass) so the
  // Nutrition engine's maintenance estimate + smoothed bodyweight trend run on
  // the athlete's REAL profile weight — one canonical bodyweight, entered once
  // in the profile (or the nutrition weigh-in, which now writes here too).
  // Best-effort: a duplicate (same instant already logged) must not fail the log.
  if (data.weightKg != null && data.weightKg > 0) {
    await prisma.signal
      .create({ data: { userId: me.id, kind: "bodyMass", value: data.weightKg, unit: "kg", source: "profile", ts: measuredAt } })
      .catch(() => {});
  }

  return NextResponse.json({ metric }, { status: 201 });
}

export async function DELETE(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.bodyMetric.deleteMany({ where: { id, userId: me.id } });
  return NextResponse.json({ ok: true });
}
