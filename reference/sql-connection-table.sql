-- HYBRID — Connection table (wearable/sensor OAuth accounts).
-- Run in the Supabase SQL Editor. Mirrors prisma/schema.prisma model Connection.
-- Own-rows RLS only: tokens are never exposed to coaches. Encrypt tokens at
-- rest in production (e.g. pgsodium / app-layer encryption) — they are stored
-- here so the server can sync provider data into the Signal ontology.

create table if not exists "Connection" (
  "id"           text primary key default gen_random_uuid()::text,
  "userId"       text not null references "User"("id"),
  "provider"     text not null,
  "status"       text not null default 'active',
  "accessToken"  text,
  "refreshToken" text,
  "expiresAt"    timestamp(3),
  "scope"        text,
  "lastSyncAt"   timestamp(3),
  "createdAt"    timestamp(3) not null default now(),
  unique ("userId", "provider")
);

create index if not exists "Connection_userId_idx" on "Connection" ("userId");

alter table "Connection" enable row level security;

drop policy if exists connection_own on "Connection";
create policy connection_own on "Connection" for all
  using ("userId" = public.app_user_id())
  with check ("userId" = public.app_user_id());
