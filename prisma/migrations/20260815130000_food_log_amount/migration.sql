-- Custom food portions — what the athlete actually entered.
--
-- A diary entry stores per-serving macros and a QUANTITY, which is the right
-- shape for every engine downstream and the wrong thing to show a person: log
-- 35 g of a 100 g food and the row reads "0.35". The number is correct and it
-- is not the number that was entered — they weighed 35 grams.
--
--   amount      the number as entered, in the unit below
--   amountUnit  "g" / "ml" (the same token in every language this app ships),
--               the athlete's own word for their container ("bottle"), or one
--               of two canonical tokens ("serving", "pack") localized at read
--               time. A translated word is never stored: last month's entries
--               must not speak a language the athlete has since switched away
--               from.
--
-- `qty` remains the source of truth for every total; this is a record of how
-- the portion was expressed, kept in step because a quantity edit rescales it
-- by the same ratio (core rescaleLoggedAmount).
--
-- NOTE for production, whose migration bookkeeping is not yet reconciled (see
-- prisma/MIGRATIONS.md): run reference/sql-food-log-amount.sql in the Supabase
-- SQL Editor instead of applying this migration.

-- AlterTable
ALTER TABLE "FoodLog" ADD COLUMN     "amount" DOUBLE PRECISION,
ADD COLUMN     "amountUnit" TEXT;
