-- HYBRID — Nutrition library: SavedMeal + FoodProduct.
-- Run in the Supabase SQL Editor. Mirrors prisma/schema.prisma models
-- SavedMeal + FoodProduct. Idempotent.
--
-- The personal Nutrition library the redesigned panel writes to:
--   • SavedMeal   — a meal the user built (name + single-number macros). FREE
--                   users keep up to FREE_MEAL_LIMIT (access.ts, currently 4);
--                   Full is unlimited. Owner-only.
--   • FoodProduct — a custom food with per-serving macros (the offline half of
--                   the blocked food database). Full-only to CREATE; owner-only.
--
-- PREREQUISITE: run reference/rls-policies.sql FIRST — it defines
-- public.app_user_id(); without it the policy statements error and (in a single
-- transaction) roll the tables back.
--
-- HARD DEPENDENCY: once the Prisma client carries these models, the owner's
-- GET/POST /api/nutrition/meals + /products query them — so run this BEFORE the
-- change reaches production, or those routes 500 against a DB that lacks them.

-- ── SavedMeal ────────────────────────────────────────────────────────────
create table if not exists "SavedMeal" (
  "id"        text primary key default gen_random_uuid()::text,
  "userId"    text not null references "User"("id") on delete cascade,
  "name"      text not null,
  "emoji"     text,
  "kcal"      integer not null,
  "protein"   integer not null,
  "carbs"     integer not null,
  "fat"       integer not null,
  "createdAt" timestamp(3) not null default now()
);
create index if not exists "SavedMeal_userId_createdAt_idx" on "SavedMeal" ("userId", "createdAt");

alter table "SavedMeal" enable row level security;

-- the user owns their saved meals (only owner reads/writes)
drop policy if exists savedmeal_own on "SavedMeal";
create policy savedmeal_own on "SavedMeal" for all
  using ("userId" = public.app_user_id())
  with check ("userId" = public.app_user_id());

-- ── FoodProduct ──────────────────────────────────────────────────────────
create table if not exists "FoodProduct" (
  "id"           text primary key default gen_random_uuid()::text,
  "userId"       text not null references "User"("id") on delete cascade,
  "name"         text not null,
  "servingLabel" text not null default '1 serving',
  "kcal"         integer not null,
  "protein"      integer not null,
  "carbs"        integer not null,
  "fat"          integer not null,
  "createdAt"    timestamp(3) not null default now()
);
create index if not exists "FoodProduct_userId_createdAt_idx" on "FoodProduct" ("userId", "createdAt");

alter table "FoodProduct" enable row level security;

-- the user owns their custom products (only owner reads/writes)
drop policy if exists foodproduct_own on "FoodProduct";
create policy foodproduct_own on "FoodProduct" for all
  using ("userId" = public.app_user_id())
  with check ("userId" = public.app_user_id());
