-- HYBRID — CoachDiet table + RLS (a coach-assigned macro target for a client).
-- Run in the Supabase SQL Editor.
-- PREREQUISITE: run reference/rls-policies.sql FIRST — it defines
-- public.app_user_id() (the signed-in user's DB id).
--
-- WHY: a coach can assign a client daily macro targets (kcal / protein / carbs /
-- fat), the nutrition analogue of an assigned training plan. The client VIEWS it
-- read-only on their Nutrition screen. Until this runs, the diet APIs soft-degrade
-- to "not enabled yet" and the rest of the app works.

create table if not exists "CoachDiet" (
  "id"        text primary key default gen_random_uuid()::text,
  "coachId"   text not null,
  "clientId"  text not null,
  "kcal"      integer,
  "protein"   integer,
  "carbs"     integer,
  "fat"       integer,
  "note"      text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("coachId", "clientId")
);

create index if not exists "CoachDiet_clientId_idx" on "CoachDiet" ("clientId");

alter table "CoachDiet" enable row level security;

-- The coach reads + writes the diets they authored.
drop policy if exists coachdiet_coach on "CoachDiet";
create policy coachdiet_coach on "CoachDiet" for all
  using ("coachId" = public.app_user_id())
  with check ("coachId" = public.app_user_id());

-- The client may READ a diet assigned to them (display only — no client writes).
drop policy if exists coachdiet_client_read on "CoachDiet";
create policy coachdiet_client_read on "CoachDiet" for select
  using ("clientId" = public.app_user_id());
