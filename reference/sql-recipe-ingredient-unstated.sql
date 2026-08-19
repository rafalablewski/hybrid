-- HYBRID — Nutrition: a recipe ingredient that can say "I don't know".
-- Run in the Supabase SQL Editor, AFTER reference/sql-nutrition-user-recipes.sql.
-- Mirrors prisma/schema.prisma UserRecipeIngredient.unstated. Idempotent.
--
-- WHY THIS COLUMN EXISTS.
--
-- Every other unknown in nutrition is already representable: a panel field that
-- a label never stated is NULL, and @hybrid/core's sumFacts drops the whole
-- total rather than adding a zero to it. The four MACRO columns could not say
-- it — kcal/protein/carbs/fat are NOT NULL — so a line whose food had not been
-- identified yet could only be written as a confident zero. That is the exact
-- failure the derived-macros discipline exists to prevent, and it was the thing
-- blocking two features: copying a curated library recipe into your own (it
-- states per-serve macros and no per-ingredient figures at all), and importing
-- one from a link, whose first unmatched line hits the same wall.
--
-- Widening the four columns to NULL was the alternative and was rejected: they
-- are read by every engine, total and screen in the app, and the blast radius
-- of "a macro might be null everywhere" is enormous next to one boolean that
-- says "these four are not a measurement".
--
-- WHAT READS IT: recipeTotals() leaves an unstated line OUT of the sum and
-- returns its name, so the totals read as a FLOOR while any remain;
-- canLogRecipe() refuses to write a floor into the diary; the editor marks the
-- row and offers to link it to a food that does state its numbers, which clears
-- the flag. DEFAULT false, so every existing row is a measurement, unchanged.

alter table "UserRecipeIngredient"
  add column if not exists "unstated" boolean not null default false;
