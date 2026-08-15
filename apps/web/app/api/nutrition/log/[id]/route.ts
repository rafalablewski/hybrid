import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { foodLogSignals, parseDerivedEntryId, rescaleLoggedAmount } from "@hybrid/core";

// Edit (quantity) or delete a single logged entry. Both keep the mirrored
// Signals in lock-step: a quantity edit rescales them, a delete removes them.
// Owner-scoped (explicit userId check + RLS).
//
// Two kinds of id arrive here. A plain id is a FoodLog row (per-serving macros
// + a qty, so an edit sets an absolute quantity). A `sig:`-prefixed id is an
// entry the Diary rebuilt from Signals alone — there is no per-serving base to
// multiply, so an edit sends a relative `scale` and the Signal values are
// rescaled by it. Delete is the same either way: the entry and its Signals go.

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// Rescale the Signals behind a derived entry (a Diary entry with no FoodLog
// row). A component that would round away to nothing is removed instead.
async function scaleSignals(userId: string, ids: string[], scale: number) {
  const rows = await prisma.signal.findMany({ where: { id: { in: ids }, userId }, select: { id: true, value: true } });
  for (const r of rows) {
    const next = Math.round(r.value * scale);
    if (next > 0) await prisma.signal.update({ where: { id: r.id }, data: { value: next } });
    else await prisma.signal.delete({ where: { id: r.id } }).catch(() => {});
  }
  return rows.length;
}

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
  const body = parsed.data as { qty?: unknown; scale?: unknown };

  // Signal-backed entry — rescale its readings by the relative factor.
  const derivedIds = parseDerivedEntryId(id);
  if (derivedIds) {
    const scale = num(body.scale);
    if (scale <= 0 || scale > 50) return NextResponse.json({ error: "scale must be between 0 and 50" }, { status: 400 });
    const touched = await scaleSignals(me.id, derivedIds, scale);
    if (touched === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true, log: null });
  }

  const qty = num(body.qty);
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
  // The SAME core builder the POST uses, so a quantity edit re-writes exactly
  // the Signals the original log wrote — including the label panel, where the
  // food stated one (a row from before the panel migration simply has nulls).
  await deleteMirror(me.id, existing.signalIds);
  const jobs = foodLogSignals(
    {
      kcal: existing.kcal, protein: existing.protein, carbs: existing.carbs, fat: existing.fat,
      satFat: (existing as { satFat?: number | null }).satFat ?? null,
      sugar: (existing as { sugar?: number | null }).sugar ?? null,
      fiber: (existing as { fiber?: number | null }).fiber ?? null,
      salt: (existing as { salt?: number | null }).salt ?? null,
    },
    qty,
  );
  const signalIds: string[] = [];
  for (const { kind, value, unit } of jobs) {
    if (value <= 0) continue;
    try {
      const sig = await prisma.signal.create({ data: { userId: me.id, kind, value, unit, source: existing.source, ts: existing.ts } });
      signalIds.push(sig.id);
    } catch {
      /* duplicate — skip */
    }
  }
  // The AMOUNT moves with the quantity, by the same ratio. Not re-derived: the
  // ratio between them is fixed for a given food and unit, so scaling is exact,
  // while a re-derivation could disagree with what the athlete originally
  // entered — and then the row and the total would tell two different stories
  // about one meal. Entries with no amount (or a database that predates the
  // columns) simply keep the quantity edit.
  const prevAmount = (existing as { amount?: number | null }).amount ?? null;
  const amount = rescaleLoggedAmount(prevAmount, existing.qty, qty);
  let log;
  try {
    log = await prisma.foodLog.update({ where: { id }, data: { qty, signalIds, ...(amount != null ? { amount } : {}) } });
  } catch {
    log = await prisma.foodLog.update({ where: { id }, data: { qty, signalIds } });
  }
  return NextResponse.json({ ok: true, log });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  // Signal-backed entry — removing its Signals removes the entry.
  const derivedIds = parseDerivedEntryId(id);
  if (derivedIds) {
    const { count } = await prisma.signal.deleteMany({ where: { id: { in: derivedIds }, userId: me.id } });
    if (count === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

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
