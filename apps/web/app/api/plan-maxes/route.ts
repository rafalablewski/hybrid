import { NextResponse } from "next/server";
import { PLAN_MAX_BOUNDS, keep } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";

// Per-user training maxes (the 1RMs the discipline-shaped plans derive working
// loads from). Stored as a JSONB column on User (reference/sql-plan-maxes.sql).
// Accessed via RAW queries so the app runs safely BEFORE the column is migrated:
// a missing column simply reads as {} and writes soft-degrade to a 503, exactly
// like the other reference-SQL-gated features. The clients mirror the map
// on-device (localStorage / AsyncStorage) and hydrate/write-through here.

/**
 * Keep only sane entries: string keys (≤ 40 chars) → a storable 1RM, capped at
 * 50 keys so a bad payload can't bloat the row.
 *
 * A TYPED MAX IS NOT A HISTORY, IT IS AN INSTRUCTION. Everything else in this
 * app records what happened; this number is multiplied into every working set a
 * percent-based plan writes, so a mistyped max does not sit quietly in a trend —
 * it walks the athlete into a bar they cannot hold. The old bound was
 * `n < 100000`, which accepted a 99 999 kg squat and prescribed 85% of it.
 * PLAN_MAX_BOUNDS refuses anything past 600 kg, which is above the heaviest
 * barbell lift ever performed.
 */
function sanitizeMaxes(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!k || k.length > 40) continue;
    const n = typeof v === "number" ? v : Number(v);
    if (keep(n, PLAN_MAX_BOUNDS) != null) out[k] = Math.round(n * 100) / 100;
    if (Object.keys(out).length >= 50) break;
  }
  return out;
}

export async function GET(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let maxes: Record<string, number> = {};
  try {
    const rows = await prisma.$queryRaw<{ planMaxes: unknown }[]>`
      SELECT "planMaxes" FROM "User" WHERE id = ${user.id} LIMIT 1
    `;
    maxes = sanitizeMaxes(rows[0]?.planMaxes);
  } catch {
    // Column not migrated yet — no server-side maxes (the clients keep their
    // on-device copy). Not an error from the caller's point of view.
  }
  return NextResponse.json({ maxes });
}

export async function PUT(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = await readJsonLimited<{ maxes?: unknown }>(request, 8 * 1024);
  if (parsed.error) return parsed.error;
  const maxes = sanitizeMaxes(parsed.data.maxes);

  try {
    await prisma.$executeRaw`
      UPDATE "User" SET "planMaxes" = ${JSON.stringify(maxes)}::jsonb WHERE id = ${user.id}
    `;
  } catch {
    return NextResponse.json(
      { error: "Plan maxes aren't enabled yet — run reference/sql-plan-maxes.sql.", maxes },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true, maxes });
}
