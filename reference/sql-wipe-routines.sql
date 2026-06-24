-- ============================================================================
--  WIPE ALL SAVED ROUTINES  —  reset every user's saved workout routines to 0.
-- ============================================================================
--
--  Routines = the WorkoutTemplate rows (the "Save as routine" card + the paid
--  Builder write to public."WorkoutTemplate"). This deletes EVERY routine for
--  EVERY user, leaving the table empty (count 0). The FEATURE stays intact —
--  users can save new routines again; this only clears the existing data.
--
--  Safe to run more than once (idempotent: a second run just deletes 0 rows).
--  Run it in the Supabase SQL Editor (the agent sandbox can't reach the DB).
--
--  NOTE on related data: an Assignment stores a SNAPSHOT of its blocks at
--  assignment time (it does NOT FK to WorkoutTemplate), so deleting routines
--  here does not touch any already-assigned workouts. Nothing else references
--  WorkoutTemplate, so no cascade is needed.
-- ----------------------------------------------------------------------------

do $$
declare
  before_n bigint := 0;
  after_n  bigint := 0;
begin
  if to_regclass('public."WorkoutTemplate"') is null then
    raise notice 'WorkoutTemplate table not found — nothing to wipe.';
    return;
  end if;

  execute 'select count(*) from "WorkoutTemplate"' into before_n;
  execute 'delete from "WorkoutTemplate"';
  execute 'select count(*) from "WorkoutTemplate"' into after_n;

  raise notice 'Saved routines wiped: % deleted, % remaining.', before_n, after_n;
end $$;

-- Verify (should return 0):
select count(*) as saved_routines_remaining from "WorkoutTemplate";
