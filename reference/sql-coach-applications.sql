-- HYBRID — CoachApplication table (a user applies to become a coach with free-text
-- credentials; an admin approves → the user's role is promoted to COACH).
-- Run in the Supabase SQL Editor (the agent cannot reach the DB host).
-- Mirrors prisma/schema.prisma model CoachApplication.
-- PREREQUISITE: run reference/rls-policies.sql FIRST (defines public.app_user_id()).

create table if not exists "CoachApplication" (
  "id"          text primary key default gen_random_uuid()::text,
  "userId"      text not null unique references "User"("id") on delete cascade,
  "userEmail"   text not null,
  "credentials" text not null,
  "status"      text not null default 'pending',
  "createdAt"   timestamp(3) not null default now(),
  "decidedAt"   timestamp(3)
);
create index if not exists "CoachApplication_status_idx" on "CoachApplication" ("status");

alter table "CoachApplication" enable row level security;

-- a user reads, files, and re-opens their own application; decisions
-- (approve/deny → role promotion) are made by the server (admin endpoints),
-- which runs on a privileged service-role connection.
drop policy if exists coachapp_own_select on "CoachApplication";
create policy coachapp_own_select on "CoachApplication" for select
  using ("userId" = public.app_user_id());

drop policy if exists coachapp_own_insert on "CoachApplication";
create policy coachapp_own_insert on "CoachApplication" for insert
  with check ("userId" = public.app_user_id());

drop policy if exists coachapp_own_update on "CoachApplication";
create policy coachapp_own_update on "CoachApplication" for update
  using ("userId" = public.app_user_id())
  with check ("userId" = public.app_user_id());
