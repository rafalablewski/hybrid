-- HYBRID — performance indexes for hot read paths.
-- Run in the Supabase SQL Editor. Mirrors the new @@index lines in
-- prisma/schema.prisma (Session, Checkin, Assignment). CONCURRENTLY so it never
-- locks the tables in production; run each statement on its own (CONCURRENTLY
-- can't run inside a transaction block).

-- "This user's sessions, newest first" — History + every analytics engine.
create index concurrently if not exists "Session_userId_startedAt_idx"
  on "Session" ("userId", "startedAt");

-- Coach views read a client's SHARED check-ins.
create index concurrently if not exists "Checkin_userId_sharedWithCoach_idx"
  on "Checkin" ("userId", "sharedWithCoach");

-- Calendar reads an athlete's assignments by date.
create index concurrently if not exists "Assignment_athleteId_date_idx"
  on "Assignment" ("athleteId", "date");
