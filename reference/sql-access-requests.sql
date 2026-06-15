-- HYBRID — AccessRequest table (a user asks for a feature beyond their persona;
-- an admin approves → the feature is added to that user's featureGrants).
-- Run in the Supabase SQL Editor. Mirrors prisma/schema.prisma model AccessRequest.
-- PREREQUISITE: run reference/rls-policies.sql FIRST (defines public.app_user_id()).

create table if not exists "AccessRequest" (
  "id"        text primary key default gen_random_uuid()::text,
  "userId"    text not null references "User"("id") on delete cascade,
  "userEmail" text not null,
  "navId"     text not null,
  "status"    text not null default 'pending',
  "createdAt" timestamp(3) not null default now(),
  "decidedAt" timestamp(3),
  unique ("userId", "navId")
);
create index if not exists "AccessRequest_status_idx" on "AccessRequest" ("status");

alter table "AccessRequest" enable row level security;

-- a user reads + files their own requests; decisions (approve/deny) are made by
-- the server (admin endpoints), which runs on a privileged connection.
drop policy if exists accessreq_own_select on "AccessRequest";
create policy accessreq_own_select on "AccessRequest" for select
  using ("userId" = public.app_user_id());

drop policy if exists accessreq_own_insert on "AccessRequest";
create policy accessreq_own_insert on "AccessRequest" for insert
  with check ("userId" = public.app_user_id());
