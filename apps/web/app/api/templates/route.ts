import { NextResponse } from "next/server";
import { FREE_TEMPLATE_LIMIT, type SessionBlock } from "@hybrid/core";
import { getOrCreateDbUser, entitlementOf } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// Reusable workout templates the user owns. GET lists; POST creates.
export async function GET(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const templates = await prisma.workoutTemplate.findMany({
    where: { ownerId: me.id },
    orderBy: { createdAt: "desc" },
  });
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
  });
  return NextResponse.json({ template }, { status: 201 });
}
