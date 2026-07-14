-- HYBRID — Org Graph tables (Team Operating System).
-- Run in the Supabase SQL Editor. Mirrors prisma/schema.prisma models
-- Organization / Team / Membership. RLS: a member can read their org, its
-- teams, and its roster. Fine-grained sensitivity (medical vs performance) is
-- enforced in the API via @hybrid/core org.ts; this is the org-boundary gate.

create table if not exists "Organization" (
  "id"        text primary key default gen_random_uuid()::text,
  "name"      text not null,
  "createdAt" timestamp(3) not null default now()
);

create table if not exists "Team" (
  "id"        text primary key default gen_random_uuid()::text,
  "orgId"     text not null references "Organization"("id"),
  "name"      text not null,
  "parentId"  text references "Team"("id"),
  "createdAt" timestamp(3) not null default now()
);
create index if not exists "Team_orgId_idx" on "Team" ("orgId");
create index if not exists "Team_parentId_idx" on "Team" ("parentId");

create table if not exists "Membership" (
  "id"        text primary key default gen_random_uuid()::text,
  "orgId"     text not null references "Organization"("id"),
  "userId"    text not null references "User"("id"),
  "role"      text not null,
  "teamId"    text,
  "createdAt" timestamp(3) not null default now(),
  unique ("orgId", "userId")
);
create index if not exists "Membership_orgId_idx" on "Membership" ("orgId");
create index if not exists "Membership_userId_idx" on "Membership" ("userId");

-- helper: is the current app user a member of this org?
create or replace function public.is_org_member(org text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from "Membership" m
    where m."orgId" = org and m."userId" = public.app_user_id()
  );
$$;

alter table "Organization" enable row level security;
alter table "Team" enable row level security;
alter table "Membership" enable row level security;

-- SECURITY: the org graph is created and mutated exclusively through the /api
-- layer (Prisma, privileged role) with role checks (canAssignRole etc.). All
-- WRITES are therefore server-only here — no `with check (true)` / member-wide
-- write, which previously let anyone self-join ANY org as OWNER via the anon key
-- (self-insert Membership) or create orgs / restructure teams directly. Only the
-- member-scoped READS are exposed to PostgREST as defense-in-depth.

-- Organization: members read; creation is server-only.
drop policy if exists org_read on "Organization";
create policy org_read on "Organization" for select using (public.is_org_member("id"));
drop policy if exists org_insert on "Organization";  -- was `with check (true)` — removed (server-only)

-- Team: members read; writes are server-only.
drop policy if exists team_read on "Team";
create policy team_read on "Team" for select using (public.is_org_member("orgId"));
drop policy if exists team_write on "Team";           -- was member-wide `for all` — removed (server-only)

-- Membership: members read their org's rows; inserts/updates are server-only
-- (an invite is materialized into a membership by the API, with the role checked
-- there). Self-insert is removed so a user can't grant themselves OWNER anywhere.
drop policy if exists member_read on "Membership";
create policy member_read on "Membership" for select using (public.is_org_member("orgId"));
drop policy if exists member_self_insert on "Membership";  -- removed (server-only)
