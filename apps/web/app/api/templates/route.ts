import { NextResponse } from "next/server";
import type { SessionBlock } from "@hybrid/core";
import { getOrCreateDbUser, getAuthEntitlement } from "@/lib/server-auth";
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

  // The builder (authoring your own workouts) is a paid (Full/athlete) action.
  // A free CLIENT — including a coached client — can VIEW what's assigned but
  // must upgrade to create/edit records. Coaches & admins author by role.
  if (me.role === "CLIENT") {
    const ent = await getAuthEntitlement(request);
    if (ent !== "paid") {
      return NextResponse.json(
        { error: "Upgrade to Full to create your own workouts.", code: "upgrade_required" },
        { status: 403 },
      );
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
