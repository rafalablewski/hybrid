-- HYBRID — a food's PORTIONS: a list, from four sources.
-- Run in the Supabase SQL Editor. Mirrors prisma/schema.prisma model FoodProduct
-- (and prisma/migrations/20260815140000_food_portions). Idempotent.
--
-- WHY THIS REPLACES packSize / packLabel
-- The first cut of custom portions stored ONE pack per food, and the athlete
-- had to type it. That works for the handful of foods somebody has the patience
-- to describe and collapses across a real shelf — there are millions of
-- products and only one of you. Portions now come from wherever they are
-- cheapest to obtain:
--
--   catalog  Open Food Facts records the net quantity printed on every product
--            it holds (`quantity` / `product_quantity`). The app was not even
--            requesting the field; now it does, so a searched or scanned food
--            arrives already knowing its own pack.
--   scanned  a barcode identifies one specific PACKAGE — that is what a barcode
--            is for — so a scan carries its pack size with it.
--   learned  the amounts this athlete actually logs, over and over. This is the
--            answer for the deli counter and the homemade loaf, which no
--            catalog has ever heard of.
--   typed    they told us. Correct as a fallback, wrong as the only route.
--
--   portions  jsonb, [{ label, size, source }] — `size` in the serving's OWN
--             measure (grams for a food sold by weight, millilitres for one
--             sold by volume; the two are never converted into each other,
--             because that needs a density this app does not have). An empty
--             `label` means the generic pack, localized when printed, so no
--             English word is ever stored in a Polish or German database.
--
-- packSize AND packLabel ARE DELIBERATELY LEFT IN PLACE. They are read at load
-- time and folded into the list (core foodPortions), so any bottle already
-- recorded survives this change. Nothing writes them any more. Do not drop
-- them until every client in the wild has been updated.
--
-- SAFE TO RUN EARLY: the column defaults to an empty list, and the products API
-- writes it inside the same try/fallback it already uses for the label panel,
-- so a database that has not run this keeps saving foods.

alter table "FoodProduct" add column if not exists "portions" jsonb not null default '[]'::jsonb;

-- Defence in depth: the API validates each entry (core parseFoodPortions), but
-- an object where a list belongs would break every read of this column.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'FoodProduct_portions_is_array'
  ) then
    alter table "FoodProduct"
      add constraint "FoodProduct_portions_is_array"
      check (jsonb_typeof("portions") = 'array');
  end if;
end $$;

-- No RLS change: FoodProduct is already owner-scoped and new columns inherit
-- the table's policies.
