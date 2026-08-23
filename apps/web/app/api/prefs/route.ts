import { NextResponse } from "next/server";
import { sanitizeSyncedPrefs, SYNCED_PREF_KEYS } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";

// Per-user SYNCED PREFERENCES — the settings that follow the account rather
// than the handset (pinned lifts and sports, units, rest days, where a screen
// was left, which one-shot hints have been seen). Stored as a JSONB column on
// User (reference/sql-user-prefs.sql), allowlisted by packages/core
// synced-prefs.ts.
//
// RAW QUERIES, so the app runs safely BEFORE the column is migrated: a missing
// column reads as {} and writes soft-degrade to a 503, exactly like
// /api/plan-maxes and the other reference-SQL-gated features. The clients keep
// a local copy as a fast cache and an offline fallback, and push it up on the
// first read after the column lands, so nothing an athlete already chose is
// lost by shipping this.
//
// THE PATCH MERGES PER KEY. `prefs || patch` is a shallow jsonb merge, so a
// write only ever touches the keys it names — the phone changing units and the
// iPad changing the Today range cannot drop each other's change, which a
// whole-blob write would let them do. A key sent as `null` is REMOVED rather
// than stored, which is how a client says "forget this".

/** A patch can't name more keys than exist, and each value is already capped
 *  by the core sanitiser. Belt and braces against a hostile payload. */
const MAX_PATCH_KEYS = SYNCED_PREF_KEYS.length;

export async function GET(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let prefs: Record<string, unknown> = {};
  try {
    const rows = await prisma.$queryRaw<{ prefs: unknown }[]>`
      SELECT "prefs" FROM "User" WHERE id = ${user.id} LIMIT 1
    `;
    prefs = sanitizeSyncedPrefs(rows[0]?.prefs);
  } catch {
    // Column not migrated yet — no server-side prefs, and the clients keep
    // their on-device copy. Not an error from the caller's point of view.
  }
  return NextResponse.json({ prefs });
}

export async function PUT(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = await readJsonLimited<{ patch?: unknown }>(request, 64 * 1024);
  if (parsed.error) return parsed.error;

  const patch = sanitizeSyncedPrefs(parsed.data.patch);
  const keys = Object.keys(patch);
  if (keys.length === 0) return NextResponse.json({ ok: true, prefs: {} });
  if (keys.length > MAX_PATCH_KEYS) {
    return NextResponse.json({ error: "too many keys" }, { status: 400 });
  }

  // Split the patch: values to merge in, and keys to forget.
  const drop = keys.filter((k) => patch[k] === null);
  const set: Record<string, unknown> = {};
  for (const k of keys) if (patch[k] !== null) set[k] = patch[k];

  try {
    if (Object.keys(set).length > 0) {
      await prisma.$executeRaw`
        UPDATE "User"
           SET "prefs" = COALESCE("prefs", '{}'::jsonb) || ${JSON.stringify(set)}::jsonb
         WHERE id = ${user.id}
      `;
    }
    // `- text[]` removes each named key from the object in one statement.
    if (drop.length > 0) {
      await prisma.$executeRaw`
        UPDATE "User"
           SET "prefs" = COALESCE("prefs", '{}'::jsonb) - ${drop}::text[]
         WHERE id = ${user.id}
      `;
    }
  } catch {
    return NextResponse.json(
      { error: "Synced preferences aren't enabled yet — run reference/sql-user-prefs.sql." },
      { status: 503 },
    );
  }

  let prefs: Record<string, unknown> = {};
  try {
    const rows = await prisma.$queryRaw<{ prefs: unknown }[]>`
      SELECT "prefs" FROM "User" WHERE id = ${user.id} LIMIT 1
    `;
    prefs = sanitizeSyncedPrefs(rows[0]?.prefs);
  } catch {
    /* read-back is a courtesy; the write already succeeded */
  }
  return NextResponse.json({ ok: true, prefs });
}
