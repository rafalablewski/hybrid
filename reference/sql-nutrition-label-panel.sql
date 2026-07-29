-- HYBRID — Nutrition: the LABEL PANEL (saturates, sugars, fibre, salt) on every
-- food row, plus serving weight + verified provenance.
--
-- Run in the Supabase SQL Editor. Mirrors the prisma/schema.prisma change that
-- adds the optional panel to SavedMeal, FoodProduct and FoodLog. Idempotent
-- (ADD COLUMN IF NOT EXISTS), so it is safe to re-run.
--
-- WHY
-- Until now a logged food was four numbers: kcal + protein/carbs/fat. That is
-- not what a food label states, and it cannot answer the two questions athletes
-- actually ask of a burger — how much of that fat is SATURATED, and how much of
-- those carbs are SUGAR. It also cannot answer "am I over on salt?". These four
-- columns close that gap for every tier of food: a HYBRID Verified item (which
-- always states them), an Open Food Facts hit (which sometimes does) and a food
-- the user typed in themselves (which may).
--
-- NULL SEMANTICS — THE IMPORTANT PART
-- NULL means NOT STATED. It is NOT zero. An unstated sugar content is not a
-- sugar-free food, and the clients render "—" for NULL, never "0 g". Every
-- column below is therefore nullable with NO default: existing rows keep saying
-- nothing, which is the truthful answer for a food logged before this shipped.
--
-- ENERGY IN KILOJOULES is deliberately NOT a column. 1 kcal = 4.184 kJ by
-- definition, so a kJ column would be a second copy of a fact we already store
-- and could only ever drift out of agreement with it. The clients derive it at
-- read time (packages/core/src/food-facts.ts → kj()). The same reasoning applies
-- to sodium, which is derived from salt (salt × 0.4 = sodium, in g).
--
-- SOFT DEPENDENCY: the API routes write these fields best-effort, exactly like
-- the FoodLog table itself, so a database WITHOUT this migration still logs and
-- still shows the four macros. Running it is what makes the panel persist.

-- ── The label panel, per single serving ───────────────────────────────────────
ALTER TABLE "SavedMeal"   ADD COLUMN IF NOT EXISTS "satFat" DOUBLE PRECISION;
ALTER TABLE "SavedMeal"   ADD COLUMN IF NOT EXISTS "sugar"  DOUBLE PRECISION;
ALTER TABLE "SavedMeal"   ADD COLUMN IF NOT EXISTS "fiber"  DOUBLE PRECISION;
ALTER TABLE "SavedMeal"   ADD COLUMN IF NOT EXISTS "salt"   DOUBLE PRECISION;

ALTER TABLE "FoodProduct" ADD COLUMN IF NOT EXISTS "satFat" DOUBLE PRECISION;
ALTER TABLE "FoodProduct" ADD COLUMN IF NOT EXISTS "sugar"  DOUBLE PRECISION;
ALTER TABLE "FoodProduct" ADD COLUMN IF NOT EXISTS "fiber"  DOUBLE PRECISION;
ALTER TABLE "FoodProduct" ADD COLUMN IF NOT EXISTS "salt"   DOUBLE PRECISION;

ALTER TABLE "FoodLog"     ADD COLUMN IF NOT EXISTS "satFat" DOUBLE PRECISION;
ALTER TABLE "FoodLog"     ADD COLUMN IF NOT EXISTS "sugar"  DOUBLE PRECISION;
ALTER TABLE "FoodLog"     ADD COLUMN IF NOT EXISTS "fiber"  DOUBLE PRECISION;
ALTER TABLE "FoodLog"     ADD COLUMN IF NOT EXISTS "salt"   DOUBLE PRECISION;

-- ── Serving weight — what makes per-100 g comparison possible ────────────────
-- Two foods with different serving sizes cannot be compared on their serving
-- numbers alone; this is the divisor that lets the UI show a fair per-100 g
-- column. NULL where the operator never published a weight (we do not guess).
ALTER TABLE "FoodProduct" ADD COLUMN IF NOT EXISTS "servingGrams" DOUBLE PRECISION;

-- ── Provenance — which HYBRID Verified item a row came from ──────────────────
-- Lets a saved food or a logged entry be traced back to the catalog entry (and
-- so to the business and the date our team checked it). NULL for everything the
-- user created themselves or took from the community database.
ALTER TABLE "FoodProduct" ADD COLUMN IF NOT EXISTS "verifiedId" TEXT;
ALTER TABLE "FoodLog"     ADD COLUMN IF NOT EXISTS "verifiedId" TEXT;

-- ── Verification ─────────────────────────────────────────────────────────────
-- Expect 13 rows (4 + 4 + 4 panel columns, servingGrams, and 2 verifiedId).
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name IN ('SavedMeal', 'FoodProduct', 'FoodLog')
  AND column_name IN ('satFat', 'sugar', 'fiber', 'salt', 'servingGrams', 'verifiedId')
ORDER BY table_name, column_name;

-- NOTE: no RLS change is needed. These are new columns on tables that already
-- carry owner-only policies (reference/sql-nutrition-meals.sql,
-- reference/sql-nutrition-log.sql), and a policy covers the whole row.
