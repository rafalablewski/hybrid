import { NextResponse } from "next/server";
import { FREE_PRODUCT_LIMIT, parsePackSize } from "@hybrid/core";
import { getOrCreateDbUser, entitlementOf } from "@/lib/server-auth";
import { readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";

// The user's custom FOOD PRODUCT library (FoodProduct) — reusable foods with
// per-serving macros, the offline half of the (blocked) food database. GET lists;
// POST creates. Free clients keep up to FREE_PRODUCT_LIMIT (mirrors
// access.canSaveProduct); a 403 upgrade_required lands at the cap. Owner-scoped
// (RLS + explicit where).

const int = (v: unknown, max: number): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(Math.round(n), max);
};

// A LABEL-PANEL field (saturates / sugars / fibre / salt), in grams. Absence
// survives as null — an unstated value is NOT a zero, and the clients render
// "—" for null. Kept to 1 dp, the precision food labels are stated at.
const panel = (v: unknown): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n * 10) / 10, 1000) : null;
};


// The athlete's own word for the container ("bottle", "tub"). Short, because it
// is printed inside a stepper's caption and not a description field.
export const packLabelOf = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, 24) : null;

export async function GET(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const products = await prisma.foodProduct.findMany({
    where: { userId: me.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ products });
}

export async function POST(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Free clients keep up to FREE_PRODUCT_LIMIT saved products. Entitlement from
  // the DB row (source of truth) — never from user-writable Supabase metadata.
  if (me.role === "CLIENT" && entitlementOf(me) !== "paid") {
    const saved = await prisma.foodProduct.count({ where: { userId: me.id } });
    if (saved >= FREE_PRODUCT_LIMIT) {
      return NextResponse.json(
        { error: `Free includes ${FREE_PRODUCT_LIMIT} saved products. Upgrade to Full for an unlimited food library.`, code: "upgrade_required" },
        { status: 403 },
      );
    }
  }

  const parsed = await readJsonLimited<Record<string, unknown>>(request, 8 * 1024);
  if (parsed.error) return parsed.error;
  const b = parsed.data as {
    name?: unknown; subname?: unknown; servingLabel?: unknown; servingGrams?: unknown;
    packSize?: unknown; packLabel?: unknown;
    kcal?: unknown; protein?: unknown; carbs?: unknown; fat?: unknown;
    satFat?: unknown; sugar?: unknown; fiber?: unknown; salt?: unknown; verifiedId?: unknown;
  };

  if (typeof b.name !== "string" || !b.name.trim())
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  const protein = int(b.protein, 500) ?? 0;
  const carbs = int(b.carbs, 1000) ?? 0;
  const fat = int(b.fat, 500) ?? 0;
  const kcal = int(b.kcal, 10000) ?? protein * 4 + carbs * 4 + fat * 9;

  const base = {
    userId: me.id,
    name: b.name.trim().slice(0, 80),
    subname: typeof b.subname === "string" && b.subname.trim() ? b.subname.trim().slice(0, 60) : null,
    servingLabel: typeof b.servingLabel === "string" && b.servingLabel.trim() ? b.servingLabel.trim().slice(0, 40) : "1 serving",
    kcal,
    protein,
    carbs,
    fat,
  };
  // The label panel + provenance are a later migration
  // (reference/sql-nutrition-label-panel.sql). Try WITH them, and fall back to
  // the four macros so saving a food never fails on a database that predates it.
  let product;
  try {
    product = await prisma.foodProduct.create({
      data: {
        ...base,
        servingGrams: panel(b.servingGrams),
        // THE PACK — how big the bottle/tub/pack is, in the serving's own
        // measure, plus what the athlete calls it. Both nullable: most foods
        // are not bought in a container worth naming.
        packSize: parsePackSize(b.packSize),
        packLabel: packLabelOf(b.packLabel),
        satFat: panel(b.satFat),
        sugar: panel(b.sugar),
        fiber: panel(b.fiber),
        salt: panel(b.salt),
        verifiedId: typeof b.verifiedId === "string" && b.verifiedId.trim() ? b.verifiedId.trim().slice(0, 60) : null,
      },
    });
  } catch {
    product = await prisma.foodProduct.create({ data: base });
  }
  return NextResponse.json({ product }, { status: 201 });
}
