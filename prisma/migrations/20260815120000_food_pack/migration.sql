-- Custom food portions — the pack a food comes in.
--
-- A saved food could only be logged in SERVINGS, so a kefir saved as "100 g"
-- could not be logged as the whole bottle, and a cheese saved the same way
-- could not be logged as the 35 g the scale actually read. The measure half of
-- that is derived from what is already stored (packages/core/src/portion.ts
-- reads grams or millilitres straight off the serving label); the PACK is a
-- fact about the product — it is printed on it — and had nowhere to live.
--
--   packSize   the whole container, in the serving's OWN measure: grams for a
--              food sold by weight, millilitres for one sold by volume
--   packLabel  what the athlete calls it — "bottle", "tub", "pack"
--
-- NOTE for production, whose migration bookkeeping is not yet reconciled (see
-- prisma/MIGRATIONS.md): run reference/sql-food-pack.sql in the Supabase SQL
-- Editor instead of applying this migration.

-- AlterTable
ALTER TABLE "FoodProduct" ADD COLUMN     "packSize" DOUBLE PRECISION,
ADD COLUMN     "packLabel" TEXT;
