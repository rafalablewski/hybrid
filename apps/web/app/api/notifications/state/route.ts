import { NextResponse } from "next/server";
import { applyNotifOps, DEFAULT_NOTIF_READ, normalizeNotifOp, normalizeNotifRead, type NotifOp, type NotifReadState } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// The notification read state, per ACCOUNT — the server-side home of
// @hybrid/core's NotifReadState. Both clients call this; the phone and the
// laptop now agree about what you've seen, held unread and thrown away.
//
// WRITES ARE DECISIONS, NOT BLOBS. POST takes NotifOp values ("read this id",
// "mark all read as of now") and applies them here with the SAME reducer the
// clients use. Syncing whole states would need a merge rule for "the phone says
// read, the laptop says unread" that nobody can state without inventing per-id
// timestamps; ops need no rule, because arrival order IS the order the athlete
// did them in.
//
// `synced: false` is a real answer and the clients depend on it: until
// reference/sql-notification-state.sql has been run, this degrades to
// per-device rather than 500-ing the bell — and the flag tells the client to
// keep trusting its local copy instead of adopting an empty server state and
// wiping what the device already knew. Same for signed out (401).

/** Ops accepted in one request. A client batches its queue; this bounds it. */
const MAX_OPS = 50;

const rowToState = (row: {
  seenAt: Date | null;
  readIds: string[];
  unreadIds: string[];
  dismissedIds: string[];
} | null): NotifReadState =>
  row
    ? normalizeNotifRead({
        seenAt: row.seenAt ? row.seenAt.getTime() : 0,
        readIds: row.readIds,
        unreadIds: row.unreadIds,
        dismissedIds: row.dismissedIds,
      })
    : DEFAULT_NOTIF_READ;

export async function GET(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const row = await prisma.notificationState.findUnique({ where: { userId: me.id } });
    return NextResponse.json({ state: rowToState(row), synced: true });
  } catch {
    // Table not migrated yet — the bell keeps working, per-device.
    return NextResponse.json({ state: DEFAULT_NOTIF_READ, synced: false });
  }
}

export async function POST(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { ops?: unknown; op?: unknown };
  const raw = Array.isArray(body.ops) ? body.ops : body.op != null ? [body.op] : [];
  // The clock is OURS, not the device's: an op stamped in the future would push
  // the watermark past every row and mark the lot read for good.
  const now = Date.now();
  const ops = raw
    .slice(0, MAX_OPS)
    .map((o) => normalizeNotifOp(o, now))
    .filter((o): o is NotifOp => o !== null);
  if (!ops.length) return NextResponse.json({ error: "no valid ops" }, { status: 400 });

  try {
    // Read-modify-write. Not locked, deliberately: the ops in one request come
    // from one device's queue, so the only race is two devices writing inside
    // the same few milliseconds, and the cost of losing that coin-flip is one
    // row's read state — which the next op from either device corrects.
    const current = rowToState(await prisma.notificationState.findUnique({ where: { userId: me.id } }));
    const next = applyNotifOps(current, ops);
    await prisma.notificationState.upsert({
      where: { userId: me.id },
      create: {
        userId: me.id,
        seenAt: next.seenAt ? new Date(next.seenAt) : null,
        readIds: next.readIds,
        unreadIds: next.unreadIds,
        dismissedIds: next.dismissedIds,
      },
      update: {
        seenAt: next.seenAt ? new Date(next.seenAt) : null,
        readIds: next.readIds,
        unreadIds: next.unreadIds,
        dismissedIds: next.dismissedIds,
      },
    });
    return NextResponse.json({ state: next, synced: true });
  } catch {
    // Not migrated: accept the decision for this device (it has already applied
    // it locally) without claiming it was stored.
    return NextResponse.json({ state: applyNotifOps(DEFAULT_NOTIF_READ, ops), synced: false });
  }
}
