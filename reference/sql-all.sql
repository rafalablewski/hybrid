-- ===========================================================================
-- HYBRID — ALL database hardening in one script.
-- Paste this whole file into the Supabase SQL Editor and Run. It executes as a
-- single transaction, so there is NO "CREATE INDEX CONCURRENTLY cannot run inside
-- a transaction block" error — the indexes below are plain CREATE INDEX.
--
-- Safe + idempotent: re-running it is a no-op. Resilient: every statement is
-- guarded (ALTER TABLE IF EXISTS / to_regclass), so any table that hasn't been
-- migrated yet is silently skipped rather than aborting the whole script.
--
-- The app reads/writes via Prisma (the privileged postgres role, which BYPASSES
-- RLS), so none of this changes app behaviour — it is pure defense-in-depth.
--
-- Order (handled for you):
--   1. Performance indexes
--   2. ON DELETE cascade foreign keys (GDPR / deletion safety net)
--   3. RLS helpers + base policies        (defines public.app_user_id() etc.)
--   4. RLS enable + extended coverage     (depends on the helpers in step 3)
-- ===========================================================================


-- ===========================================================================
-- PART 1 / 4 — PERFORMANCE INDEXES
-- ===========================================================================
do $$
begin
  -- "This user's sessions, newest first" — History + every analytics engine.
  if to_regclass('public."Session"') is not null then
    execute 'create index if not exists "Session_userId_startedAt_idx" on "Session" ("userId", "startedAt")';
  end if;
  -- Coach views read a client's SHARED check-ins.
  if to_regclass('public."Checkin"') is not null then
    execute 'create index if not exists "Checkin_userId_sharedWithCoach_idx" on "Checkin" ("userId", "sharedWithCoach")';
  end if;
  -- Calendar reads an athlete's assignments by date.
  if to_regclass('public."Assignment"') is not null then
    execute 'create index if not exists "Assignment_athleteId_date_idx" on "Assignment" ("athleteId", "date")';
  end if;
end $$;

-- ===========================================================================
-- PART 2 / 4 — ON DELETE CASCADE FOREIGN KEYS
-- ===========================================================================
-- DropForeignKey
ALTER TABLE IF EXISTS "CoachLink" DROP CONSTRAINT IF EXISTS "CoachLink_coachId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "CoachLink" DROP CONSTRAINT IF EXISTS "CoachLink_clientId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "CoachGroup" DROP CONSTRAINT IF EXISTS "CoachGroup_coachId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "CoachProgram" DROP CONSTRAINT IF EXISTS "CoachProgram_coachId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "CoachInvite" DROP CONSTRAINT IF EXISTS "CoachInvite_coachId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "CoachDiet" DROP CONSTRAINT IF EXISTS "CoachDiet_coachId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "Checkin" DROP CONSTRAINT IF EXISTS "Checkin_userId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "WorkoutTemplate" DROP CONSTRAINT IF EXISTS "WorkoutTemplate_ownerId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "Assignment" DROP CONSTRAINT IF EXISTS "Assignment_athleteId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "Assignment" DROP CONSTRAINT IF EXISTS "Assignment_assignedById_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "CoachNote" DROP CONSTRAINT IF EXISTS "CoachNote_linkId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "Session" DROP CONSTRAINT IF EXISTS "Session_userId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "Macrocycle" DROP CONSTRAINT IF EXISTS "Macrocycle_userId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "Biometric" DROP CONSTRAINT IF EXISTS "Biometric_userId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "Signal" DROP CONSTRAINT IF EXISTS "Signal_userId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "Team" DROP CONSTRAINT IF EXISTS "Team_orgId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "Membership" DROP CONSTRAINT IF EXISTS "Membership_orgId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "Membership" DROP CONSTRAINT IF EXISTS "Membership_userId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "RtpProtocol" DROP CONSTRAINT IF EXISTS "RtpProtocol_userId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "VideoAnalysis" DROP CONSTRAINT IF EXISTS "VideoAnalysis_userId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "Event" DROP CONSTRAINT IF EXISTS "Event_userId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "TalentProfile" DROP CONSTRAINT IF EXISTS "TalentProfile_userId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "RiskOutcome" DROP CONSTRAINT IF EXISTS "RiskOutcome_userId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "Connection" DROP CONSTRAINT IF EXISTS "Connection_userId_fkey";

-- AddForeignKey
ALTER TABLE IF EXISTS "CoachLink" ADD CONSTRAINT "CoachLink_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "CoachLink" ADD CONSTRAINT "CoachLink_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "CoachGroup" ADD CONSTRAINT "CoachGroup_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "CoachProgram" ADD CONSTRAINT "CoachProgram_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "CoachInvite" ADD CONSTRAINT "CoachInvite_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "CoachDiet" ADD CONSTRAINT "CoachDiet_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "Checkin" ADD CONSTRAINT "Checkin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "WorkoutTemplate" ADD CONSTRAINT "WorkoutTemplate_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "Assignment" ADD CONSTRAINT "Assignment_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "Assignment" ADD CONSTRAINT "Assignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "CoachNote" ADD CONSTRAINT "CoachNote_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "CoachLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "Macrocycle" ADD CONSTRAINT "Macrocycle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "Biometric" ADD CONSTRAINT "Biometric_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "Signal" ADD CONSTRAINT "Signal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "Team" ADD CONSTRAINT "Team_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "Membership" ADD CONSTRAINT "Membership_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "RtpProtocol" ADD CONSTRAINT "RtpProtocol_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "VideoAnalysis" ADD CONSTRAINT "VideoAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "Event" ADD CONSTRAINT "Event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "TalentProfile" ADD CONSTRAINT "TalentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "RiskOutcome" ADD CONSTRAINT "RiskOutcome_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "Connection" ADD CONSTRAINT "Connection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ===========================================================================
-- PART 3 / 4 — ROW LEVEL SECURITY: helpers + base policies
-- ===========================================================================
-- ---- helpers -------------------------------------------------------------
create or replace function public.app_user_id() returns text
  language sql stable security definer set search_path = public as $$
  select id from "User" where "authId" = auth.uid()::text
$$;

create or replace function public.is_active_coach(client_id text) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from "CoachLink"
    where "coachId" = public.app_user_id()
      and "clientId" = client_id
      and status = 'ACTIVE'
  )
$$;

-- ---- User ----------------------------------------------------------------
-- SECURITY: PostgREST enforces column GRANTs, not policy intent. Revoke table-
-- wide UPDATE from the API roles and re-grant only safe profile columns, so a
-- signed-in user can't PATCH their own role/entitlement to escalate. Prisma
-- (privileged role) is unaffected.
revoke update on "User" from anon, authenticated;
grant  update ("name", "language") on "User" to authenticated;

drop policy if exists user_self_select on "User";
create policy user_self_select on "User" for select
  using ("authId" = auth.uid()::text or id = public.app_user_id());
drop policy if exists user_self_update on "User";
create policy user_self_update on "User" for update
  using ("authId" = auth.uid()::text)
  with check ("authId" = auth.uid()::text);

-- ---- Session -------------------------------------------------------------
drop policy if exists session_own on "Session";
create policy session_own on "Session" for all
  using ("userId" = public.app_user_id())
  with check ("userId" = public.app_user_id());
drop policy if exists session_coach_read on "Session";
create policy session_coach_read on "Session" for select
  using (public.is_active_coach("userId"));

-- ---- Macrocycle ----------------------------------------------------------
drop policy if exists macro_own on "Macrocycle";
create policy macro_own on "Macrocycle" for all
  using ("userId" = public.app_user_id())
  with check ("userId" = public.app_user_id());

-- ---- Biometric -----------------------------------------------------------
drop policy if exists bio_own on "Biometric";
create policy bio_own on "Biometric" for all
  using ("userId" = public.app_user_id())
  with check ("userId" = public.app_user_id());

-- ---- CoachLink -----------------------------------------------------------
drop policy if exists link_read on "CoachLink";
create policy link_read on "CoachLink" for select
  using ("coachId" = public.app_user_id() or "clientId" = public.app_user_id());
-- SECURITY: a coach may only CREATE a PENDING link; only the CLIENT may accept
-- it (move to ACTIVE). Blocks forging {coachId: me, clientId: victim,
-- status: ACTIVE} to read a victim's data via is_active_coach().
drop policy if exists link_insert on "CoachLink";
create policy link_insert on "CoachLink" for insert
  with check ("coachId" = public.app_user_id() and status = 'PENDING');
drop policy if exists link_update on "CoachLink";
create policy link_update on "CoachLink" for update
  using ("coachId" = public.app_user_id() or "clientId" = public.app_user_id())
  with check (
    ("coachId" = public.app_user_id() or "clientId" = public.app_user_id())
    and (status <> 'ACTIVE' or "clientId" = public.app_user_id())
  );

-- ---- CoachNote -----------------------------------------------------------
drop policy if exists note_read on "CoachNote";
create policy note_read on "CoachNote" for select
  using (
    exists (select 1 from "CoachLink" l where l.id = "linkId" and l."coachId" = public.app_user_id())
    or (
      not "private"
      and exists (select 1 from "CoachLink" l where l.id = "linkId" and l."clientId" = public.app_user_id())
    )
  );
drop policy if exists note_insert on "CoachNote";
create policy note_insert on "CoachNote" for insert
  with check (
    exists (
      select 1 from "CoachLink" l
      where l.id = "linkId" and l."coachId" = public.app_user_id() and l.status = 'ACTIVE'
    )
  );

-- ---- Plan (public library) ----------------------------------------------
drop policy if exists plan_read on "Plan";
create policy plan_read on "Plan" for select using (auth.role() = 'authenticated');

-- ===========================================================================
-- PART 4 / 4 — ROW LEVEL SECURITY: enable + extended coverage
-- ===========================================================================
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

-- Stripe idempotency ledger — server-only (deny-all to PostgREST).
alter table if exists "ProcessedWebhookEvent" enable row level security;

-- ===========================================================================
-- 5. Blanket hardening — no anonymous PostgREST access to application tables.
--    Every client goes through /api (Prisma); no client uses the anon key for
--    table data (only Storage). Revoke the unauthenticated grant behind the
--    per-table policies above. storage.objects RLS is unaffected.
-- ===========================================================================
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
