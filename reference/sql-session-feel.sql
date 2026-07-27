-- HYBRID — Session post-workout self-report ("How did that feel?").
-- Run in the Supabase SQL Editor. Mirrors prisma/schema.prisma model Session.
-- Idempotent.
--
-- Adds the two taps the Wrapped asks for right after a workout:
--   feel     1..5  perceived effort   (1 easy … 5 all out)
--   fatigue  1..5  how spent you are  (1 fresh … 5 wrecked)
--
-- WHY IT MATTERS: perceived effort × session duration is sRPE, the standard
-- field measure of INTERNAL training load. Two athletes can run 10 km in 40
-- minutes and log identical rows; one floated home, the other was hanging on.
-- Without this column they are the same session to every engine we have, and
-- prescribing the same next workout for both is how you break the second one.
-- See packages/core/src/session-feel.ts for the model these columns feed.
--
-- Owner-only, like Session.note/mood/tags: no RLS change is needed (Session is
-- already owner-scoped, new columns included), and the coach sessions endpoint
-- selects an explicit column list that excludes them.
--
-- HARD DEPENDENCY: once the Prisma client carries these columns, the owner's
-- GET /api/sessions (which returns the full row) and the POST/PATCH writes
-- error against a DB that lacks them — so run this BEFORE the change reaches
-- production, together with reference/sql-session-notes.sql.

alter table "Session" add column if not exists "feel" integer;
alter table "Session" add column if not exists "fatigue" integer;

-- Defence in depth: the API sanitises to 1..5 (core sanitizeFeelLevel), but a
-- poisoned load figure is worse than a missing one, so the DB refuses it too.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'Session_feel_range') then
    alter table "Session" add constraint "Session_feel_range"
      check ("feel" is null or ("feel" between 1 and 5));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'Session_fatigue_range') then
    alter table "Session" add constraint "Session_fatigue_range"
      check ("fatigue" is null or ("fatigue" between 1 and 5));
  end if;
end $$;
