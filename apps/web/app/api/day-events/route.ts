import { NextResponse } from "next/server";
import { EVENT_LABEL_MAX, TRAINING_KINDS, sanitizeDeclaredEvents, type TrainingKind } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// THE ATHLETE'S OWN RACES, MEETS AND TESTS — the half of "what's on tomorrow"
// that no log can answer. A weekly five-a-side leaves a pattern the app detects
// on its own (weeklyFixture in packages/core/src/day-band.ts); a half marathon
// in six weeks leaves nothing at all until the day it happens, so it has to be
// declared. The day band is the only consumer — see day-events.ts, which holds
// the rule ordering a declared event against the plan's competition day and a
// detected fixture.
//
// Owner-only: every query is scoped to me.id, and the table's RLS
// (reference/sql-declared-events.sql) keeps it owner-only at the database too.
//
// Every handler tolerates the table not being migrated yet — until then the
// list degrades to empty and the band goes on taking tomorrow from a fixture
// and the plan, exactly as it did before this route existed. The write reports
// `persisted: false` rather than a fake success, because unlike a plan-day skip
// there is no client-side cache standing behind it: an event the athlete
// believes they declared and that silently went nowhere is worse than an error.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDateKey = (v: unknown): v is string => typeof v === "string" && DATE_RE.test(v);
const isKind = (v: unknown): v is TrainingKind =>
  typeof v === "string" && (TRAINING_KINDS as readonly string[]).includes(v);

/** How far back a listing reaches. The band only ever asks about today and
 *  tomorrow, but the screen that manages these shows what is coming and what
 *  just went, and an athlete's race history is worth keeping in view. */
const PAST_DAYS = 30;
const TAKE = 200;

const dayKeyAgo = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// GET /api/day-events → { events: DeclaredEvent[] } — soonest first.
export async function GET(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const rows = await prisma.declaredEvent.findMany({
      where: { userId: me.id, date: { gte: dayKeyAgo(PAST_DAYS) } },
      orderBy: { date: "asc" },
      take: TAKE,
    });
    // Through the SAME sanitizer the clients use, so a row written before a
    // kind was renamed cannot reach the band as something it does not know.
    return NextResponse.json({ events: sanitizeDeclaredEvents(rows) });
  } catch {
    // table not migrated yet — reference/sql-declared-events.sql
    return NextResponse.json({ events: [] });
  }
}

// POST /api/day-events  { date, kind, label? } → { event }
export async function POST(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (!isDateKey(b.date)) return NextResponse.json({ error: "date required (yyyy-mm-dd)" }, { status: 400 });
  if (!isKind(b.kind)) return NextResponse.json({ error: "unknown kind" }, { status: 400 });
  const label = typeof b.label === "string" ? b.label.trim().slice(0, EVENT_LABEL_MAX) : "";

  try {
    const row = await prisma.declaredEvent.create({
      data: { userId: me.id, date: b.date, kind: b.kind, label: label || null },
    });
    return NextResponse.json({ event: sanitizeDeclaredEvents([row])[0] ?? null }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "not available yet", persisted: false }, { status: 503 });
  }
}

// DELETE /api/day-events?id=... — how a declared event is corrected. There is
// deliberately no "not today?" dismissal for one: the band's correction exists
// because an INFERENCE can be wrong in a way the app cannot see, and an event
// the athlete typed is not the app's guess to withdraw.
export async function DELETE(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    // deleteMany with the userId guard — a stray id from another user deletes nothing.
    await prisma.declaredEvent.deleteMany({ where: { id, userId: me.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true, persisted: false });
  }
}
