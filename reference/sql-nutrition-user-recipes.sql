-- HYBRID — Nutrition: UserRecipe + UserRecipeIngredient.
-- Run in the Supabase SQL Editor. Mirrors prisma/schema.prisma models
-- UserRecipe + UserRecipeIngredient. Idempotent.
--
-- A recipe the ATHLETE authored, as opposed to the curated read-only library in
-- packages/core/src/recipes.ts (editorial content — no rows, no table).
--
-- THE SHAPE FOLLOWS ONE RULE: a user recipe's macros are DERIVED, never typed.
-- Nobody knows the macros of the pasta they invented; they know what went into
-- it. So "UserRecipe" carries NO nutrition columns at all — every figure is
-- summed from its ingredients by @hybrid/core's user-recipes.ts, which routes
-- through food-facts.sumFacts so a recipe total obeys the same
-- not-stated-is-not-zero rule a day total does.
--
-- The ingredient's facts are a SNAPSHOT, stored even when "productId" links the
-- line back to a saved FoodProduct. A deleted product must not silently
-- under-total a recipe, and a recipe is a record of what you MADE — correcting a
-- product in March did not change the food you ate in February. The link
-- survives for provenance and for staleIngredients(), which REPORTS drift so the
-- athlete can refresh it deliberately rather than having it applied behind them.
--
-- PREREQUISITE: run reference/rls-policies.sql FIRST — it defines
-- public.app_user_id(); without it the policy statements error and (in a single
-- transaction) roll the tables back.
--
-- HARD DEPENDENCY: once the Prisma client carries these models, GET/POST
-- /api/nutrition/recipes query them — so run this BEFORE the change reaches
-- production, or those routes 500 against a DB that lacks the tables. (The
-- routes are soft-guarded to return an empty list rather than throwing, but a
-- POST cannot be soft-guarded into succeeding.)

-- ── UserRecipe ───────────────────────────────────────────────────────────
create table if not exists "UserRecipe" (
  "id"        text primary key default gen_random_uuid()::text,
  "userId"    text not null references "User"("id") on delete cascade,
  "name"      text not null,
  "note"      text,
  "emoji"     text,
  "servings"  integer not null default 1,
  "timeMins"  integer,
  "createdAt" timestamp(3) not null default now(),
  "updatedAt" timestamp(3) not null default now()
);
create index if not exists "UserRecipe_userId_updatedAt_idx" on "UserRecipe" ("userId", "updatedAt");

alter table "UserRecipe" enable row level security;

-- the user owns their recipes (only owner reads/writes)
drop policy if exists userrecipe_own on "UserRecipe";
create policy userrecipe_own on "UserRecipe" for all
  using ("userId" = public.app_user_id())
  with check ("userId" = public.app_user_id());

-- ── UserRecipeIngredient ─────────────────────────────────────────────────
-- NULL on satFat/sugar/fiber/salt means the food never STATED that value. It is
-- not a zero, and the clients render an em dash for it. Never default these.
create table if not exists "UserRecipeIngredient" (
  "id"           text primary key default gen_random_uuid()::text,
  "recipeId"     text not null references "UserRecipe"("id") on delete cascade,
  "name"         text not null,
  "qty"          double precision not null default 1,
  "servingLabel" text not null default '1 serving',
  "kcal"         double precision not null,
  "protein"      double precision not null,
  "carbs"        double precision not null,
  "fat"          double precision not null,
  "satFat"       double precision,
  "sugar"        double precision,
  "fiber"        double precision,
  "salt"         double precision,
  "productId"    text,
  "verifiedId"   text,
  "position"     integer not null default 0
);
create index if not exists "UserRecipeIngredient_recipeId_position_idx"
  on "UserRecipeIngredient" ("recipeId", "position");

alter table "UserRecipeIngredient" enable row level security;

-- An ingredient has no userId of its own — ownership is its recipe's. The
-- policy therefore joins back to "UserRecipe" rather than duplicating the owner
-- column, so a recipe and its lines can never disagree about who they belong to.
drop policy if exists userrecipeingredient_own on "UserRecipeIngredient";
create policy userrecipeingredient_own on "UserRecipeIngredient" for all
  using (exists (
    select 1 from "UserRecipe" r
    where r."id" = "UserRecipeIngredient"."recipeId"
      and r."userId" = public.app_user_id()
  ))
  with check (exists (
    select 1 from "UserRecipe" r
    where r."id" = "UserRecipeIngredient"."recipeId"
      and r."userId" = public.app_user_id()
  ));
