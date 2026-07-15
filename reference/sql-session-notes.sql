-- HYBRID — Session private note (mood + tags).
-- Run in the Supabase SQL Editor. Mirrors prisma/schema.prisma model Session.
-- Idempotent.
--
-- Adds the athlete's PRIVATE post-workout reflection to each logged Session:
-- a free-text `note`, a quick `mood` (1..4, rough → strong, core MOODS) and a
-- few `tags` (short slugs, core SUGGESTED_TAGS). Owner-only — the app never
-- serialises these to a coach, the Activity feed or social (the coach sessions
-- endpoint selects an explicit column list that excludes them).
--
-- No RLS change is needed — Session is already owner-scoped, new columns
-- included. HARD DEPENDENCY: once the Prisma client carries these columns, the
-- owner's GET /api/sessions (which returns the full row) and POST error against
-- a DB that lacks them — so run this BEFORE the change reaches production.

alter table "Session" add column if not exists "note" text;
alter table "Session" add column if not exists "mood" integer;
alter table "Session" add column if not exists "tags" text[] not null default '{}';
