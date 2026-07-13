-- HYBRID — PlanDayOverride table (week-rail skip / postpone persistence).
-- Run in the Supabase SQL Editor. Mirrors prisma/schema.prisma model
-- PlanDayOverride. Idempotent.
--
-- Stores ONLY the athlete's explicit per-day intent on their enrolled plan's
-- week rail: a day they SKIPPED, or POSTPONED to a later date. "done" and
-- "missed" stay DERIVED by the engine (from logged sessions + the calendar), so
-- this table never fights reconciliation. `date` / `postponedTo` are the
-- client's LOCAL date keys (yyyy-mm-dd) stored verbatim — the server never
-- reasons about the athlete's timezone. One row per (user, plan, date).
--
-- Until this runs, the rail still works: /api/plan-days degrades to a no-op and
-- skips/postpones live in the client cache (localStorage / AsyncStorage). After
-- it runs, they sync across the athlete's devices.

create table if not exists "PlanDayOverride" (
  "id"          text primary key default gen_random_uuid()::text,
  "userId"      text not null references "User"("id") on delete cascade,
  "planId"      text not null,
  "date"        text not null,             -- local date key yyyy-mm-dd
  "status"      text not null,             -- 'skipped' | 'postponed'
  "postponedTo" text,                      -- target local date key when postponed
  "createdAt"   timestamp(3) not null default now(),
  "updatedAt"   timestamp(3) not null default now()
);

create unique index if not exists "PlanDayOverride_userId_planId_date_key"
  on "PlanDayOverride" ("userId", "planId", "date");
create index if not exists "PlanDayOverride_userId_planId_idx"
  on "PlanDayOverride" ("userId", "planId");

-- Owner-only access (same pattern as Session/Checkin): a user reads/writes only
-- their own rows. The server's service-role Prisma connection bypasses RLS.
alter table "PlanDayOverride" enable row level security;
drop policy if exists plandayoverride_own on "PlanDayOverride";
create policy plandayoverride_own on "PlanDayOverride" for all
  using ("userId" = public.app_user_id())
  with check ("userId" = public.app_user_id());
