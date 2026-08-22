-- DeclaredEvent — the athlete's own races, meets and tests.
--
-- The half of "what's on tomorrow" no log can answer: a weekly five-a-side
-- leaves a pattern the app detects on its own, a half marathon in six weeks
-- leaves nothing until the day it happens. Consumed only by the day band
-- (packages/core/src/day-events.ts).
--
-- `date` is the client's LOCAL date key (yyyy-mm-dd) stored verbatim, so the
-- server never reasons about the athlete's timezone. `kind` is a core
-- TrainingKind.
--
-- Production runs reference/sql-declared-events.sql (idempotent, plus RLS);
-- this is the fresh-environment copy.
CREATE TABLE IF NOT EXISTS "DeclaredEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeclaredEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DeclaredEvent_userId_date_idx" ON "DeclaredEvent"("userId", "date");

ALTER TABLE "DeclaredEvent" ADD CONSTRAINT "DeclaredEvent_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
