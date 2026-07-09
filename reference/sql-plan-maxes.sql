-- HYBRID — per-user training maxes (1RMs) for discipline-shaped plans.
-- Run in the Supabase SQL Editor (the agent can't reach the DB from its sandbox).
--
-- Adds a JSONB column to the User table holding the athlete's { liftKey: 1RM }
-- map — e.g. {"snatch":100,"cleanjerk":120,"backSquat":200} — keyed by the
-- ProgramInput.key each discipline-shaped plan derives working loads from. Until
-- this runs, the maxes live ONLY on-device (localStorage / AsyncStorage) and the
-- /api/plan-maxes read/write soft-degrades to a no-op; once it's applied the maxes
-- sync through the account so "Your plan today" shows the same working kg on every
-- device. Idempotent — safe to run more than once.
alter table "User"
  add column if not exists "planMaxes" jsonb not null default '{}'::jsonb;
