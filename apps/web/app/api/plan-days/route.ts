import { NextResponse } from "next/server";
import type { PlanOverride, PlanOverrides } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// Per-day plan overrides (skip / postpone) for the athlete's enrolled plan week
// rail. "done"/"missed" stay derived by the engine; only explicit intent lives
// here. Every handler tolerates the table not being migrated yet (run
// reference/sql-plan-day-overrides.sql) — until then the rail keeps working off
// its client-side cache and these endpoints degrade to a no-op / empty set.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDateKey = (v: unknown): v is string => typeof v === "string" && DATE_RE.test(v);
const planIdOf = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 64) : null);

// GET /api/plan-days?planId=... → { overrides: Record<dateKey, PlanOverride> }
export async function GET(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const planId = planIdOf(new URL(request.url).searchParams.get("planId"));
  if (!planId) return NextResponse.json({ overrides: {} });

  try {
    const rows = await prisma.planDayOverride.findMany({ where: { userId: me.id, planId } });
    const overrides: PlanOverrides = {};
    for (const r of rows) {
      overrides[r.date] =
        r.status === "postponed" && r.postponedTo
          ? { status: "postponed", toDateKey: r.postponedTo }
          : { status: "skipped" };
    }
    return NextResponse.json({ overrides });
  } catch {
    // table not migrated yet — the client keeps its local cache
    return NextResponse.json({ overrides: {} });
  }
}

// POST /api/plan-days  { planId, date, override: PlanOverride | null }
// Upserts the override, or clears it when `override` is null. Returns { ok }.
export async function POST(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const b = (await request.json().catch(() => ({}))) as { planId?: unknown; date?: unknown; override?: unknown };
  const planId = planIdOf(b.planId);
  if (!planId || !isDateKey(b.date)) return NextResponse.json({ error: "planId and date required" }, { status: 400 });
  const date = b.date;

  // Validate the override shape (or null to clear).
  let override: PlanOverride | null = null;
  const ov = b.override as { status?: unknown; toDateKey?: unknown } | null | undefined;
  if (ov && ov.status === "skipped") override = { status: "skipped" };
  else if (ov && ov.status === "postponed" && isDateKey(ov.toDateKey)) override = { status: "postponed", toDateKey: ov.toDateKey };
  else if (ov != null && ov.status != null) return NextResponse.json({ error: "invalid override" }, { status: 400 });

  try {
    if (!override) {
      await prisma.planDayOverride.deleteMany({ where: { userId: me.id, planId, date } });
    } else {
      const data = {
        status: override.status,
        postponedTo: override.status === "postponed" ? override.toDateKey : null,
      };
      await prisma.planDayOverride.upsert({
        where: { userId_planId_date: { userId: me.id, planId, date } },
        create: { userId: me.id, planId, date, ...data },
        update: data,
      });
    }
    return NextResponse.json({ ok: true });
  } catch {
    // table not migrated — accept the write so the UI stays optimistic; it lives
    // in the client cache until the migration runs.
    return NextResponse.json({ ok: true, persisted: false });
  }
}
