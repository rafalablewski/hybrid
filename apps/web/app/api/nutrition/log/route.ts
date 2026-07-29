import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { derivedFoodEntries, foodLogSignals } from "@hybrid/core";

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

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// A LABEL-PANEL field (saturates / sugars / fibre / salt). Unlike `num`, absence
// survives as null: an unstated sugar content is not a sugar-free food, and the
// diary must be able to show "—" rather than a fabricated 0 g.
const panelNum = (v: unknown): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : null;
};

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
  const b = parsed.data as {
    name?: unknown; subname?: unknown; source?: unknown; ts?: unknown;
    kcal?: unknown; protein?: unknown; carbs?: unknown; fat?: unknown; qty?: unknown;
    satFat?: unknown; sugar?: unknown; fiber?: unknown; salt?: unknown; verifiedId?: unknown;
  };

  if (typeof b.name !== "string" || !b.name.trim())
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  const source = typeof b.source === "string" && b.source ? b.source.slice(0, 40) : "manual";
  const ts = typeof b.ts === "string" && !Number.isNaN(Date.parse(b.ts)) ? new Date(b.ts) : new Date();
  // Macros are PER SINGLE SERVING; qty scales them for the mirrored Signals.
  const kcal = num(b.kcal), protein = num(b.protein), carbs = num(b.carbs), fat = num(b.fat);
  const qty = num(b.qty) || 1;
  // The label panel, also per single serving. null = the food never stated it,
  // in which case NO Signal is written for it (see foodLogSignals) — absence in
  // the stream is how a day knows it is only partially described.
  const satFat = panelNum(b.satFat), sugar = panelNum(b.sugar), fiber = panelNum(b.fiber), salt = panelNum(b.salt);
  const verifiedId = typeof b.verifiedId === "string" && b.verifiedId.trim() ? b.verifiedId.trim().slice(0, 60) : null;

  // 1) Mirror the scaled totals into the Signal ontology (what the engines read).
  //    ONE builder in core decides which Signals a log means, so this route, the
  //    presets and the quantity edit below can never drift apart.
  //    Collect the created ids so an edit/delete can target exactly these rows.
  const signalIds: string[] = [];
  for (const { kind, value, unit } of foodLogSignals({ kcal, protein, carbs, fat, satFat, sugar, fiber, salt }, qty)) {
    try {
      const sig = await prisma.signal.create({ data: { userId: me.id, kind, value, unit, source, ts } });
      signalIds.push(sig.id);
    } catch {
      /* a duplicate (same kind+ts+source) — skip, don't fail the whole log */
    }
  }

  // 2) The editable entry (best-effort — logging must not hard-fail on this).
  //    Two attempts: WITH the label panel, then without. The panel columns are a
  //    later migration (reference/sql-nutrition-label-panel.sql), so on a
  //    database that hasn't run it the first insert fails on unknown columns —
  //    and the entry would be lost entirely if we stopped there. The retry keeps
  //    the named, editable diary row; only the panel is dropped.
  const base = {
    userId: me.id,
    name: b.name.trim().slice(0, 80),
    subname: typeof b.subname === "string" && b.subname.trim() ? b.subname.trim().slice(0, 60) : null,
    source,
    kcal, protein, carbs, fat, qty,
    signalIds,
    ts,
  };
  let log = null;
  try {
    log = await prisma.foodLog.create({ data: { ...base, satFat, sugar, fiber, salt, verifiedId } });
  } catch {
    try {
      log = await prisma.foodLog.create({ data: base });
    } catch {
      /* FoodLog not migrated at all — Signals are already written, so totals hold */
    }
  }
  return NextResponse.json({ ok: true, log }, { status: 201 });
}
