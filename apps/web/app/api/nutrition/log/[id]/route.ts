import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";

// Edit (quantity) or delete a single logged entry. Both keep the mirrored
// Signals in lock-step: a quantity edit rescales them, a delete removes them.
// Owner-scoped (explicit userId check + RLS).

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// Delete the Signals a FoodLog created (best-effort — a missing row is fine).
async function deleteMirror(userId: string, ids: unknown) {
  const signalIds = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : [];
  if (signalIds.length === 0) return;
  await prisma.signal.deleteMany({ where: { id: { in: signalIds }, userId } }).catch(() => {});
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const parsed = await readJsonLimited<Record<string, unknown>>(request, 2 * 1024);
  if (parsed.error) return parsed.error;
  const qty = num((parsed.data as { qty?: unknown }).qty);
  if (qty <= 0) return NextResponse.json({ error: "qty must be positive" }, { status: 400 });

  let existing;
  try {
    existing = await prisma.foodLog.findUnique({ where: { id } });
  } catch {
    return NextResponse.json({ error: "not available" }, { status: 404 }); // unmigrated
  }
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (existing.userId !== me.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Rescale the mirror: drop the old Signals and re-create at the new quantity.
  await deleteMirror(me.id, existing.signalIds);
  const jobs: [string, number, string][] = [
    ["energyIntake", Math.round(existing.kcal * qty), "kcal"],
    ["protein", Math.round(existing.protein * qty), "g"],
    ["carbs", Math.round(existing.carbs * qty), "g"],
    ["fat", Math.round(existing.fat * qty), "g"],
  ];
  const signalIds: string[] = [];
  for (const [kind, value, unit] of jobs) {
    if (value <= 0) continue;
    try {
      const sig = await prisma.signal.create({ data: { userId: me.id, kind, value, unit, source: existing.source, ts: existing.ts } });
      signalIds.push(sig.id);
    } catch {
      /* duplicate — skip */
    }
  }
  const log = await prisma.foodLog.update({ where: { id }, data: { qty, signalIds } });
  return NextResponse.json({ ok: true, log });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  let existing;
  try {
    existing = await prisma.foodLog.findUnique({ where: { id } });
  } catch {
    return NextResponse.json({ error: "not available" }, { status: 404 }); // unmigrated
  }
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (existing.userId !== me.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  await deleteMirror(me.id, existing.signalIds);
  await prisma.foodLog.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
