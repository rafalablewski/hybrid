-- HYBRID — Email system tables (transactional + marketing + lifecycle automation).
-- Run in the Supabase SQL Editor. Mirrors prisma/schema.prisma models
-- EmailCampaign / EmailSequence / EmailSequenceStep / EmailEnrollment /
-- EmailMessage / EmailSuppression.
--
-- All of these are written + read ONLY through the service-role Prisma connection
-- (the admin Email console, the cron worker, and the transactional senders) —
-- never by a browser/Supabase client. So RLS is enabled with NO policies: that
-- denies all anon/authenticated access while the server (which bypasses RLS)
-- keeps full access. The one public touchpoint, unsubscribe, is an HMAC-signed
-- server route that writes EmailSuppression via the service role.

-- One-off broadcast to an audience segment.
create table if not exists "EmailCampaign" (
  "id"           text primary key default gen_random_uuid()::text,
  "subject"      text not null,
  "body"         text not null,
  "audience"     text not null default 'all',   -- all | free | paid | coaches | clients | admins
  "status"       text not null default 'draft', -- draft | scheduled | sending | sent | failed
  "scheduledAt"  timestamp(3),
  "sentAt"       timestamp(3),
  "sentCount"    integer not null default 0,
  "failedCount"  integer not null default 0,
  "createdById"  text,
  "createdEmail" text,
  "createdAt"    timestamp(3) not null default now(),
  "updatedAt"    timestamp(3) not null default now()
);
create index if not exists "EmailCampaign_status_scheduledAt_idx"
  on "EmailCampaign" ("status", "scheduledAt");

-- Automated, multi-step lifecycle flow.
create table if not exists "EmailSequence" (
  "id"        text primary key default gen_random_uuid()::text,
  "name"      text not null,
  "trigger"   text not null default 'signup',  -- signup | inactive | trial_ending | upgraded | coach_approved | manual
  "audience"  text not null default 'all',
  "active"    boolean not null default false,
  "createdAt" timestamp(3) not null default now(),
  "updatedAt" timestamp(3) not null default now()
);
create index if not exists "EmailSequence_trigger_active_idx"
  on "EmailSequence" ("trigger", "active");

-- One email within a sequence (fired delayHours after the previous step).
create table if not exists "EmailSequenceStep" (
  "id"         text primary key default gen_random_uuid()::text,
  "sequenceId" text not null references "EmailSequence"("id") on delete cascade,
  "order"      integer not null default 0,
  "delayHours" integer not null default 0,
  "subject"    text not null,
  "body"       text not null
);
create index if not exists "EmailSequenceStep_sequenceId_idx"
  on "EmailSequenceStep" ("sequenceId");

-- A user's progress through a sequence.
create table if not exists "EmailEnrollment" (
  "id"          text primary key default gen_random_uuid()::text,
  "sequenceId"  text not null references "EmailSequence"("id") on delete cascade,
  "userId"      text not null,
  "email"       text not null,
  "status"      text not null default 'active', -- active | completed | cancelled
  "currentStep" integer not null default 0,
  "nextSendAt"  timestamp(3),
  "enrolledAt"  timestamp(3) not null default now(),
  constraint "EmailEnrollment_sequenceId_userId_key" unique ("sequenceId", "userId")
);
create index if not exists "EmailEnrollment_status_nextSendAt_idx"
  on "EmailEnrollment" ("status", "nextSendAt");

-- The deliverability ledger — one row per attempted send.
create table if not exists "EmailMessage" (
  "id"         text primary key default gen_random_uuid()::text,
  "campaignId" text references "EmailCampaign"("id") on delete set null,
  "sequenceId" text,
  "userId"     text,
  "email"      text not null,
  "subject"    text not null,
  "kind"       text not null default 'campaign', -- campaign | sequence | transactional | verification
  "status"     text not null default 'sent',     -- sent | failed | bounced
  "providerId" text,
  "error"      text,
  "openedAt"   timestamp(3),
  "clickedAt"  timestamp(3),
  "createdAt"  timestamp(3) not null default now()
);
create index if not exists "EmailMessage_email_idx" on "EmailMessage" ("email");
create index if not exists "EmailMessage_userId_idx" on "EmailMessage" ("userId");
create index if not exists "EmailMessage_kind_createdAt_idx" on "EmailMessage" ("kind", "createdAt");

-- Unsubscribe / bounce / complaint list (checked before every marketing send).
create table if not exists "EmailSuppression" (
  "email"     text primary key,
  "reason"    text not null default 'unsubscribe', -- unsubscribe | bounce | complaint
  "createdAt" timestamp(3) not null default now()
);

-- Lock the tables down (server-only; RLS on, no policies).
alter table "EmailCampaign"     enable row level security;
alter table "EmailSequence"     enable row level security;
alter table "EmailSequenceStep" enable row level security;
alter table "EmailEnrollment"   enable row level security;
alter table "EmailMessage"      enable row level security;
alter table "EmailSuppression"  enable row level security;
