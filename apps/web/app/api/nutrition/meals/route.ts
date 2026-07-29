import { NextResponse } from "next/server";
import { FREE_MEAL_LIMIT } from "@hybrid/core";
import { getOrCreateDbUser, entitlementOf } from "@/lib/server-auth";
import { readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";

// The user's personal MEAL library (SavedMeal) — meals they built themselves for
// one-tap logging. GET lists; POST creates. Building a meal is free, but a FREE
// client may keep at most FREE_MEAL_LIMIT saved meals (mirrors access.canSaveMeal);
// saving more is the paid (Full) upgrade. Owner-scoped (RLS + explicit where).

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


export async function GET(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const meals = await prisma.savedMeal.findMany({
    where: { userId: me.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ meals, limit: FREE_MEAL_LIMIT });
}

export async function POST(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Free clients keep up to FREE_MEAL_LIMIT saved meals. Read entitlement from
  // the DB row (source of truth) — never from user-writable Supabase metadata.
  if (me.role === "CLIENT" && entitlementOf(me) !== "paid") {
    const saved = await prisma.savedMeal.count({ where: { userId: me.id } });
    if (saved >= FREE_MEAL_LIMIT) {
      return NextResponse.json(
        {
          error: `Free includes ${FREE_MEAL_LIMIT} saved meals. Upgrade to Full for unlimited meals.`,
          code: "upgrade_required",
        },
        { status: 403 },
      );
    }
  }

  const parsed = await readJsonLimited<Record<string, unknown>>(request, 8 * 1024);
  if (parsed.error) return parsed.error;
  const b = parsed.data as {
    name?: unknown; subname?: unknown; emoji?: unknown;
    kcal?: unknown; protein?: unknown; carbs?: unknown; fat?: unknown;
    satFat?: unknown; sugar?: unknown; fiber?: unknown; salt?: unknown;
  };

  if (typeof b.name !== "string" || !b.name.trim())
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  const protein = int(b.protein, 500) ?? 0;
  const carbs = int(b.carbs, 1000) ?? 0;
  const fat = int(b.fat, 500) ?? 0;
  // kcal may be sent explicitly; otherwise derive from the macros (4·4·9) so a
  // meal's stored total always matches what it logs.
  const kcal = int(b.kcal, 10000) ?? protein * 4 + carbs * 4 + fat * 9;

  const base = {
    userId: me.id,
    name: b.name.trim().slice(0, 80),
    subname: typeof b.subname === "string" && b.subname.trim() ? b.subname.trim().slice(0, 60) : null,
    emoji: typeof b.emoji === "string" && b.emoji ? [...b.emoji][0] : null,
    kcal,
    protein,
    carbs,
    fat,
  };
  // Panel fields are a later migration — same two-attempt fallback as products,
  // so saving a meal never fails on a database that predates the columns.
  let meal;
  try {
    meal = await prisma.savedMeal.create({
      data: { ...base, satFat: panel(b.satFat), sugar: panel(b.sugar), fiber: panel(b.fiber), salt: panel(b.salt) },
    });
  } catch {
    meal = await prisma.savedMeal.create({ data: base });
  }
  return NextResponse.json({ meal }, { status: 201 });
}
