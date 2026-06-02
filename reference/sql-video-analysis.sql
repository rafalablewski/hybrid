-- HYBRID — VideoAnalysis table (markerless motion analysis results).
-- Run in the Supabase SQL Editor. Mirrors prisma/schema.prisma model
-- VideoAnalysis. Own-rows + active-coach read (like Session).
-- Relies on public.app_user_id() + public.is_active_coach() from rls-policies.sql.

create table if not exists "VideoAnalysis" (
  "id"        text primary key default gen_random_uuid()::text,
  "userId"    text not null references "User"("id"),
  "movement"  text not null,
  "metrics"   jsonb not null,
  "createdAt" timestamp(3) not null default now()
);
create index if not exists "VideoAnalysis_userId_idx" on "VideoAnalysis" ("userId");

alter table "VideoAnalysis" enable row level security;

drop policy if exists video_own on "VideoAnalysis";
create policy video_own on "VideoAnalysis" for all
  using ("userId" = public.app_user_id())
  with check ("userId" = public.app_user_id());

drop policy if exists video_coach_read on "VideoAnalysis";
create policy video_coach_read on "VideoAnalysis" for select
  using (public.is_active_coach("userId"));
