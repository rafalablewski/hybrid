-- HYBRID — WorkoutTemplate + Assignment tables (the builder + scheduler).
-- Run in the Supabase SQL Editor. Mirrors prisma/schema.prisma.
-- PREREQUISITE: run reference/rls-policies.sql FIRST — it defines
-- public.app_user_id() + public.is_active_coach().

-- ---------- WorkoutTemplate (reusable workouts; own-rows) ----------
create table if not exists "WorkoutTemplate" (
  "id"          text primary key default gen_random_uuid()::text,
  "ownerId"     text not null references "User"("id"),
  "name"        text not null,
  "description" text,
  "blocks"      jsonb not null default '[]'::jsonb, -- SessionBlock[]
  "createdAt"   timestamp(3) not null default now()
);
create index if not exists "WorkoutTemplate_ownerId_idx" on "WorkoutTemplate" ("ownerId");

alter table "WorkoutTemplate" enable row level security;

drop policy if exists template_own on "WorkoutTemplate";
create policy template_own on "WorkoutTemplate" for all
  using ("ownerId" = public.app_user_id())
  with check ("ownerId" = public.app_user_id());

-- ---------- Assignment (a workout scheduled to an athlete on a date) ----------
create table if not exists "Assignment" (
  "id"           text primary key default gen_random_uuid()::text,
  "athleteId"    text not null references "User"("id"),
  "assignedById" text not null references "User"("id"),
  "templateId"   text,
  "name"         text not null,
  "blocks"       jsonb not null default '[]'::jsonb, -- SessionBlock[] snapshot
  "date"         timestamp(3) not null,
  "status"       text not null default 'assigned', -- assigned | completed | skipped
  "sessionId"    text,
  "createdAt"    timestamp(3) not null default now()
);
create index if not exists "Assignment_athleteId_idx" on "Assignment" ("athleteId");
create index if not exists "Assignment_assignedById_idx" on "Assignment" ("assignedById");

alter table "Assignment" enable row level security;

-- the athlete sees + updates (marks complete) their own assignments
drop policy if exists assignment_athlete on "Assignment";
create policy assignment_athlete on "Assignment" for all
  using ("athleteId" = public.app_user_id())
  with check ("athleteId" = public.app_user_id());

-- an active coach reads + assigns + updates their athlete's assignments
drop policy if exists assignment_coach on "Assignment";
create policy assignment_coach on "Assignment" for all
  using (public.is_active_coach("athleteId"))
  with check (public.is_active_coach("athleteId"));
