-- HYBRID — Row Level Security: ENABLE + extend coverage (defense-in-depth).
-- Run in the Supabase SQL Editor AFTER reference/rls-policies.sql (it depends on
-- the public.app_user_id() + public.is_active_coach() helpers defined there).
--
-- WHY THIS FILE EXISTS:
--   1. rls-policies.sql CREATES policies but never runs ENABLE ROW LEVEL SECURITY,
--      so those policies are inert — Postgres ignores a policy until RLS is
--      enabled on the table. This file enables it.
--   2. ~10 user-data tables (Signal, Checkin, Connection w/ OAuth tokens, RTP,
--      video, events, talent, risk, templates, onboarding) had NO policy at all,
--      so with the anon/PostgREST grants Supabase adds to the public schema they
--      were potentially directly readable. This adds self-ownership policies and
--      a deny-all baseline for the relational/admin tables.
--
-- SAFE FOR THE APP: the API reads/writes via Prisma (the privileged postgres role,
-- which BYPASSES RLS), so none of this changes app behaviour. It only restricts
-- direct anon-key / PostgREST access, which the app never uses for data.
-- Idempotent: re-runnable.

-- ===========================================================================
-- 1. Enable RLS on the tables rls-policies.sql already wrote policies for
--    (the original file forgot to enable it, leaving the policies inert).
-- ===========================================================================
alter table "User"       enable row level security;
alter table "Session"    enable row level security;
alter table "Macrocycle" enable row level security;
alter table "Biometric"  enable row level security;
alter table "CoachLink"  enable row level security;
alter table "CoachNote"  enable row level security;
alter table "Plan"       enable row level security;

-- ===========================================================================
-- 2. User-owned tables — self ownership (+ coach read where the product allows).
-- ===========================================================================

-- Signal — the athlete's ontology; a coach reads it via an ACTIVE CoachLink.
alter table "Signal" enable row level security;
drop policy if exists signal_own on "Signal";
create policy signal_own on "Signal" for all
  using ("userId" = public.app_user_id())
  with check ("userId" = public.app_user_id());
drop policy if exists signal_coach_read on "Signal";
create policy signal_coach_read on "Signal" for select
  using (public.is_active_coach("userId"));

-- Checkin — a coach may read ONLY check-ins the client chose to share.
alter table "Checkin" enable row level security;
drop policy if exists checkin_own on "Checkin";
create policy checkin_own on "Checkin" for all
  using ("userId" = public.app_user_id())
  with check ("userId" = public.app_user_id());
drop policy if exists checkin_coach_read on "Checkin";
create policy checkin_coach_read on "Checkin" for select
  using (public.is_active_coach("userId") and "sharedWithCoach");

-- WorkoutTemplate — owner only.
alter table "WorkoutTemplate" enable row level security;
drop policy if exists template_own on "WorkoutTemplate";
create policy template_own on "WorkoutTemplate" for all
  using ("ownerId" = public.app_user_id())
  with check ("ownerId" = public.app_user_id());

-- Assignment — the athlete and the assigning coach.
alter table "Assignment" enable row level security;
drop policy if exists assignment_own on "Assignment";
create policy assignment_own on "Assignment" for all
  using ("athleteId" = public.app_user_id() or "assignedById" = public.app_user_id())
  with check ("athleteId" = public.app_user_id() or "assignedById" = public.app_user_id());

-- RtpProtocol (return-to-play) — self + coach read.
alter table "RtpProtocol" enable row level security;
drop policy if exists rtp_own on "RtpProtocol";
create policy rtp_own on "RtpProtocol" for all
  using ("userId" = public.app_user_id())
  with check ("userId" = public.app_user_id());
drop policy if exists rtp_coach_read on "RtpProtocol";
create policy rtp_coach_read on "RtpProtocol" for select
  using (public.is_active_coach("userId"));

-- VideoAnalysis / Event / TalentProfile / RiskOutcome — self only.
alter table "VideoAnalysis" enable row level security;
drop policy if exists video_own on "VideoAnalysis";
create policy video_own on "VideoAnalysis" for all
  using ("userId" = public.app_user_id()) with check ("userId" = public.app_user_id());

alter table "Event" enable row level security;
drop policy if exists event_own on "Event";
create policy event_own on "Event" for all
  using ("userId" = public.app_user_id()) with check ("userId" = public.app_user_id());

alter table "TalentProfile" enable row level security;
drop policy if exists talent_own on "TalentProfile";
create policy talent_own on "TalentProfile" for all
  using ("userId" = public.app_user_id()) with check ("userId" = public.app_user_id());

alter table "RiskOutcome" enable row level security;
drop policy if exists risk_own on "RiskOutcome";
create policy risk_own on "RiskOutcome" for all
  using ("userId" = public.app_user_id()) with check ("userId" = public.app_user_id());

-- Connection — holds (encrypted) OAuth tokens; strictly self, never coach.
alter table "Connection" enable row level security;
drop policy if exists connection_own on "Connection";
create policy connection_own on "Connection" for all
  using ("userId" = public.app_user_id()) with check ("userId" = public.app_user_id());

-- OnboardingState / FeatureGrant / AccessRequest / CoachApplication — self.
alter table "OnboardingState" enable row level security;
drop policy if exists onboarding_own on "OnboardingState";
create policy onboarding_own on "OnboardingState" for all
  using ("userId" = public.app_user_id()) with check ("userId" = public.app_user_id());

alter table "FeatureGrant" enable row level security;
drop policy if exists grant_own on "FeatureGrant";
create policy grant_own on "FeatureGrant" for select
  using ("userId" = public.app_user_id());

alter table "AccessRequest" enable row level security;
drop policy if exists accessreq_own on "AccessRequest";
create policy accessreq_own on "AccessRequest" for all
  using ("userId" = public.app_user_id()) with check ("userId" = public.app_user_id());

alter table "CoachApplication" enable row level security;
drop policy if exists coachapp_own on "CoachApplication";
create policy coachapp_own on "CoachApplication" for all
  using ("userId" = public.app_user_id()) with check ("userId" = public.app_user_id());

-- ===========================================================================
-- 3. Deny-all baseline (RLS on, no permissive policy) for relational / coach /
--    org / admin / system tables. Anon/PostgREST gets nothing; Prisma (the
--    privileged role) still has full access, so the app is unaffected. The org
--    and coach access paths are enforced relationally in the API.
-- ===========================================================================
alter table "CoachGroup"          enable row level security;
alter table "CoachProgram"        enable row level security;
alter table "CoachInvite"         enable row level security;
alter table "CoachDiet"           enable row level security;
alter table "Organization"        enable row level security;
alter table "Team"                enable row level security;
alter table "Membership"          enable row level security;
alter table "OrgInvite"           enable row level security;
alter table "AnonSession"         enable row level security;
alter table "ModelFit"            enable row level security;
alter table "Announcement"        enable row level security;
alter table "Exercise"            enable row level security;
alter table "MediaAsset"          enable row level security;
alter table "Translation"         enable row level security;
alter table "FeatureFlag"         enable row level security;
alter table "OnboardingQuestion"  enable row level security;
alter table "AgentConfig"         enable row level security;
alter table "AgentRun"            enable row level security;
alter table "AgentSchedule"       enable row level security;
alter table "AgentKpiMeasurement" enable row level security;
alter table "AgentApproval"       enable row level security;
alter table "AgentNotification"   enable row level security;
alter table "Report"              enable row level security;
alter table "AdminAudit"          enable row level security;
alter table "EmailCampaign"       enable row level security;
alter table "EmailSequence"       enable row level security;
alter table "EmailSequenceStep"   enable row level security;
alter table "EmailEnrollment"     enable row level security;
alter table "EmailMessage"        enable row level security;
alter table "EmailSuppression"    enable row level security;
