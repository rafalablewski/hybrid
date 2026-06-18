-- HYBRID — CoachProgram table + RLS (coach-authored multi-week programs).
-- Run in the Supabase SQL Editor.
-- PREREQUISITE: run reference/rls-policies.sql FIRST (defines public.app_user_id()).
--
-- WHY: a coach composes a multi-week program (weeks → days → exercises) once and
-- assigns it to a client or a whole group, materializing it into dated
-- Assignments. The API gates every read/write by coachId; this adds the matching
-- defense-in-depth RLS. Until this runs, the program APIs soft-degrade to
-- "not enabled yet" and the rest of the app works.

create table if not exists "CoachProgram" (
  "id"        text primary key default gen_random_uuid()::text,
  "coachId"   text not null,
  "name"      text not null,
  "goal"      text,
  "weeks"     jsonb not null default '[]'::jsonb,
  "createdAt" timestamptz not null default now()
);

create index if not exists "CoachProgram_coachId_idx" on "CoachProgram" ("coachId");

alter table "CoachProgram" enable row level security;

drop policy if exists coachprogram_own on "CoachProgram";
create policy coachprogram_own on "CoachProgram" for all
  using ("coachId" = public.app_user_id())
  with check ("coachId" = public.app_user_id());
