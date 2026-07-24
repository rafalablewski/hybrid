import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";

// The editable food-log: one row per logged food/meal, plus the mirrored Signals
// the engines read. The Diary lists these rows and edit/delete operate on them.
//
// SOFT-GUARDED: the Signals are always written (so totals + the engines are
// unaffected), and the FoodLog row is best-effort — if reference/sql-nutrition-
// log.sql hasn't been applied the POST still succeeds (log: null) and the Diary
// simply has no entry list. GET returns [] until the table exists.

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export async function GET(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const logs = await prisma.foodLog.findMany({
      where: { userId: me.id },
      orderBy: { ts: "desc" },
      take: 200,
    });
    return NextResponse.json({ logs });
  } catch {
    return NextResponse.json({ logs: [] }); // table not migrated yet
  }
}

export async function POST(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = await readJsonLimited<Record<string, unknown>>(request, 8 * 1024);
  if (parsed.error) return parsed.error;
  const b = parsed.data as {
    name?: unknown; subname?: unknown; source?: unknown; ts?: unknown;
    kcal?: unknown; protein?: unknown; carbs?: unknown; fat?: unknown; qty?: unknown;
  };

  if (typeof b.name !== "string" || !b.name.trim())
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  const source = typeof b.source === "string" && b.source ? b.source.slice(0, 40) : "manual";
  const ts = typeof b.ts === "string" && !Number.isNaN(Date.parse(b.ts)) ? new Date(b.ts) : new Date();
  // Macros are PER SINGLE SERVING; qty scales them for the mirrored Signals.
  const kcal = num(b.kcal), protein = num(b.protein), carbs = num(b.carbs), fat = num(b.fat);
  const qty = num(b.qty) || 1;

  // 1) Mirror the scaled totals into the Signal ontology (what the engines read).
  //    Collect the created ids so an edit/delete can target exactly these rows.
  const jobs: [string, number, string][] = [
    ["energyIntake", Math.round(kcal * qty), "kcal"],
    ["protein", Math.round(protein * qty), "g"],
    ["carbs", Math.round(carbs * qty), "g"],
    ["fat", Math.round(fat * qty), "g"],
  ];
  const signalIds: string[] = [];
  for (const [kind, value, unit] of jobs) {
    if (value <= 0) continue;
    try {
      const sig = await prisma.signal.create({ data: { userId: me.id, kind, value, unit, source, ts } });
      signalIds.push(sig.id);
    } catch {
      /* a duplicate (same kind+ts+source) — skip, don't fail the whole log */
    }
  }

  // 2) The editable entry (best-effort — logging must not hard-fail on this).
  let log = null;
  try {
    log = await prisma.foodLog.create({
      data: {
        userId: me.id,
        name: b.name.trim().slice(0, 80),
        subname: typeof b.subname === "string" && b.subname.trim() ? b.subname.trim().slice(0, 60) : null,
        source,
        kcal, protein, carbs, fat, qty,
        signalIds,
        ts,
      },
    });
  } catch {
    /* FoodLog not migrated — Signals are already written, so totals hold */
  }
  return NextResponse.json({ ok: true, log }, { status: 201 });
}
