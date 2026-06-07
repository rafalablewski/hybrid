-- HYBRID — coach-write RLS for Macrocycle (coach enrolls a client's season).
-- Run in the Supabase SQL Editor.
-- PREREQUISITE: run reference/rls-policies.sql FIRST — it defines
-- public.app_user_id() + public.is_active_coach() and the base macro_own policy.
--
-- WHY: POST /api/coach/links/[id]/macrocycle lets an active coach persist a
-- periodized season FOR a rostered client (so the client's Periodize/Today and
-- the coach's week generator share one source). The API gates this by the
-- CoachLink; this adds the matching defense-in-depth RLS so the database also
-- only permits an ACTIVE coach to read/insert/update their own athlete's
-- macrocycle — mirrors assignment_coach in sql-workout-builder.sql.

-- an active coach reads + writes their athlete's macrocycle
drop policy if exists macro_coach on "Macrocycle";
create policy macro_coach on "Macrocycle" for all
  using (public.is_active_coach("userId"))
  with check (public.is_active_coach("userId"));
