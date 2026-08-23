-- HYBRID — per-user SYNCED PREFERENCES.
-- Run in the Supabase SQL Editor (the agent can't reach the DB from its sandbox).
--
-- Adds a JSONB column to the User table holding the settings that should follow
-- the ACCOUNT rather than the handset: pinned lifts and sports, units, rest
-- days, saved recipes, where a screen was left, which one-shot hints have been
-- seen. The full allowlist is packages/core/src/synced-prefs.ts.
--
-- Until this runs, those settings live ONLY on-device (localStorage /
-- AsyncStorage) and /api/prefs soft-degrades — reads return {} and writes
-- answer 503 — so the app keeps working exactly as it does today. Once applied,
-- each client uploads whatever it already had locally (nothing is lost) and the
-- settings sync from then on.
--
-- The column is written with jsonb `||` so a patch only touches the keys it
-- names: two devices changing two different settings never clobber each other.
--
-- Idempotent — safe to run more than once.
alter table "User"
  add column if not exists "prefs" jsonb not null default '{}'::jsonb;
