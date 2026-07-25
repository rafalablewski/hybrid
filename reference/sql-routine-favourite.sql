-- HYBRID — routine favourite flag (the Quick-start sheet's Favourites rail).
-- Run in the Supabase SQL Editor (the agent can't reach the DB from its sandbox).
--
-- Adds a boolean to WorkoutTemplate marking a saved routine as a favourite, so
-- Today's "Quick start" sheet can float the starred routines to the top rail and
-- shuffle the rest under "Rediscover". Until this runs, the /api/templates GET
-- reads every routine as favourite:false (a guarded raw sub-query) and the
-- PATCH /api/templates/[id] toggle soft-degrades to a 503 — the sheet, the
-- one-tap launch and the whole feature still work, favourites just don't persist.
-- Idempotent — safe to run more than once.
alter table "WorkoutTemplate"
  add column if not exists "favourite" boolean not null default false;
