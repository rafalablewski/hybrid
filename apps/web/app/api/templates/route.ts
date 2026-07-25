import { NextResponse } from "next/server";
import { FREE_TEMPLATE_LIMIT, type SessionBlock } from "@hybrid/core";
import { getOrCreateDbUser, entitlementOf } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// Reusable workout templates the user owns. GET lists; POST creates.
export async function GET(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Explicit select of the STABLE columns only — never `favourite`, which may not
  // be migrated yet (schema.prisma carries it, but the DB column is added by
  // reference/sql-routine-favourite.sql). Selecting it here would break the whole
  // list before the migration; instead the star is merged from a guarded raw
  // sub-query below (plan-maxes soft-guard idiom).
  const rows = await prisma.workoutTemplate.findMany({
    where: { ownerId: me.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, description: true, blocks: true, createdAt: true },
  });

  // Which of them are favourited. A missing column just yields no favourites —
  // not an error from the caller's point of view.
  const favourites = new Set<string>();
  try {
    const favRows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "WorkoutTemplate" WHERE "ownerId" = ${me.id} AND "favourite" = true
    `;
    for (const r of favRows) favourites.add(r.id);
  } catch {
    // Column not migrated yet — every routine reads as not-favourite.
  }

  const templates = rows.map((t) => ({ ...t, favourite: favourites.has(t.id) }));
  return NextResponse.json({ templates });
}

export async function POST(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // The Builder is free, but a FREE client may keep at most FREE_TEMPLATE_LIMIT
  // saved templates — saving more is the paid (Full) upgrade. Coaches & admins
  // author by role; paid clients are unlimited.
  if (me.role === "CLIENT") {
    // Read entitlement from the DB row (source of truth) — never from
    // user-writable Supabase metadata, which a free user can self-set to 'paid'.
    if (entitlementOf(me) !== "paid") {
      const saved = await prisma.workoutTemplate.count({ where: { ownerId: me.id } });
      if (saved >= FREE_TEMPLATE_LIMIT) {
        return NextResponse.json(
          {
            error: `Free includes ${FREE_TEMPLATE_LIMIT} saved templates. Upgrade to Full for unlimited templates.`,
            code: "upgrade_required",
          },
          { status: 403 },
        );
      }
    }
  }

  const b = (await request.json().catch(() => ({}))) as { name?: unknown; description?: unknown; blocks?: unknown };
  if (typeof b.name !== "string" || !b.name.trim())
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (!Array.isArray(b.blocks))
    return NextResponse.json({ error: "blocks must be an array" }, { status: 400 });

  const template = await prisma.workoutTemplate.create({
    data: {
      ownerId: me.id,
      name: b.name.trim().slice(0, 120),
      description: typeof b.description === "string" ? b.description.trim().slice(0, 500) : null,
      blocks: b.blocks as unknown as SessionBlock[] as object,
    },
    // Don't RETURN `favourite` — the column may not be migrated yet (see GET).
    select: { id: true, name: true, description: true, blocks: true, createdAt: true },
  });
  return NextResponse.json({ template: { ...template, favourite: false } }, { status: 201 });
}
