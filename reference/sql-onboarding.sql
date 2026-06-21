-- HYBRID — Guided onboarding: admin-editable questions + server-side state.
-- Run in the Supabase SQL Editor. Mirrors prisma/schema.prisma:
--   • model OnboardingState     (per-user completion + saved answers)
--   • model OnboardingQuestion  (the admin-editable questionnaire)
--
-- The questionnaire is DATA, not hard-coded UI. The five built-ins
-- (persona, goal, experience, days, equipment) live as defaults in @hybrid/core,
-- so onboarding works with this table EMPTY; rows here override/extend them.
-- Mutations are server-only (the admin API is ADMIN-gated + audited); any
-- signed-in user may read the enabled rows (they render everyone's onboarding).

-- 1) Per-user onboarding state (its own table — never on the User hot path).
-- PREREQUISITE for the RLS policy: reference/rls-policies.sql (app_user_id()).
create table if not exists "OnboardingState" (
  "userId"      text primary key references "User"("id") on delete cascade,
  "onboardedAt" timestamp(3) not null default now(),
  "answers"     jsonb,
  "updatedAt"   timestamp(3) not null default now()
);

alter table "OnboardingState" enable row level security;
-- a user may read their own onboarding state; writes are server-only (admin/app
-- endpoints run on a privileged connection that bypasses RLS).
drop policy if exists onboarding_state_own_select on "OnboardingState";
create policy onboarding_state_own_select on "OnboardingState" for select
  using ("userId" = public.app_user_id());

-- Backfill: anyone who already enrolled a plan has effectively onboarded, so
-- they're never nagged with the questionnaire. (New users start with no row.)
insert into "OnboardingState" ("userId", "onboardedAt")
  select distinct "userId", now() from "Macrocycle"
  on conflict ("userId") do nothing;

-- 2) The admin-editable questions ----------------------------------------
create table if not exists "OnboardingQuestion" (
  "id"           text primary key default gen_random_uuid()::text,
  "key"          text not null unique,
  "kind"         text not null default 'single',  -- persona | goal | single | multi | number | text
  "title"        text not null,
  "subtitle"     text,
  "engineKey"    text,                             -- persona | goal | experience | daysPerWeek | equipment | null
  "choices"      jsonb,                            -- [{ value, label, blurb? }]
  "min"          integer,
  "max"          integer,
  "step"         integer,
  "defaultValue" text,
  "required"     boolean not null default false,
  "enabled"      boolean not null default true,
  "system"       boolean not null default false,
  "order"        integer not null default 0,
  "authorId"     text,
  "authorEmail"  text,
  "createdAt"    timestamp(3) not null default now(),
  "updatedAt"    timestamp(3) not null default now()
);
create index if not exists "OnboardingQuestion_enabled_order_idx"
  on "OnboardingQuestion" ("enabled", "order");

alter table "OnboardingQuestion" enable row level security;

-- any signed-in user may read questions (they render everyone's onboarding).
drop policy if exists onboarding_question_read on "OnboardingQuestion";
create policy onboarding_question_read on "OnboardingQuestion" for select
  to authenticated
  using (true);
