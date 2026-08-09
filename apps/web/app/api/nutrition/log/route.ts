import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { derivedFoodEntries } from "@hybrid/core";
import { writeFoodLog } from "@/lib/food-log-write";

// The editable food-log: one row per logged food/meal, plus the mirrored Signals
// the engines read. The Diary lists these rows and edit/delete operate on them.
//
// SOFT-GUARDED: the Signals are always written (so totals + the engines are
// unaffected), and the FoodLog row is best-effort — if reference/sql-nutrition-
// log.sql hasn't been applied the POST still succeeds (log: null).
//
// GET never returns an empty diary when intake exists: anything WITHOUT a
// FoodLog row (logged before the table shipped, or on a database where the
// migration hasn't run) is rebuilt from its Signals — the four rows one log
// wrote share an exact ts + source, so they regroup into the same entry, with a
// `sig:`-prefixed id the edit/delete route resolves back to those Signals. So
// every logged item in history can be changed or removed, migrated or not.

const DERIVED_WINDOW_DAYS = 120; // how far back the Diary can edit individual entries
// Every Signal kind ONE logged food can write — the four macros plus the label
// panel. The panel kinds must be listed here too: a derived entry groups by
// (exact ts, source), so leaving them out would strand four readings the diary
// can neither show nor delete.
const FOOD_KINDS = ["energyIntake", "protein", "carbs", "fat", "satFat", "sugar", "fiber", "salt"];

export async function GET(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Real entries first (may not exist at all — the table is a later migration).
  let logs: unknown[] = [];
  let ownedSignalIds: string[] = [];
  try {
    logs = await prisma.foodLog.findMany({ where: { userId: me.id }, orderBy: { ts: "desc" }, take: 200 });
    // Every Signal any FoodLog row owns — including rows beyond the 200 above —
    // so a migrated entry is never ALSO listed as a derived one.
    const owners = await prisma.foodLog.findMany({ where: { userId: me.id }, select: { signalIds: true }, take: 2000 });
    ownedSignalIds = owners.flatMap((o) => (Array.isArray(o.signalIds) ? o.signalIds.filter((x): x is string => typeof x === "string") : []));
  } catch {
    /* table not migrated yet — the derived entries below carry the whole diary */
  }

  // Rebuild the rest from the Signals the engines already read.
  let derived: ReturnType<typeof derivedFoodEntries> = [];
  try {
    const since = new Date(Date.now() - DERIVED_WINDOW_DAYS * 86_400_000);
    const signals = await prisma.signal.findMany({
      where: { userId: me.id, kind: { in: FOOD_KINDS }, ts: { gte: since } },
      select: { id: true, kind: true, value: true, source: true, ts: true },
      orderBy: { ts: "desc" },
      take: 8000,
    });
    derived = derivedFoodEntries(signals, { exclude: ownedSignalIds });
  } catch {
    /* signals unavailable — fall through with whatever FoodLog gave us */
  }

  return NextResponse.json({ logs: [...logs, ...derived] });
}

export async function POST(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = await readJsonLimited<Record<string, unknown>>(request, 8 * 1024);
  if (parsed.error) return parsed.error;

  // The write itself lives in lib/food-log-write.ts, shared with the batch
  // route the day-copy uses — see that file for why it is not duplicated.
  if (typeof parsed.data.name !== "string" || !parsed.data.name.trim())
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  const log = await writeFoodLog(me.id, parsed.data);
  return NextResponse.json({ ok: true, log }, { status: 201 });
}
