-- HYBRID — FoodLog table (editable / deletable per-day intake entries).
-- Run in the Supabase SQL Editor. Mirrors prisma/schema.prisma model FoodLog.
-- Idempotent.
--
-- Each row is ONE logged food or meal: the record the Nutrition Diary lists and
-- what edit (quantity) and delete operate on. Macros are stored PER SINGLE
-- SERVING with a separate `qty`, so a quantity edit rescales cleanly. The
-- engines keep reading the mirrored Signals (energyIntake + protein/carbs/fat);
-- `signalIds` links the four mirrored Signal rows so a delete removes them
-- atomically. `ts` is the log instant — the client groups rows into its own
-- LOCAL calendar days (the server never reasons about the athlete's timezone).
--
-- Until this runs, logging still works: POST /api/nutrition/log degrades to
-- writing ONLY the Signals (so totals + engines are unaffected), the Diary's
-- entry list is simply empty, and edit/delete are unavailable. After it runs,
-- entries appear and sync across the athlete's devices.

create table if not exists "FoodLog" (
  "id"        text primary key default gen_random_uuid()::text,
  "userId"    text not null references "User"("id") on delete cascade,
  "name"      text not null,
  "subname"   text,
  "source"    text not null,                       -- part of day: breakfast|lunch|dinner|snack|custom
  "kcal"      double precision not null,           -- per single serving
  "protein"   double precision not null default 0,
  "carbs"     double precision not null default 0,
  "fat"       double precision not null default 0,
  "qty"       double precision not null default 1, -- number of servings logged
  "signalIds" jsonb not null default '[]'::jsonb,  -- string[] of mirrored Signal ids
  "ts"        timestamp(3) not null,
  "createdAt" timestamp(3) not null default now()
);

create index if not exists "FoodLog_userId_ts_idx" on "FoodLog" ("userId", "ts");

-- Owner-only access (same pattern as Signal/Session): a user reads/writes only
-- their own rows. The server's service-role Prisma connection bypasses RLS.
alter table "FoodLog" enable row level security;
drop policy if exists foodlog_own on "FoodLog";
create policy foodlog_own on "FoodLog" for all
  using ("userId" = public.app_user_id())
  with check ("userId" = public.app_user_id());
