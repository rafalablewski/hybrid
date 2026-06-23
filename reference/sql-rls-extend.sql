-- HYBRID — Row Level Security: ENABLE + extend coverage (defense-in-depth).
-- Run in the Supabase SQL Editor AFTER reference/rls-policies.sql (it depends on
-- the public.app_user_id() + public.is_active_coach() helpers defined there).
--
-- WHY THIS FILE EXISTS:
--   1. rls-policies.sql CREATES policies but never runs ENABLE ROW LEVEL SECURITY,
--      so those policies are inert — Postgres ignores a policy until RLS is
--      enabled on the table. This file enables it.
--   2. ~10 user-data tables (Signal, Checkin, Connection w/ OAuth tokens, RTP,
--      video, events, talent, risk, templates, onboarding) had NO policy at all.
--      This adds self-ownership policies + a deny-all baseline for the
--      relational/admin tables.
--
-- SAFE FOR THE APP: the API reads/writes via Prisma (the privileged postgres role,
-- which BYPASSES RLS), so none of this changes app behaviour. It only restricts
-- direct anon-key / PostgREST access, which the app never uses for data.
--
-- RESILIENT: every statement is guarded (ALTER TABLE IF EXISTS / to_regclass), so
-- a table that hasn't been migrated yet is silently skipped, not a fatal error.
-- Idempotent: re-runnable.

-- ===========================================================================
-- 1. Enable RLS on the tables rls-policies.sql already wrote policies for
--    (the original file forgot to enable it, leaving the policies inert).
-- ===========================================================================
alter table if exists "User"       enable row level security;
alter table if exists "Session"    enable row level security;
alter table if exists "Macrocycle" enable row level security;
alter table if exists "Biometric"  enable row level security;
alter table if exists "CoachLink"  enable row level security;
alter table if exists "CoachNote"  enable row level security;
alter table if exists "Plan"       enable row level security;

-- ===========================================================================
-- 2. User-owned tables — self ownership (+ coach read where the product allows).
--    Each block is skipped if the table doesn't exist yet.
-- ===========================================================================
do $$
begin
  -- Signal — the athlete's ontology; a coach reads it via an ACTIVE CoachLink.
  if to_regclass('public."Signal"') is not null then
    execute 'alter table "Signal" enable row level security';
    execute 'drop policy if exists signal_own on "Signal"';
    execute 'create policy signal_own on "Signal" for all using ("userId" = public.app_user_id()) with check ("userId" = public.app_user_id())';
    execute 'drop policy if exists signal_coach_read on "Signal"';
    execute 'create policy signal_coach_read on "Signal" for select using (public.is_active_coach("userId"))';
  end if;

  -- Checkin — a coach may read ONLY check-ins the client chose to share.
  if to_regclass('public."Checkin"') is not null then
    execute 'alter table "Checkin" enable row level security';
    execute 'drop policy if exists checkin_own on "Checkin"';
    execute 'create policy checkin_own on "Checkin" for all using ("userId" = public.app_user_id()) with check ("userId" = public.app_user_id())';
    execute 'drop policy if exists checkin_coach_read on "Checkin"';
    execute 'create policy checkin_coach_read on "Checkin" for select using (public.is_active_coach("userId") and "sharedWithCoach")';
  end if;

  -- WorkoutTemplate — owner only.
  if to_regclass('public."WorkoutTemplate"') is not null then
    execute 'alter table "WorkoutTemplate" enable row level security';
    execute 'drop policy if exists template_own on "WorkoutTemplate"';
    execute 'create policy template_own on "WorkoutTemplate" for all using ("ownerId" = public.app_user_id()) with check ("ownerId" = public.app_user_id())';
  end if;

  -- Assignment — the athlete and the assigning coach.
  if to_regclass('public."Assignment"') is not null then
    execute 'alter table "Assignment" enable row level security';
    execute 'drop policy if exists assignment_own on "Assignment"';
    execute 'create policy assignment_own on "Assignment" for all using ("athleteId" = public.app_user_id() or "assignedById" = public.app_user_id()) with check ("athleteId" = public.app_user_id() or "assignedById" = public.app_user_id())';
  end if;

  -- RtpProtocol (return-to-play) — self + coach read.
  if to_regclass('public."RtpProtocol"') is not null then
    execute 'alter table "RtpProtocol" enable row level security';
    execute 'drop policy if exists rtp_own on "RtpProtocol"';
    execute 'create policy rtp_own on "RtpProtocol" for all using ("userId" = public.app_user_id()) with check ("userId" = public.app_user_id())';
    execute 'drop policy if exists rtp_coach_read on "RtpProtocol"';
    execute 'create policy rtp_coach_read on "RtpProtocol" for select using (public.is_active_coach("userId"))';
  end if;

  -- VideoAnalysis / Event / TalentProfile / RiskOutcome — self only.
  if to_regclass('public."VideoAnalysis"') is not null then
    execute 'alter table "VideoAnalysis" enable row level security';
    execute 'drop policy if exists video_own on "VideoAnalysis"';
    execute 'create policy video_own on "VideoAnalysis" for all using ("userId" = public.app_user_id()) with check ("userId" = public.app_user_id())';
  end if;
  if to_regclass('public."Event"') is not null then
    execute 'alter table "Event" enable row level security';
    execute 'drop policy if exists event_own on "Event"';
    execute 'create policy event_own on "Event" for all using ("userId" = public.app_user_id()) with check ("userId" = public.app_user_id())';
  end if;
  if to_regclass('public."TalentProfile"') is not null then
    execute 'alter table "TalentProfile" enable row level security';
    execute 'drop policy if exists talent_own on "TalentProfile"';
    execute 'create policy talent_own on "TalentProfile" for all using ("userId" = public.app_user_id()) with check ("userId" = public.app_user_id())';
  end if;
  if to_regclass('public."RiskOutcome"') is not null then
    execute 'alter table "RiskOutcome" enable row level security';
    execute 'drop policy if exists risk_own on "RiskOutcome"';
    execute 'create policy risk_own on "RiskOutcome" for all using ("userId" = public.app_user_id()) with check ("userId" = public.app_user_id())';
  end if;

  -- Connection — holds (encrypted) OAuth tokens; strictly self, never coach.
  if to_regclass('public."Connection"') is not null then
    execute 'alter table "Connection" enable row level security';
    execute 'drop policy if exists connection_own on "Connection"';
    execute 'create policy connection_own on "Connection" for all using ("userId" = public.app_user_id()) with check ("userId" = public.app_user_id())';
  end if;

  -- OnboardingState / FeatureGrant / AccessRequest / CoachApplication — self.
  if to_regclass('public."OnboardingState"') is not null then
    execute 'alter table "OnboardingState" enable row level security';
    execute 'drop policy if exists onboarding_own on "OnboardingState"';
    execute 'create policy onboarding_own on "OnboardingState" for all using ("userId" = public.app_user_id()) with check ("userId" = public.app_user_id())';
  end if;
  if to_regclass('public."FeatureGrant"') is not null then
    execute 'alter table "FeatureGrant" enable row level security';
    execute 'drop policy if exists grant_own on "FeatureGrant"';
    execute 'create policy grant_own on "FeatureGrant" for select using ("userId" = public.app_user_id())';
  end if;
  if to_regclass('public."AccessRequest"') is not null then
    execute 'alter table "AccessRequest" enable row level security';
    execute 'drop policy if exists accessreq_own on "AccessRequest"';
    execute 'create policy accessreq_own on "AccessRequest" for all using ("userId" = public.app_user_id()) with check ("userId" = public.app_user_id())';
  end if;
  if to_regclass('public."CoachApplication"') is not null then
    execute 'alter table "CoachApplication" enable row level security';
    execute 'drop policy if exists coachapp_own on "CoachApplication"';
    execute 'create policy coachapp_own on "CoachApplication" for all using ("userId" = public.app_user_id()) with check ("userId" = public.app_user_id())';
  end if;
end $$;

-- ===========================================================================
-- 3. Deny-all baseline (RLS on, no permissive policy) for relational / coach /
--    org / admin / system tables. Anon/PostgREST gets nothing; Prisma (the
--    privileged role) still has full access, so the app is unaffected. The org
--    and coach access paths are enforced relationally in the API.
-- ===========================================================================
alter table if exists "CoachGroup"          enable row level security;
alter table if exists "CoachProgram"        enable row level security;
alter table if exists "CoachInvite"         enable row level security;
alter table if exists "CoachDiet"           enable row level security;
alter table if exists "Organization"        enable row level security;
alter table if exists "Team"                enable row level security;
alter table if exists "Membership"          enable row level security;
alter table if exists "OrgInvite"           enable row level security;
alter table if exists "AnonSession"         enable row level security;
alter table if exists "ModelFit"            enable row level security;
alter table if exists "Announcement"        enable row level security;
alter table if exists "Exercise"            enable row level security;
alter table if exists "MediaAsset"          enable row level security;
alter table if exists "Translation"         enable row level security;
alter table if exists "FeatureFlag"         enable row level security;
alter table if exists "OnboardingQuestion"  enable row level security;
alter table if exists "AgentConfig"         enable row level security;
alter table if exists "AgentRun"            enable row level security;
alter table if exists "AgentSchedule"       enable row level security;
alter table if exists "AgentKpiMeasurement" enable row level security;
alter table if exists "AgentApproval"       enable row level security;
alter table if exists "AgentNotification"   enable row level security;
alter table if exists "Report"              enable row level security;
alter table if exists "AdminAudit"          enable row level security;
alter table if exists "EmailCampaign"       enable row level security;
alter table if exists "EmailSequence"       enable row level security;
alter table if exists "EmailSequenceStep"   enable row level security;
alter table if exists "EmailEnrollment"     enable row level security;
alter table if exists "EmailMessage"        enable row level security;
alter table if exists "EmailSuppression"    enable row level security;
