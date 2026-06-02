-- HYBRID — RtpProtocol table (return-to-play rails).
-- Run in the Supabase SQL Editor. Mirrors prisma/schema.prisma model
-- RtpProtocol. RTP is medical-tier: own-rows + active-coach read (like Session).
-- Relies on public.app_user_id() + public.is_active_coach() from rls-policies.sql.

create table if not exists "RtpProtocol" (
  "id"         text primary key default gen_random_uuid()::text,
  "userId"     text not null references "User"("id"),
  "tissue"     text not null,
  "injuryDate" timestamp(3) not null,
  "stage"      text not null default 'acute',
  "completed"  jsonb not null default '[]'::jsonb,
  "status"     text not null default 'active',
  "createdAt"  timestamp(3) not null default now()
);
create index if not exists "RtpProtocol_userId_idx" on "RtpProtocol" ("userId");

alter table "RtpProtocol" enable row level security;

drop policy if exists rtp_own on "RtpProtocol";
create policy rtp_own on "RtpProtocol" for all
  using ("userId" = public.app_user_id())
  with check ("userId" = public.app_user_id());

drop policy if exists rtp_coach_read on "RtpProtocol";
create policy rtp_coach_read on "RtpProtocol" for select
  using (public.is_active_coach("userId"));
