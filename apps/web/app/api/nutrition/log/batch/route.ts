import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { readJsonLimited } from "@/lib/guard";
import { writeFoodLog } from "@/lib/food-log-write";

// Write several diary entries in one round-trip — what copying a day does.
//
// A batch rather than N calls to /api/nutrition/log: a twelve-item day would
// otherwise be twelve requests each writing up to eight Signals, which is slow
// on a phone and leaves a half-copied day behind whenever the network drops
// mid-run. Each entry still goes through the SAME writeFoodLog the single-entry
// route uses, so a copied entry is not a special kind of entry.
//
// THE CLIENT OWNS THE CLOCK. Every entry arrives with its own `ts`, already
// retimed to the target day at the source entry's local time of day
// (@hybrid/core copy-day.ts). The server never computes "the same time of day
// tomorrow" — only the client knows the athlete's timezone, and getting that
// wrong would scatter a copied day across the wrong dates.
//
// NOT TRANSACTIONAL, and deliberately so. A FoodLog row is best-effort by
// design (it retries without the label panel on an un-migrated database, and
// falls through to Signals-only if the table is absent entirely), so wrapping
// the run in a transaction would turn a partial success the diary can display
// into a total failure it cannot. The response reports how many landed.

/** A day is at most a few dozen entries; the ceiling is a guard, not a limit
 *  anybody reaches. */
const MAX_ENTRIES = 60;

export async function POST(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = await readJsonLimited<Record<string, unknown>>(request, 128 * 1024);
  if (parsed.error) return parsed.error;

  const raw = parsed.data.entries;
  if (!Array.isArray(raw)) return NextResponse.json({ error: "entries must be an array" }, { status: 400 });
  if (raw.length > MAX_ENTRIES)
    return NextResponse.json({ error: `At most ${MAX_ENTRIES} entries per batch.` }, { status: 400 });

  const logs = [];
  let failed = 0;
  for (const e of raw) {
    // An unnamed line is not an entry — skipped rather than written as a blank.
    const log = await writeFoodLog(me.id, (e ?? {}) as Record<string, unknown>);
    if (log) logs.push(log);
    else failed++;
  }

  return NextResponse.json({ ok: true, written: logs.length, failed, logs }, { status: 201 });
}
