-- HYBRID — workout-history controls, daily/shareable check-ins, anon logging.
-- Run in the Supabase SQL Editor. Mirrors prisma/schema.prisma. Idempotent.
-- PREREQUISITE for the Checkin policy changes: reference/rls-policies.sql must
-- already be applied (it defines public.app_user_id() + public.is_active_coach()).

-- 1) Session: soft-archive column (hide from History without losing the row).
alter table "Session" add column if not exists "archivedAt" timestamp(3);

-- 2) Checkin: per-check-in coach sharing flag (default private/own-use).
alter table "Checkin" add column if not exists "sharedWithCoach" boolean not null default false;

-- A coach may only READ a client's check-in when the athlete shared THAT row.
drop policy if exists checkin_coach_read on "Checkin";
create policy checkin_coach_read on "Checkin" for select
  using (public.is_active_coach("userId") and "sharedWithCoach" = true);

-- ...and may only reply on a shared check-in.
drop policy if exists checkin_coach_reply on "Checkin";
create policy checkin_coach_reply on "Checkin" for update
  using (public.is_active_coach("userId") and "sharedWithCoach" = true)
  with check (public.is_active_coach("userId") and "sharedWithCoach" = true);

-- 3) AnonSession: workouts logged before sign-up (guest mode), kept for admin
--    visibility into real usage. No userId — only an opaque per-device id.
create table if not exists "AnonSession" (
  "id"        text primary key default gen_random_uuid()::text,
  "deviceId"  text,
  "platform"  text,
  "title"     text not null,
  "startedAt" timestamp(3) not null,
  "blocks"    jsonb not null default '[]'::jsonb,
  "createdAt" timestamp(3) not null default now()
);
create index if not exists "AnonSession_deviceId_idx" on "AnonSession" ("deviceId");
create index if not exists "AnonSession_createdAt_idx" on "AnonSession" ("createdAt");

-- Lock the table to the server only: every read/write goes through the API
-- (prisma's service connection bypasses RLS); no direct client role may touch it.
alter table "AnonSession" enable row level security;
-- (no policies created → anon/authenticated client roles are denied by default)
