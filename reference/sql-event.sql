-- HYBRID — Event table (target competitions for the peaking optimizer).
-- Run in the Supabase SQL Editor. Mirrors prisma/schema.prisma model Event.
-- Own-rows + active-coach read (like Session).
-- Relies on public.app_user_id() + public.is_active_coach() from rls-policies.sql.

create table if not exists "Event" (
  "id"        text primary key default gen_random_uuid()::text,
  "userId"    text not null references "User"("id"),
  "name"      text not null,
  "sport"     text not null,
  "date"      timestamp(3) not null,
  "createdAt" timestamp(3) not null default now()
);
create index if not exists "Event_userId_idx" on "Event" ("userId");

alter table "Event" enable row level security;

drop policy if exists event_own on "Event";
create policy event_own on "Event" for all
  using ("userId" = public.app_user_id())
  with check ("userId" = public.app_user_id());

drop policy if exists event_coach_read on "Event";
create policy event_coach_read on "Event" for select
  using (public.is_active_coach("userId"));
