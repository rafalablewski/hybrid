-- HYBRID — retire the metrics the one-tap face invented. OPTIONAL.
-- Run in the Supabase SQL Editor. Idempotent. READ THE CAVEAT FIRST.
--
-- THE PROBLEM THIS CLEANS UP. Until the checkin-honest-metrics change, the
-- one-tap readiness face on Today wrote the picked level into ALL FOUR metrics:
--   energy = sleep = soreness = mood = rating
-- The athlete answered one question ("how ready do you feel?"); the other three
-- were invented and stored indistinguishably from answers actually given.
--
-- Those invented values are not inert. The volume profile reads mean check-in
-- SLEEP and presents it to the athlete as measured; the adaptive-MRV estimator
-- reads soreness and energy as recovery evidence over an 8-week window. So a
-- fabricated row does not merely sit there — it moves training prescriptions.
--
-- New rows are already correct (the quick tap writes energy only, and the
-- guided flow sends null for any question walked past without a tap), so the
-- contamination ages out on its own: ~4 weeks for the sleep default, ~8 weeks
-- for the MRV estimator. Doing nothing is a legitimate choice.
--
-- THE CAVEAT — this is a HEURISTIC, not a proof. A quick tap is identified by
-- all four metrics being equal and non-null. A genuine full check-in where the
-- athlete really did rate everything the same (a flat 3 day, or a 5 across the
-- board) looks identical and would be cleared too. There is no column that
-- records which surface wrote the row, so this cannot be made exact after the
-- fact. If you would rather keep every real answer at the cost of keeping some
-- invented ones, do not run this.
--
-- What it does: keeps `energy` (the metric the tap genuinely asked about) and
-- nulls the three that were copied from it. It never deletes a row and never
-- touches a row whose metrics differ.

update "Checkin"
set "sleep" = null,
    "soreness" = null,
    "mood" = null
where "energy" is not null
  and "sleep" = "energy"
  and "soreness" = "energy"
  and "mood" = "energy";

-- To preview the blast radius before running the update, use:
--   select count(*) from "Checkin"
--   where "energy" is not null and "sleep" = "energy"
--     and "soreness" = "energy" and "mood" = "energy";
