-- HYBRID — RiskOutcome + ModelFit tables (the injury calibration refit loop).
-- Run in the Supabase SQL Editor. Mirrors prisma/schema.prisma.
--   RiskOutcome — labeled outcomes (own-rows + active-coach read).
--   ModelFit    — the live fitted coefficients; written/read server-side only.
-- Relies on public.app_user_id() + public.is_active_coach() from rls-policies.sql.

create table if not exists "RiskOutcome" (
  "id"      text primary key default gen_random_uuid()::text,
  "userId"  text not null references "User"("id"),
  "tissue"  text,
  "score"   double precision not null,
  "injured" boolean not null,
  "ts"      timestamp(3) not null default now()
);
create index if not exists "RiskOutcome_userId_idx" on "RiskOutcome" ("userId");

alter table "RiskOutcome" enable row level security;
drop policy if exists outcome_own on "RiskOutcome";
create policy outcome_own on "RiskOutcome" for all
  using ("userId" = public.app_user_id())
  with check ("userId" = public.app_user_id());
drop policy if exists outcome_coach_read on "RiskOutcome";
create policy outcome_coach_read on "RiskOutcome" for select
  using (public.is_active_coach("userId"));

create table if not exists "ModelFit" (
  "id"        text primary key default gen_random_uuid()::text,
  "key"       text not null,
  "intercept" double precision not null,
  "slope"     double precision not null,
  "n"         integer not null,
  "version"   text not null,
  "createdAt" timestamp(3) not null default now()
);
create index if not exists "ModelFit_key_createdAt_idx" on "ModelFit" ("key", "createdAt");

-- ModelFit is global model state, written/read by the server (service role,
-- which bypasses RLS). Enable RLS with no client policy so it's not exposed.
alter table "ModelFit" enable row level security;
