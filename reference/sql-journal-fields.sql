-- HYBRID — Journal structured fields (mood + tags).
-- Run in the Supabase SQL Editor. Mirrors prisma/schema.prisma model
-- JournalEntry. Idempotent.
--
-- Adds two nullable/defaulted columns to the existing owner-only JournalEntry
-- table (created in reference/sql-private-tab.sql) so the redesigned Journal can
-- store a quick mood tap (1..4, rough → strong) and a few tag slugs per note.
-- No RLS change is needed — the existing `journalentry_own` policy already
-- scopes every row to its owner, new columns included.
--
-- Until this runs, the Journal still works: POST /api/journal drops mood/tags
-- (the columns don't exist), and entries render as plain notes. After it runs,
-- mood + tags persist and sync across the athlete's devices.

alter table "JournalEntry" add column if not exists "mood" integer;
alter table "JournalEntry" add column if not exists "tags" text[] not null default '{}';
