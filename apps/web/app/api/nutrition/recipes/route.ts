import { NextResponse } from "next/server";
import { FREE_RECIPE_LIMIT, MAX_RECIPE_INGREDIENTS } from "@hybrid/core";
import { getOrCreateDbUser, entitlementOf } from "@/lib/server-auth";
import { readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { ingredientRows, recipeFields } from "@/lib/recipe-shape";

// The athlete's own RECIPES — a list of real foods with real quantities whose
// macros are DERIVED (see @hybrid/core user-recipes.ts). GET lists; POST creates.
// Authoring is free, but a FREE client may keep at most FREE_RECIPE_LIMIT
// (mirrors access.canSaveRecipe). Owner-scoped (RLS + explicit where).
//
// SOFT-GUARDED ON GET: the tables are a later migration
// (reference/sql-nutrition-user-recipes.sql), so a database that predates them
// returns an empty library rather than 500-ing the whole Nutrition screen. POST
// cannot be soft-guarded into succeeding and reports the failure honestly.

export async function GET(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const recipes = await prisma.userRecipe.findMany({
      where: { userId: me.id },
      orderBy: { updatedAt: "desc" },
      include: { ingredients: { orderBy: { position: "asc" } } },
    });
    return NextResponse.json({ recipes, limit: FREE_RECIPE_LIMIT });
  } catch {
    return NextResponse.json({ recipes: [], limit: FREE_RECIPE_LIMIT });
  }
}

export async function POST(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Free clients keep up to FREE_RECIPE_LIMIT. Entitlement is read from the DB
  // row (source of truth) — never from user-writable Supabase metadata.
  if (me.role === "CLIENT" && entitlementOf(me) !== "paid") {
    let saved = 0;
    try {
      saved = await prisma.userRecipe.count({ where: { userId: me.id } });
    } catch {
      /* table not migrated — nothing saved, so nothing to cap */
    }
    if (saved >= FREE_RECIPE_LIMIT) {
      return NextResponse.json(
        {
          error: `Free includes ${FREE_RECIPE_LIMIT} recipes. Upgrade to Full for unlimited recipes.`,
          code: "upgrade_required",
        },
        { status: 403 },
      );
    }
  }

  // A recipe carries up to MAX_RECIPE_INGREDIENTS lines of eight numbers each,
  // so the body ceiling is larger than the meals route's — but still bounded.
  const parsed = await readJsonLimited<Record<string, unknown>>(request, 64 * 1024);
  if (parsed.error) return parsed.error;
  const b = parsed.data;

  if (typeof b.name !== "string" || !b.name.trim())
    return NextResponse.json({ error: "name is required" }, { status: 400 });

  const rows = ingredientRows(b.ingredients);
  if (rows.length > MAX_RECIPE_INGREDIENTS)
    return NextResponse.json({ error: `A recipe holds at most ${MAX_RECIPE_INGREDIENTS} ingredients.` }, { status: 400 });

  try {
    const recipe = await prisma.userRecipe.create({
      data: {
        userId: me.id,
        ...recipeFields(b),
        ingredients: { create: rows },
      },
      include: { ingredients: { orderBy: { position: "asc" } } },
    });
    return NextResponse.json({ recipe }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Recipes aren't available yet — run reference/sql-nutrition-user-recipes.sql.", code: "not_migrated" },
      { status: 503 },
    );
  }
}
