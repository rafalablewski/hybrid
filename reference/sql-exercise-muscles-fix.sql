-- HYBRID — Exercise library REPAIR: give every row a muscle group.
-- Run in the Supabase SQL Editor. Idempotent — safe to re-run; it only ever
-- touches rows whose "muscles" array is empty, and re-running finds none.
--
-- WHY
-- The original seed deliberately left "muscles" empty for the groups the coarse
-- engine enum lacks (biceps, calves, abs, forearms), on the assumption that only
-- the per-muscle volume chart would skip them. It doesn't stop there: the
-- engines resolve a logged lift to its muscle groups, so a row with NO muscles
-- contributes ZERO load to fatigue, ACWR, injury risk, volume-by-muscle,
-- landmarks and muscle records — 55 exercises (every curl, calf raise, ab and
-- grip movement) read as untrained no matter how hard they were worked.
--
-- The fix mirrors what core's ENGINE_GROUP already does for the built-in
-- catalog: map each fine-grained muscle onto its coarse home rather than drop
-- it. A rough attribution beats none.
--     biceps · forearms · traps      -> back      (pulling musculature)
--     calves · abs · obliques        -> posterior (trunk / posterior chain)
--
-- reference/sql-exercise-seed.sql now carries these values too, so a FRESH
-- install needs only the seed; this script exists for databases already seeded
-- from the older file (the seed is `on conflict do nothing`, so re-running it
-- will NOT repair existing rows).
--
-- Guarded in CI by packages/core/src/engines/catalog-coverage.test.ts, which
-- fails the build if any shipped row is empty or unresolvable.

begin;

-- Pulling musculature: arms and grip attribute to "back".
update "Exercise"
   set "muscles" = ARRAY['back']::text[]
 where cardinality("muscles") = 0
   and "category" in ('Biceps', 'Traps & Forearms');

-- Trunk and lower leg attribute to "posterior".
update "Exercise"
   set "muscles" = ARRAY['posterior']::text[]
 where cardinality("muscles") = 0
   and "category" in ('Abs & Core', 'Calves');

commit;

-- Verify: expect 0 rows. Anything listed here is still invisible to the engines
-- and needs a muscle group assigned (any of quads, glutes, posterior, back,
-- chest, shoulders, triceps).
select "name", "category"
  from "Exercise"
 where cardinality("muscles") = 0
 order by "category", "name";
