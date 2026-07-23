-- HYBRID — Nutrition: add the personal `subname` to SavedMeal + FoodProduct.
-- Run in the Supabase SQL Editor. Mirrors the prisma/schema.prisma change that
-- adds `subname String?` to both models. Idempotent (IF NOT EXISTS).
--
-- `subname` is the user's OWN label for a food, shown as a lighter second line
-- under the name everywhere a food appears (picker rows, saved lists, the
-- portion editor). Examples: a dish named "Tuna Bowl" with subname
-- "w/ sushi rice", or "Whey scoop" with subname "the usual way". Nullable, so
-- existing rows are unaffected and the field is entirely optional.
--
-- HARD DEPENDENCY: once the Prisma client carries `subname`, the owner's
-- GET/POST /api/nutrition/meals + /products read + write it — run this BEFORE
-- the change reaches production, or those routes error against a DB that lacks
-- the column.

ALTER TABLE "SavedMeal"   ADD COLUMN IF NOT EXISTS "subname" TEXT;
ALTER TABLE "FoodProduct" ADD COLUMN IF NOT EXISTS "subname" TEXT;
