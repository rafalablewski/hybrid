import { NextResponse } from "next/server";
import { MAX_RECIPE_INGREDIENTS } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { ingredientRows, recipeFields } from "@/lib/recipe-shape";

// Edit or delete one of your own recipes.
//
// PATCH REPLACES THE INGREDIENT LIST WHOLESALE rather than diffing it. A recipe
// is edited as a document — lines are added, removed, reordered and re-measured
// in one sitting — so a per-line diff would be a great deal of machinery to
// arrive at the same rows, with an extra way to end up half-applied. The
// replacement runs inside a transaction, so a recipe is never briefly
// ingredient-less on disk. Ownership is checked BEFORE anything is written.

async function ownedRecipe(request: Request, id: string) {
  const me = await getOrCreateDbUser(request);
  if (!me) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  const r = await prisma.userRecipe.findUnique({ where: { id }, select: { id: true, userId: true } });
  if (!r) return { error: NextResponse.json({ error: "not found" }, { status: 404 }) };
  if (r.userId !== me.id) return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  return { me, recipe: r };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owned = await ownedRecipe(request, id);
  if ("error" in owned) return owned.error;

  const parsed = await readJsonLimited<Record<string, unknown>>(request, 64 * 1024);
  if (parsed.error) return parsed.error;
  const b = parsed.data;

  if (typeof b.name !== "string" || !b.name.trim())
    return NextResponse.json({ error: "name is required" }, { status: 400 });

  const rows = ingredientRows(b.ingredients);
  if (rows.length > MAX_RECIPE_INGREDIENTS)
    return NextResponse.json({ error: `A recipe holds at most ${MAX_RECIPE_INGREDIENTS} ingredients.` }, { status: 400 });

  const recipe = await prisma.$transaction(async (tx) => {
    await tx.userRecipeIngredient.deleteMany({ where: { recipeId: id } });
    return tx.userRecipe.update({
      where: { id },
      data: { ...recipeFields(b), ingredients: { create: rows } },
      include: { ingredients: { orderBy: { position: "asc" } } },
    });
  });

  return NextResponse.json({ recipe });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owned = await ownedRecipe(request, id);
  if ("error" in owned) return owned.error;
  // Ingredients cascade from the FK — see the schema.
  await prisma.userRecipe.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
