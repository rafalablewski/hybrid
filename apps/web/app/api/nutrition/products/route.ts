import { NextResponse } from "next/server";
import { getOrCreateDbUser, entitlementOf } from "@/lib/server-auth";
import { readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";

// The user's custom FOOD PRODUCT library (FoodProduct) — reusable foods with
// per-serving macros, the offline half of the (blocked) food database. GET lists;
// POST creates. Full-only to CREATE (mirrors access.canSaveProduct): a free client
// gets a 403 upgrade_required. Owner-scoped (RLS + explicit where).

const int = (v: unknown, max: number): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(Math.round(n), max);
};

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

  // Saving custom products is a Full feature. Entitlement from the DB row (source
  // of truth) — never from user-writable Supabase metadata.
  if (me.role === "CLIENT" && entitlementOf(me) !== "paid") {
    return NextResponse.json(
      { error: "Saving custom products is a Full feature. Upgrade to build your food library.", code: "upgrade_required" },
      { status: 403 },
    );
  }

  const parsed = await readJsonLimited<Record<string, unknown>>(request, 8 * 1024);
  if (parsed.error) return parsed.error;
  const b = parsed.data as { name?: unknown; servingLabel?: unknown; kcal?: unknown; protein?: unknown; carbs?: unknown; fat?: unknown };

  if (typeof b.name !== "string" || !b.name.trim())
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  const protein = int(b.protein, 500) ?? 0;
  const carbs = int(b.carbs, 1000) ?? 0;
  const fat = int(b.fat, 500) ?? 0;
  const kcal = int(b.kcal, 10000) ?? protein * 4 + carbs * 4 + fat * 9;

  const product = await prisma.foodProduct.create({
    data: {
      userId: me.id,
      name: b.name.trim().slice(0, 80),
      servingLabel: typeof b.servingLabel === "string" && b.servingLabel.trim() ? b.servingLabel.trim().slice(0, 40) : "1 serving",
      kcal,
      protein,
      carbs,
      fat,
    },
  });
  return NextResponse.json({ product }, { status: 201 });
}
