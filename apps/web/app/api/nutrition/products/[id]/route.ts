import { NextResponse } from "next/server";
import { parseFoodPortions } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

// Delete a custom product you own.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const p = await prisma.foodProduct.findUnique({ where: { id } });
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (p.userId !== me.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await prisma.foodProduct.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

/**
 * Amend a custom product you own — today, the PORTIONS it comes in.
 *
 * Recording a portion has to be possible for a food that is ALREADY saved:
 * every food saved before the catalog lookup existed has no portions on it, and
 * "delete it and create it again" would mint a new id and quietly break every
 * recipe ingredient pointing at the old one (the same trap the pantry's held
 * delete exists to avoid).
 *
 * Only the keys PRESENT in the body change. An absent key is untouched, so a
 * client that knows about one field can never blank one it has never heard of.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const p = await prisma.foodProduct.findUnique({ where: { id } });
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (p.userId !== me.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await readJsonLimited<Record<string, unknown>>(request, 4 * 1024);
  if (parsed.error) return parsed.error;
  const b = parsed.data as { portions?: unknown };

  const data: { portions?: Prisma.InputJsonValue } = {};
  if ("portions" in b) data.portions = parseFoodPortions(b.portions) as unknown as Prisma.InputJsonValue;
  if (Object.keys(data).length === 0)
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  // The column is a later migration (reference/sql-food-portions.sql). A
  // database that predates it cannot record a portion, and says so rather than
  // 500-ing.
  try {
    const product = await prisma.foodProduct.update({ where: { id }, data });
    return NextResponse.json({ product });
  } catch {
    return NextResponse.json({ error: "portions are not available on this database yet" }, { status: 503 });
  }
}
