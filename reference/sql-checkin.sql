-- HYBRID — Checkin table (the weekly online-coaching check-in).
-- Run in the Supabase SQL Editor. Mirrors prisma/schema.prisma model Checkin.
-- Authored by the client (own-rows); a coach reads + replies via an ACTIVE
-- CoachLink. PREREQUISITE: run reference/rls-policies.sql FIRST — it defines
-- public.app_user_id() + public.is_active_coach(); without them the policy
-- statements error and (in a single transaction) roll the table back.

create table if not exists "Checkin" (
  "id"           text primary key default gen_random_uuid()::text,
  "userId"       text not null references "User"("id"),
  "weekOf"       timestamp(3) not null,
  "bodyMassKg"   double precision,
  "energy"       integer,
  "sleep"        integer,
  "soreness"     integer,
  "mood"         integer,
  "adherencePct" integer,
  "note"         text,
  "coachReply"   text,
  "repliedAt"    timestamp(3),
  "createdAt"    timestamp(3) not null default now()
);
create index if not exists "Checkin_userId_idx" on "Checkin" ("userId");

alter table "Checkin" enable row level security;

-- the athlete owns their check-ins
drop policy if exists checkin_own on "Checkin";
create policy checkin_own on "Checkin" for all
  using ("userId" = public.app_user_id())
  with check ("userId" = public.app_user_id());

-- an active coach can read their client's check-ins
drop policy if exists checkin_coach_read on "Checkin";
create policy checkin_coach_read on "Checkin" for select
  using (public.is_active_coach("userId"));

-- an active coach can reply (update) on their client's check-ins
drop policy if exists checkin_coach_reply on "Checkin";
create policy checkin_coach_reply on "Checkin" for update
  using (public.is_active_coach("userId"))
  with check (public.is_active_coach("userId"));
