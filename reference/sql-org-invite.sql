-- HYBRID — OrgInvite table (pending org invitations for non-users).
-- Run in the Supabase SQL Editor. Mirrors prisma/schema.prisma model OrgInvite.
-- Invites are written/read server-side via the API (prisma); RLS here is
-- defense-in-depth: a member of the org may read its pending invites.

create table if not exists "OrgInvite" (
  "id"        text primary key default gen_random_uuid()::text,
  "orgId"     text not null references "Organization"("id"),
  "email"     text not null,
  "role"      text not null,
  "teamId"    text,
  "status"    text not null default 'pending',
  "createdAt" timestamp(3) not null default now(),
  unique ("orgId", "email")
);
create index if not exists "OrgInvite_email_idx" on "OrgInvite" ("email");

alter table "OrgInvite" enable row level security;

-- relies on public.is_org_member() from sql-org-graph.sql
drop policy if exists invite_read on "OrgInvite";
create policy invite_read on "OrgInvite" for select using (public.is_org_member("orgId"));
