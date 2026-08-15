-- HYBRID — custom food portions: the pack a food comes in.
-- Run in the Supabase SQL Editor. Mirrors prisma/schema.prisma model FoodProduct
-- (and prisma/migrations/20260815120000_food_pack). Idempotent.
--
-- WHAT THIS IS FOR
-- The portion editor could only count SERVINGS. A food saved the way a label is
-- written — "100 g, 50 kcal" — could therefore be logged as 1, 1.5 or 2
-- servings, and none of those is what anybody eats: you weigh 35 g of cheese,
-- and you drink the whole 400 ml bottle of kefir.
--
-- The WEIGHT half needs no column at all: portion.ts reads grams (or
-- millilitres) straight off the serving label that is already stored, so every
-- food already saved becomes measurable the moment the app updates.
--
-- The PACK half needs these two, because how big the bottle is is a fact about
-- the product and nothing in the database records it:
--
--   packSize   the whole container, in the serving's OWN measure — grams for a
--              food sold by weight, millilitres for one sold by volume. It is
--              deliberately NOT always grams: converting millilitres to grams
--              needs a density this app does not have and must not invent.
--   packLabel  the athlete's own word for it: "bottle", "tub", "pack".
--
-- SAFE TO RUN EARLY: both columns are nullable and the products API writes them
-- inside the same try/fallback it already uses for the label panel, so a
-- database that has not run this yet keeps saving foods without them.

alter table "FoodProduct" add column if not exists "packSize" double precision;
alter table "FoodProduct" add column if not exists "packLabel" text;

-- Defence in depth: the API clamps to a positive size (core parsePackSize), but
-- a zero or negative pack would make the editor offer a unit worth nothing.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'FoodProduct_packSize_positive'
  ) then
    alter table "FoodProduct"
      add constraint "FoodProduct_packSize_positive"
      check ("packSize" is null or "packSize" > 0);
  end if;
end $$;

-- No RLS change: FoodProduct is already owner-scoped and new columns inherit
-- the table's policies.
