-- HYBRID — TalentProfile table (benchmarks + discovery).
-- Run in the Supabase SQL Editor. Mirrors prisma/schema.prisma model
-- TalentProfile. A user owns their row; discoverable profiles are readable by
-- any signed-in user (the consent-gated talent market). Private profiles are
-- owner-only.

create table if not exists "TalentProfile" (
  "id"         text primary key default gen_random_uuid()::text,
  "userId"     text not null unique references "User"("id"),
  "sport"      text not null,
  "sex"        text not null,
  "age"        integer not null,
  "metrics"    jsonb not null default '{}'::jsonb,
  "visibility" text not null default 'private',
  "updatedAt"  timestamp(3) not null default now()
);
create index if not exists "TalentProfile_visibility_idx" on "TalentProfile" ("visibility");

alter table "TalentProfile" enable row level security;

-- owner: full control of their own profile
drop policy if exists talent_own on "TalentProfile";
create policy talent_own on "TalentProfile" for all
  using ("userId" = public.app_user_id())
  with check ("userId" = public.app_user_id());

-- discovery: any signed-in user may read profiles opted in as discoverable
drop policy if exists talent_discoverable_read on "TalentProfile";
create policy talent_discoverable_read on "TalentProfile" for select
  using ("visibility" = 'discoverable');
