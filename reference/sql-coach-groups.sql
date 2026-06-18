-- HYBRID — CoachGroup table + RLS (a solo coach's lightweight client groups).
-- Run in the Supabase SQL Editor.
-- PREREQUISITE: run reference/rls-policies.sql FIRST — it defines
-- public.app_user_id() (the signed-in user's DB id).
--
-- WHY: a coach can group their clients (e.g. "Tuesday 6am squad") and assign a
-- whole plan to everyone at once (/api/coach/groups + .../assign-plan). The API
-- gates every read/write by coachId; this adds matching defense-in-depth RLS so
-- the database also only lets a coach touch their OWN groups. Until this runs,
-- the group APIs soft-degrade to "not enabled yet" and the rest of the app works.

create table if not exists "CoachGroup" (
  "id"        text primary key default gen_random_uuid()::text,
  "coachId"   text not null,
  "name"      text not null,
  "clientIds" text[] not null default '{}',
  "createdAt" timestamptz not null default now()
);

create index if not exists "CoachGroup_coachId_idx" on "CoachGroup" ("coachId");

alter table "CoachGroup" enable row level security;

-- a coach reads + writes only their own groups
drop policy if exists coachgroup_own on "CoachGroup";
create policy coachgroup_own on "CoachGroup" for all
  using ("coachId" = public.app_user_id())
  with check ("coachId" = public.app_user_id());
