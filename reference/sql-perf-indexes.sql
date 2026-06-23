-- HYBRID — performance indexes for hot read paths.
-- Run in the Supabase SQL Editor. Mirrors the new @@index lines in
-- prisma/schema.prisma (Session, Checkin, Assignment).
--
-- Plain CREATE INDEX (not CONCURRENTLY) so it runs inside the SQL Editor's
-- transaction. On a large, live table you'd instead run each statement on its own
-- with CREATE INDEX CONCURRENTLY (which cannot run in a transaction block); for a
-- pre-launch / modest dataset the brief write-lock here is negligible.
--
-- Guarded with to_regclass so a not-yet-migrated table is skipped, not a fatal
-- error. Idempotent.

do $$
begin
  -- "This user's sessions, newest first" — History + every analytics engine.
  if to_regclass('public."Session"') is not null then
    execute 'create index if not exists "Session_userId_startedAt_idx" on "Session" ("userId", "startedAt")';
  end if;
  -- Coach views read a client's SHARED check-ins.
  if to_regclass('public."Checkin"') is not null then
    execute 'create index if not exists "Checkin_userId_sharedWithCoach_idx" on "Checkin" ("userId", "sharedWithCoach")';
  end if;
  -- Calendar reads an athlete's assignments by date.
  if to_regclass('public."Assignment"') is not null then
    execute 'create index if not exists "Assignment_athleteId_date_idx" on "Assignment" ("athleteId", "date")';
  end if;
end $$;
