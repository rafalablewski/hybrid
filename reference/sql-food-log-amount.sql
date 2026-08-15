-- HYBRID — custom food portions: what the athlete actually entered.
-- Run in the Supabase SQL Editor. Mirrors prisma/schema.prisma model FoodLog
-- (and prisma/migrations/20260815130000_food_log_amount). Idempotent.
--
-- WHAT THIS IS FOR
-- A diary entry stores per-serving macros and a QUANTITY. That is the right
-- shape for every engine downstream — and the wrong thing to put in front of a
-- person. Log 35 g of a food saved as "100 g" and the row read "0.35". The
-- number is correct; it is not the number that was entered. They weighed 35
-- grams, and the row should say 35 g.
--
--   amount      the number as entered, in the unit below
--   amountUnit  "g" or "ml" — the same token in all three languages this app
--               ships — or the athlete's own word for their container
--               ("bottle", which they typed and so is already in their
--               language), or one of two CANONICAL tokens, "serving" and
--               "pack", that are localized when printed. A translated word is
--               deliberately never stored: last month's entries must not speak
--               a language the athlete has since switched away from.
--
-- `qty` REMAINS THE SOURCE OF TRUTH for every total, ring and engine. These two
-- columns are a record of how the portion was expressed, kept in step because a
-- quantity edit rescales the amount by the same ratio (core
-- rescaleLoggedAmount) rather than re-deriving it — a re-derivation could
-- disagree with the original, and then the row and the total would tell two
-- different stories about one meal.
--
-- SAFE TO RUN EARLY: both columns are nullable, and lib/food-log-write.ts falls
-- back through three inserts (with amount → without amount → macros only), so a
-- database that has not run this keeps logging food, and keeps its label panel
-- while doing it. Entries written before this simply have no amount, and the
-- diary shows them exactly as it always did.

alter table "FoodLog" add column if not exists "amount" double precision;
alter table "FoodLog" add column if not exists "amountUnit" text;

-- Defence in depth: the API clamps to a positive amount, but a zero or negative
-- one would print a portion of nothing on the row.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'FoodLog_amount_positive'
  ) then
    alter table "FoodLog"
      add constraint "FoodLog_amount_positive"
      check ("amount" is null or "amount" > 0);
  end if;
end $$;

-- No RLS change: FoodLog is already owner-scoped and new columns inherit the
-- table's policies.
