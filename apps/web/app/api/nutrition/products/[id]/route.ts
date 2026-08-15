import { NextResponse } from "next/server";
import { parseFoodPortions } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/** The label-panel columns an edit may touch. */
const PANEL_FIELDS = ["satFat", "sugar", "fiber", "salt"] as const;

/** The same readers the create route validates with — one definition, so an
 *  edit cannot write a figure a create would have refused. */
const int = (v: unknown, max: number): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(Math.round(n), max);
};
const panel = (v: unknown): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n * 10) / 10, 1000) : null;
};

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
 * Amend a custom product you own.
 *
 * Editing a saved food has to be possible AT ALL: "delete it and create it
 * again" mints a new id and quietly breaks every recipe ingredient pointing at
 * the old one (the same trap the pantry's held delete exists to avoid), so
 * without this, a typo in a serving label was permanent for anything a recipe
 * used. It also matters for portions specifically, since every food saved
 * before the catalog lookup existed has none.
 *
 * Only the keys PRESENT in the body change. An absent key is untouched, so a
 * client that knows about one field can never blank one it has never heard of —
 * and a `null` for an optional field is a deliberate clearing, not an accident.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const p = await prisma.foodProduct.findUnique({ where: { id } });
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (p.userId !== me.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await readJsonLimited<Record<string, unknown>>(request, 8 * 1024);
  if (parsed.error) return parsed.error;
  const b = parsed.data as Record<string, unknown>;

  // The macros and the label panel are validated by the SAME readers the create
  // route uses, so an edit can never write a value a create would have refused.
  const data: Record<string, unknown> = {};
  if ("name" in b) {
    if (typeof b.name !== "string" || !b.name.trim())
      return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    data.name = b.name.trim().slice(0, 80);
  }
  if ("subname" in b) data.subname = typeof b.subname === "string" && b.subname.trim() ? b.subname.trim().slice(0, 60) : null;
  if ("servingLabel" in b && typeof b.servingLabel === "string" && b.servingLabel.trim())
    data.servingLabel = b.servingLabel.trim().slice(0, 40);
  if ("protein" in b) data.protein = int(b.protein, 500) ?? 0;
  if ("carbs" in b) data.carbs = int(b.carbs, 1000) ?? 0;
  if ("fat" in b) data.fat = int(b.fat, 500) ?? 0;
  if ("kcal" in b) data.kcal = int(b.kcal, 10000) ?? 0;
  if (Object.keys(data).length === 0 && !("portions" in b) && !("servingGrams" in b)
      && !PANEL_FIELDS.some((k) => k in b))
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  // The panel, the serving weight and the portions are all LATER migrations, so
  // they go in a second attempt: a database missing the portions column must
  // still be able to rename a food, rather than failing the whole edit on a
  // column the client happened to mention.
  const late: Record<string, unknown> = {};
  if ("servingGrams" in b) late.servingGrams = panel(b.servingGrams);
  for (const k of PANEL_FIELDS) if (k in b) late[k] = panel(b[k]);
  if ("portions" in b) late.portions = parseFoodPortions(b.portions) as unknown as Prisma.InputJsonValue;

  try {
    const product = await prisma.foodProduct.update({ where: { id }, data: { ...data, ...late } });
    return NextResponse.json({ product });
  } catch {
    if (Object.keys(data).length === 0)
      return NextResponse.json({ error: "those fields are not available on this database yet" }, { status: 503 });
    const product = await prisma.foodProduct.update({ where: { id }, data });
    return NextResponse.json({ product, partial: true });
  }
}
