-- Performance indexes for the hot query patterns. Run in the Supabase SQL
-- Editor (the sandbox can't reach the DB directly). Matches the @@index lines
-- added to prisma/schema.prisma.
--
-- Plain CREATE INDEX (not CONCURRENTLY) so this runs inside the SQL Editor's
-- transaction. It takes a brief write lock while building — fine at current
-- scale. If a table is ever large enough that the lock matters, build that ONE
-- index with CONCURRENTLY, run on its own (CONCURRENTLY can't run in a
-- transaction block — that's the "cannot run inside a transaction block" error).
--
-- NOTE: these are also bundled in reference/sql-audit-migrations.sql alongside
-- the other audit migrations — run that instead if you haven't applied any yet.

-- Session: history/engine reads filter by user and sort by startedAt; admin
-- views sort globally by startedAt.
CREATE INDEX IF NOT EXISTS "Session_userId_startedAt_idx"
  ON "Session" ("userId", "startedAt");
CREATE INDEX IF NOT EXISTS "Session_userId_archivedAt_startedAt_idx"
  ON "Session" ("userId", "archivedAt", "startedAt");
CREATE INDEX IF NOT EXISTS "Session_startedAt_idx"
  ON "Session" ("startedAt");

-- Biometric: read "where userId order by date desc".
CREATE INDEX IF NOT EXISTS "Biometric_userId_date_idx"
  ON "Biometric" ("userId", "date");

-- Checkin: read "where userId order by weekOf desc".
CREATE INDEX IF NOT EXISTS "Checkin_userId_weekOf_idx"
  ON "Checkin" ("userId", "weekOf");

-- AgentRun: global admin views sort by recency without an agentId filter.
CREATE INDEX IF NOT EXISTS "AgentRun_createdAt_idx"
  ON "AgentRun" ("createdAt");

-- User: admin lists order/filter by recency.
CREATE INDEX IF NOT EXISTS "User_createdAt_idx"
  ON "User" ("createdAt");

-- Optional (recommended at scale): trigram index so admin user search
-- (email/name ILIKE '%q%') stops table-scanning. Requires the pg_trgm ext.
-- CONCURRENTLY here means these MUST run one at a time, outside any transaction.
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS "User_email_trgm_idx"
--   ON "User" USING gin ("email" gin_trgm_ops);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS "User_name_trgm_idx"
--   ON "User" USING gin ("name" gin_trgm_ops);
