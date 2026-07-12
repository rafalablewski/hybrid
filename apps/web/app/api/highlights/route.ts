import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// Highlight curation — the owner's PRIVATE arrangement of their public Overview
// grid (Profile → Overview, Apple-style edit mode). Two pieces of state:
//   • hidden — the set of tile keys kept OFF the public grid.
//   • order  — the chosen left-to-right arrangement of the visible tiles.
// GET returns both; POST toggles a hide ({ key, hidden }) or replaces the order
// ({ order: string[] }). Owner-only (RLS in reference/sql-private-tab.sql).
export async function GET(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rows = await prisma.hiddenHighlight.findMany({ where: { userId: me.id }, select: { key: true } });
  // The order is best-effort — until reference/sql-private-tab.sql (section 4)
  // creates HighlightOrder, this degrades to an empty arrangement rather than
  // 500-ing the whole grid (hide/show keeps working regardless).
  const order = await readOrder(me.id);
  return NextResponse.json({ hidden: rows.map((r) => r.key), order });
}

async function readOrder(userId: string): Promise<string[]> {
  try {
    const ord = await prisma.highlightOrder.findUnique({ where: { userId }, select: { keys: true } });
    return ord?.keys ?? [];
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  // Reorder — replace the whole arrangement in one write. Keys are sanitised and
  // de-duped; the client sends the full ordered list of visible tile keys.
  if (Array.isArray(b.order)) {
    const keys = [...new Set(
      b.order.filter((k): k is string => typeof k === "string").map((k) => k.trim().slice(0, 120)).filter(Boolean),
    )].slice(0, 24);
    try {
      await prisma.highlightOrder.upsert({
        where: { userId: me.id },
        create: { userId: me.id, keys },
        update: { keys },
      });
    } catch {
      // HighlightOrder table not migrated yet — accept the reorder for this
      // session (the client already applied it) without persisting.
      return NextResponse.json({ order: keys });
    }
    return NextResponse.json({ order: await readOrder(me.id) });
  }

  // Hide / show one tile.
  const key = typeof b.key === "string" ? b.key.trim().slice(0, 120) : "";
  if (!key) return NextResponse.json({ error: "key or order required" }, { status: 400 });
  if (b.hidden === true) {
    // Idempotent hide — the @@unique([userId, key]) makes a re-hide a no-op.
    await prisma.hiddenHighlight.upsert({
      where: { userId_key: { userId: me.id, key } },
      create: { userId: me.id, key },
      update: {},
    });
  } else {
    await prisma.hiddenHighlight.deleteMany({ where: { userId: me.id, key } });
  }
  const rows = await prisma.hiddenHighlight.findMany({ where: { userId: me.id }, select: { key: true } });
  return NextResponse.json({ hidden: rows.map((r) => r.key) });
}
