-- HYBRID — Signal table (Athlete Twin universal time-series).
-- Run this in the Supabase SQL Editor. The agent can't reach the DB from the
-- sandbox, so this is applied by hand (same flow as rls-policies.sql).
--
-- Mirrors prisma/schema.prisma model Signal. RLS matches Session:
--   * a user reads/writes only their own Signal rows
--   * a coach may READ a client's signals via an ACTIVE CoachLink
-- (relies on public.app_user_id() and public.is_active_coach() from
--  rls-policies.sql — run that first if you haven't.)

-- ---- table --------------------------------------------------------------
create table if not exists "Signal" (
  "id"     text primary key default gen_random_uuid()::text,
  "userId" text not null references "User"("id"),
  "kind"   text not null,
  "value"  double precision not null,
  "unit"   text not null,
  "source" text not null,
  "ts"     timestamp(3) not null
);

create index if not exists "Signal_userId_kind_ts_idx"
  on "Signal" ("userId", "kind", "ts");

-- ---- row-level security -------------------------------------------------
alter table "Signal" enable row level security;

drop policy if exists signal_own on "Signal";
create policy signal_own on "Signal" for all
  using ("userId" = public.app_user_id())
  with check ("userId" = public.app_user_id());

drop policy if exists signal_coach_read on "Signal";
create policy signal_coach_read on "Signal" for select
  using (public.is_active_coach("userId"));
