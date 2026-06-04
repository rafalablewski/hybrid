-- HYBRID — Moderation queue (CMS content #6). Two feeders:
--   1) discoverable TalentProfiles awaiting approval (moderationStatus column),
--   2) user-submitted content Reports (flagged content).
-- Run in the Supabase SQL Editor. Mirrors prisma/schema.prisma.

-- 1) Talent profile moderation gate. Existing rows default to 'approved' so
--    nothing already-live disappears; the API sets a new/edited DISCOVERABLE
--    profile to 'pending', and discovery search requires 'approved'.
alter table "TalentProfile"
  add column if not exists "moderationStatus" text not null default 'approved';
alter table "TalentProfile"
  add column if not exists "moderationNote" text;
create index if not exists "TalentProfile_moderationStatus_idx"
  on "TalentProfile" ("moderationStatus");

-- 2) Content reports. Denormalized (no FKs) so a report survives a
--    reporter/target delete. Mutations happen via the server (Prisma bypasses
--    RLS); RLS here is defense-in-depth — a user may only INSERT their own
--    report, and there is no client SELECT policy (reads are server/admin-only).
create table if not exists "Report" (
  "id"              text primary key default gen_random_uuid()::text,
  "reporterId"      text not null,
  "reporterEmail"   text not null,
  "targetType"      text not null,
  "targetId"        text not null,
  "reason"          text not null,
  "detail"          text,
  "status"          text not null default 'open',   -- open | resolved | dismissed
  "resolution"      text,
  "resolvedById"    text,
  "resolvedByEmail" text,
  "resolvedAt"      timestamp(3),
  "createdAt"       timestamp(3) not null default now()
);
create index if not exists "Report_status_idx" on "Report" ("status");
create index if not exists "Report_target_idx" on "Report" ("targetType", "targetId");

alter table "Report" enable row level security;

-- a signed-in user may file (insert) a report as themselves; no select/update/
-- delete policy exists, so reading + resolving is server/admin-only.
-- PREREQUISITE: reference/rls-policies.sql defines public.app_user_id().
drop policy if exists report_own_insert on "Report";
create policy report_own_insert on "Report" for insert to authenticated
  with check ("reporterId" = public.app_user_id());
