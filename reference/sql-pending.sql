-- ===========================================================================
-- HYBRID — every outstanding migration, in one script, in dependency order.
--
-- STATUS: applied in production up to and including Session.device (the bundle
-- was run in the Supabase SQL Editor, Jul 2026). The NUTRITION LABEL PANEL at
-- the end of section 1 is APPENDED BUT NOT YET RUN — re-running the whole file
-- is a no-op for everything already applied and adds only that, so the safe
-- move is to paste the whole thing again. Future migrations append here.
--
-- Paste the WHOLE file into the Supabase SQL Editor and Run once.
--
-- Safe to re-run: every statement is idempotent (ADD COLUMN IF NOT EXISTS /
-- CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS / DROP POLICY IF
-- EXISTS before CREATE POLICY), and every block that touches a table which may
-- not exist yet is guarded with to_regclass or ALTER TABLE IF EXISTS. Nothing
-- here drops data. The one destructive statement in the set is the OPTIONAL
-- check-in cleanup at the very bottom, which is COMMENTED OUT — read its note
-- before enabling it.
--
-- The Supabase editor runs this as a single transaction, so it is all-or-
-- nothing: if any statement fails, nothing is applied. No CREATE INDEX
-- CONCURRENTLY is used, so there is no "cannot run inside a transaction block".
--
-- WHY THIS ORDER. It is not the order the files were written in:
--
--   1. Column adds first. They depend on nothing. All of section 1 (including
--      Session.feelLoggedAt, which the Prisma client declares and /api/sessions
--      depends on, and Session.device) is APPLIED in production (run Jul 2026)
--      and kept so the bundle stays complete and re-runnable.
--   2. sql-all.sql second, because PART 3 of it DEFINES public.app_user_id()
--      and public.is_active_coach(), which every RLS policy below calls. Run
--      the later sections first and they fail on an undefined function.
--   3. The tables that use those helpers.
--   4. A repeat of sql-all's blanket anon revoke at the end. Belt and braces:
--      step 3 creates tables AFTER that revoke ran, and the ALTER DEFAULT
--      PRIVILEGES alongside it already covers them (verified — see section 5),
--      but only for objects created by the role that ran it.
--
-- Assembled from the individual files in reference/, which remain the source of
-- truth — this bundle is a convenience, not a replacement. Sections name their
-- source file so the two can be diffed.
-- ===========================================================================


-- ===========================================================================
-- SECTION 1 / 6 — COLUMN ADDS
-- Sources: sql-feel-logged-at.sql, sql-body-height.sql, sql-session-notes.sql,
--          sql-routine-favourite.sql, sql-session-device.sql,
--          sql-nutrition-label-panel.sql
--
-- No dependencies, no RLS change — all four tables are already owner-scoped and
-- new columns inherit that. Existing rows keep NULL/default, which every model
-- reads as "unknown" and falls back on, so nothing already logged is
-- retroactively reinterpreted.
-- ===========================================================================

-- Session.feelLoggedAt — WHEN the athlete answered "how did that feel?". The
-- same 1-5 tap means opposite things at 10 minutes and at 10 hours; without the
-- timestamp both are the same row and the two-read recovery model is inert.
-- REQUIRED BEFORE DEPLOY (Prisma already declares it).
alter table "Session" add column if not exists "feelLoggedAt" timestamp(3);

-- BodyMetric.heightCm — there was no athlete height anywhere in the schema
-- (the existing `height` column is on MediaAsset and means image pixels). Lets
-- the recovery multiplier read body mass against the frame carrying it instead
-- of as raw kilos. ALREADY APPLIED in production (Jul 2026) — this line is a
-- no-op there and is kept so the bundle stays a complete, re-runnable set.
alter table "BodyMetric" add column if not exists "heightCm" double precision;

-- Session private note + mood + tags — owner-only post-workout reflection,
-- never serialised to a coach, the Activity feed or social.
alter table "Session" add column if not exists "note" text;
alter table "Session" add column if not exists "mood" integer;
alter table "Session" add column if not exists "tags" text[] not null default '{}';

-- WorkoutTemplate.favourite — the Quick-start sheet's Favourites rail. Until
-- this exists the sheet still works; favourites just don't persist.
alter table "WorkoutTemplate"
  add column if not exists "favourite" boolean not null default false;

-- Session.device — the device's read of the same workout (Apple Watch match):
-- one frozen JSON object written by the summary's match flow. REQUIRED BEFORE
-- DEPLOY once the Prisma client declares it (same full-row read as
-- feelLoggedAt). Source: sql-session-device.sql.
alter table "Session" add column if not exists "device" jsonb;

-- ── Nutrition: the LABEL PANEL. Source: sql-nutrition-label-panel.sql ────────
-- A logged food was four numbers (kcal + protein/carbs/fat), which is not what
-- a food label states: it cannot say how much of that fat is SATURATED, how
-- much of those carbs is SUGAR, or whether the day is over on salt.
--
-- NULL MEANS NOT STATED — it is NOT zero. An unstated sugar content is not a
-- sugar-free food, and the clients render an em dash for NULL, never "0 g".
-- Every column is therefore nullable with NO default, so existing rows keep
-- saying nothing, which is the truthful answer for a food logged before this.
--
-- NOT REQUIRED BEFORE DEPLOY: every write is soft-guarded (it tries with the
-- panel, then retries without), so an un-migrated database still logs and still
-- saves — it just doesn't persist the panel. The mirrored Signals need no
-- migration at all (Signal.kind is a plain text column), so day totals work
-- either way; this is what makes an individual food remember its own label.
--
-- No kJ column and no sodium column, deliberately: both are exact conversions
-- of values already stored (1 kcal = 4.184 kJ; sodium = salt × 0.4), so a
-- column would be a second copy of one fact, free to drift from the first. The
-- clients derive them at read time (packages/core/src/food-facts.ts).
alter table "SavedMeal"   add column if not exists "satFat" double precision;
alter table "SavedMeal"   add column if not exists "sugar"  double precision;
alter table "SavedMeal"   add column if not exists "fiber"  double precision;
alter table "SavedMeal"   add column if not exists "salt"   double precision;

alter table "FoodProduct" add column if not exists "satFat" double precision;
alter table "FoodProduct" add column if not exists "sugar"  double precision;
alter table "FoodProduct" add column if not exists "fiber"  double precision;
alter table "FoodProduct" add column if not exists "salt"   double precision;

alter table "FoodLog"     add column if not exists "satFat" double precision;
alter table "FoodLog"     add column if not exists "sugar"  double precision;
alter table "FoodLog"     add column if not exists "fiber"  double precision;
alter table "FoodLog"     add column if not exists "salt"   double precision;

-- The serving WEIGHT — the divisor that makes a fair per-100 g comparison
-- possible between two foods with different serving sizes. NULL where the
-- operator never published one (we do not guess a weight).
alter table "FoodProduct" add column if not exists "servingGrams" double precision;

-- Provenance: which HYBRID Verified catalog item a saved food or logged entry
-- came from, so it can be traced back to the business and the date we checked
-- it. NULL for anything the user created or took from the community database.
alter table "FoodProduct" add column if not exists "verifiedId" text;
alter table "FoodLog"     add column if not exists "verifiedId" text;


-- ===========================================================================
-- SECTION 2 / 6 — INDEXES, CASCADES, RLS HELPERS + POLICIES
-- Source: sql-all.sql (verbatim)
--
-- MUST run before sections 3 and 4: its PART 3 defines public.app_user_id() and
-- public.is_active_coach(), which their policies call.
-- ===========================================================================

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


-- ===========================================================================
-- SECTION 3 / 6 — PlanDayOverride
-- Source: sql-plan-day-overrides.sql (verbatim)
--
-- Depends on public.app_user_id() from section 2. Stores ONLY the athlete's
-- explicit per-day intent on their enrolled plan's week rail (skipped /
-- postponed); "done" and "missed" stay derived by the engine so this table
-- never fights reconciliation. Until it exists, skips live in the client cache
-- and don't sync across devices.
-- ===========================================================================

-- HYBRID — PlanDayOverride table (week-rail skip / postpone persistence).
-- Run in the Supabase SQL Editor. Mirrors prisma/schema.prisma model
-- PlanDayOverride. Idempotent.
--
-- Stores ONLY the athlete's explicit per-day intent on their enrolled plan's
-- week rail: a day they SKIPPED, or POSTPONED to a later date. "done" and
-- "missed" stay DERIVED by the engine (from logged sessions + the calendar), so
-- this table never fights reconciliation. `date` / `postponedTo` are the
-- client's LOCAL date keys (yyyy-mm-dd) stored verbatim — the server never
-- reasons about the athlete's timezone. One row per (user, plan, date).
--
-- Until this runs, the rail still works: /api/plan-days degrades to a no-op and
-- skips/postpones live in the client cache (localStorage / AsyncStorage). After
-- it runs, they sync across the athlete's devices.

create table if not exists "PlanDayOverride" (
  "id"          text primary key default gen_random_uuid()::text,
  "userId"      text not null references "User"("id") on delete cascade,
  "planId"      text not null,
  "date"        text not null,             -- local date key yyyy-mm-dd
  "status"      text not null,             -- 'skipped' | 'postponed'
  "postponedTo" text,                      -- target local date key when postponed
  "createdAt"   timestamp(3) not null default now(),
  "updatedAt"   timestamp(3) not null default now()
);

create unique index if not exists "PlanDayOverride_userId_planId_date_key"
  on "PlanDayOverride" ("userId", "planId", "date");
create index if not exists "PlanDayOverride_userId_planId_idx"
  on "PlanDayOverride" ("userId", "planId");

-- Owner-only access (same pattern as Session/Checkin): a user reads/writes only
-- their own rows. The server's service-role Prisma connection bypasses RLS.
alter table "PlanDayOverride" enable row level security;
drop policy if exists plandayoverride_own on "PlanDayOverride";
create policy plandayoverride_own on "PlanDayOverride" for all
  using ("userId" = public.app_user_id())
  with check ("userId" = public.app_user_id());


-- ===========================================================================
-- SECTION 4 / 6 — Social graph + coach marketplace
-- Source: sql-social.sql (verbatim)
--
-- Depends on public.app_user_id() from section 2 — the file's own header says
-- "run rls-policies.sql first", and section 2 contains it. Until this exists
-- the /api/social/* and /api/coaches/* routes soft-degrade to empty and the
-- rest of the app is unaffected.
-- ===========================================================================

-- HYBRID — Social layer + Coach marketplace tables + RLS.
-- Run in the Supabase SQL Editor (one idempotent script).
-- PREREQUISITE: run reference/rls-policies.sql FIRST (defines public.app_user_id()).
--
-- WHY: adds the social graph (handles, follow/friends, feed reactions) and the
-- coach marketplace (public storefront, client-initiated program enrolment,
-- reviews). Mirrors the new models in prisma/schema.prisma. Until this runs the
-- /api/social/* and /api/coaches/* routes soft-degrade to empty and the rest of
-- the app is unaffected. Authorization is enforced in the API (privacy gate +
-- CoachLink); the RLS below is defense-in-depth.

-- ============================ Social identity ============================
create table if not exists "SocialProfile" (
  "userId"      text primary key references "User"("id") on delete cascade,
  "handle"      text not null unique,
  "displayName" text,
  "bio"         text,
  "avatarUrl"   text,
  "visibility"  text not null default 'followers', -- public | followers | private
  "showcase"    jsonb not null default '{}'::jsonb,
  "createdAt"   timestamp(3) not null default now(),
  "updatedAt"   timestamp(3) not null default now()
);
create index if not exists "SocialProfile_handle_idx" on "SocialProfile" ("handle");

alter table "SocialProfile" enable row level security;

-- owner: full control of their own profile
drop policy if exists socialprofile_own on "SocialProfile";
create policy socialprofile_own on "SocialProfile" for all
  using ("userId" = public.app_user_id())
  with check ("userId" = public.app_user_id());

-- discovery: any signed-in user can READ a profile card (handle/name/bio). The
-- private RESULTS behind it are gated in the API by the visibility column +
-- follow relationship, not exposed by this row.
drop policy if exists socialprofile_read on "SocialProfile";
create policy socialprofile_read on "SocialProfile" for select using (true);

-- ============================ Follow graph ============================
create table if not exists "Follow" (
  "id"          text primary key default gen_random_uuid()::text,
  "followerId"  text not null references "User"("id") on delete cascade,
  "followeeId"  text not null references "User"("id") on delete cascade,
  "status"      text not null default 'active', -- active | pending
  "closeFriend" boolean not null default false,
  "createdAt"   timestamp(3) not null default now(),
  unique ("followerId", "followeeId")
);
create index if not exists "Follow_followerId_idx" on "Follow" ("followerId");
create index if not exists "Follow_followeeId_idx" on "Follow" ("followeeId");

alter table "Follow" enable row level security;

-- a user reads/writes follow edges they are a party to (either side)
drop policy if exists follow_party_read on "Follow";
create policy follow_party_read on "Follow" for select
  using ("followerId" = public.app_user_id() or "followeeId" = public.app_user_id());

-- the FOLLOWER creates/updates/deletes their own follow (close-friend toggle too)
drop policy if exists follow_follower_write on "Follow";
create policy follow_follower_write on "Follow" for all
  using ("followerId" = public.app_user_id())
  with check ("followerId" = public.app_user_id());

-- the FOLLOWEE may update a row addressed to them (approve/deny a pending follow)
drop policy if exists follow_followee_update on "Follow";
create policy follow_followee_update on "Follow" for update
  using ("followeeId" = public.app_user_id())
  with check ("followeeId" = public.app_user_id());

-- ============================ Feed reactions ============================
create table if not exists "Kudos" (
  "id"          text primary key default gen_random_uuid()::text,
  "userId"      text not null references "User"("id") on delete cascade,
  "ownerId"     text not null references "User"("id") on delete cascade,
  "subjectType" text not null, -- session | pr | recap | badge
  "subjectId"   text not null,
  "createdAt"   timestamp(3) not null default now(),
  unique ("userId", "subjectType", "subjectId")
);
create index if not exists "Kudos_owner_subject_idx" on "Kudos" ("ownerId", "subjectType", "subjectId");

alter table "Kudos" enable row level security;
-- the giver controls their own kudos; the subject owner can read kudos on their items
drop policy if exists kudos_giver on "Kudos";
create policy kudos_giver on "Kudos" for all
  using ("userId" = public.app_user_id())
  with check ("userId" = public.app_user_id());
drop policy if exists kudos_owner_read on "Kudos";
create policy kudos_owner_read on "Kudos" for select using ("ownerId" = public.app_user_id());

create table if not exists "Comment" (
  "id"          text primary key default gen_random_uuid()::text,
  "userId"      text not null references "User"("id") on delete cascade,
  "ownerId"     text not null references "User"("id") on delete cascade,
  "subjectType" text not null,
  "subjectId"   text not null,
  "body"        text not null,
  "createdAt"   timestamp(3) not null default now()
);
create index if not exists "Comment_owner_subject_idx" on "Comment" ("ownerId", "subjectType", "subjectId");
create index if not exists "Comment_userId_idx" on "Comment" ("userId");

alter table "Comment" enable row level security;
drop policy if exists comment_author on "Comment";
create policy comment_author on "Comment" for all
  using ("userId" = public.app_user_id())
  with check ("userId" = public.app_user_id());
drop policy if exists comment_owner_read on "Comment";
create policy comment_owner_read on "Comment" for select using ("ownerId" = public.app_user_id());

-- ============================ Feed posts ============================
create table if not exists "Post" (
  "id"        text primary key default gen_random_uuid()::text,
  "authorId"  text not null references "User"("id") on delete cascade,
  "kind"      text not null default 'status', -- status | pr | workout
  "text"      text,
  "data"      jsonb not null default '{}'::jsonb,
  "createdAt" timestamp(3) not null default now()
);
create index if not exists "Post_author_created_idx" on "Post" ("authorId", "createdAt");

alter table "Post" enable row level security;
-- author controls their own posts; followers' reads are served by the API
-- (which already enforces the follow/privacy/block gate), like sessions.
drop policy if exists post_own on "Post";
create policy post_own on "Post" for all
  using ("authorId" = public.app_user_id())
  with check ("authorId" = public.app_user_id());

-- ============================ Blocks (safety) ============================
create table if not exists "Block" (
  "id"        text primary key default gen_random_uuid()::text,
  "blockerId" text not null references "User"("id") on delete cascade,
  "blockedId" text not null references "User"("id") on delete cascade,
  "createdAt" timestamp(3) not null default now(),
  unique ("blockerId", "blockedId")
);
create index if not exists "Block_blockerId_idx" on "Block" ("blockerId");
create index if not exists "Block_blockedId_idx" on "Block" ("blockedId");

alter table "Block" enable row level security;
-- a user reads/writes only their own blocks (each party can see a block they're in)
drop policy if exists block_party_read on "Block";
create policy block_party_read on "Block" for select
  using ("blockerId" = public.app_user_id() or "blockedId" = public.app_user_id());
drop policy if exists block_owner_write on "Block";
create policy block_owner_write on "Block" for all
  using ("blockerId" = public.app_user_id())
  with check ("blockerId" = public.app_user_id());

-- ============================ Coach marketplace ============================
create table if not exists "CoachProfile" (
  "userId"           text primary key references "User"("id") on delete cascade,
  "headline"         text,
  "bio"              text,
  "specialties"      text[] not null default '{}',
  "sports"           text[] not null default '{}',
  "acceptingClients" boolean not null default true,
  "autoAccept"       boolean not null default false,
  "priceNote"        text,
  "visibility"       text not null default 'public', -- public | unlisted
  "createdAt"        timestamp(3) not null default now(),
  "updatedAt"        timestamp(3) not null default now()
);

alter table "CoachProfile" enable row level security;
drop policy if exists coachprofile_own on "CoachProfile";
create policy coachprofile_own on "CoachProfile" for all
  using ("userId" = public.app_user_id())
  with check ("userId" = public.app_user_id());
-- the directory: any signed-in user can read a coach storefront
drop policy if exists coachprofile_read on "CoachProfile";
create policy coachprofile_read on "CoachProfile" for select using (true);

-- CoachProgram marketplace columns (the base table is created by
-- reference/sql-coach-programs.sql). Idempotent ADDs so this is safe to re-run.
alter table "CoachProgram" add column if not exists "published"  boolean not null default false;
alter table "CoachProgram" add column if not exists "summary"    text;
alter table "CoachProgram" add column if not exists "level"      text;
alter table "CoachProgram" add column if not exists "visibility" text not null default 'public';
create index if not exists "CoachProgram_published_idx" on "CoachProgram" ("published");

-- published programs are readable by anyone (the storefront); the existing
-- coachprogram_own policy still governs writes + unpublished drafts.
drop policy if exists coachprogram_published_read on "CoachProgram";
create policy coachprogram_published_read on "CoachProgram" for select using ("published" = true);

create table if not exists "ProgramEnrollment" (
  "id"        text primary key default gen_random_uuid()::text,
  "programId" text not null references "CoachProgram"("id") on delete cascade,
  "coachId"   text not null references "User"("id") on delete cascade,
  "clientId"  text not null references "User"("id") on delete cascade,
  "status"    text not null default 'requested', -- requested | active | ended | declined
  "linkId"    text,
  "startedAt" timestamp(3),
  "createdAt" timestamp(3) not null default now(),
  unique ("programId", "clientId")
);
create index if not exists "ProgramEnrollment_coachId_idx" on "ProgramEnrollment" ("coachId");
create index if not exists "ProgramEnrollment_clientId_idx" on "ProgramEnrollment" ("clientId");

alter table "ProgramEnrollment" enable row level security;
-- both parties (coach + client) read; the client creates; the coach updates status
drop policy if exists enrollment_party_read on "ProgramEnrollment";
create policy enrollment_party_read on "ProgramEnrollment" for select
  using ("coachId" = public.app_user_id() or "clientId" = public.app_user_id());
drop policy if exists enrollment_client_write on "ProgramEnrollment";
create policy enrollment_client_write on "ProgramEnrollment" for all
  using ("clientId" = public.app_user_id())
  with check ("clientId" = public.app_user_id());
drop policy if exists enrollment_coach_update on "ProgramEnrollment";
create policy enrollment_coach_update on "ProgramEnrollment" for update
  using ("coachId" = public.app_user_id())
  with check ("coachId" = public.app_user_id());

create table if not exists "CoachReview" (
  "id"        text primary key default gen_random_uuid()::text,
  "coachId"   text not null references "User"("id") on delete cascade,
  "authorId"  text not null references "User"("id") on delete cascade,
  "rating"    integer not null,
  "body"      text,
  "createdAt" timestamp(3) not null default now(),
  unique ("coachId", "authorId")
);
create index if not exists "CoachReview_coachId_idx" on "CoachReview" ("coachId");

alter table "CoachReview" enable row level security;
-- the author controls their own review; reviews are public (readable by anyone)
drop policy if exists review_author on "CoachReview";
create policy review_author on "CoachReview" for all
  using ("authorId" = public.app_user_id())
  with check ("authorId" = public.app_user_id());
drop policy if exists review_read on "CoachReview";
create policy review_read on "CoachReview" for select using (true);


-- ===========================================================================
-- SECTION 4b — Verified Strength Record (RecordAttestation)
-- Source: sql-verified-record.sql (verbatim). Appended after the Jul 2026 run,
-- NOT YET APPLIED — re-running the whole bundle adds only this (and the other
-- not-yet-run appendices), everything above is a no-op.
--
-- Depends on public.app_user_id() from section 2. Until this exists the
-- /api/records/attest routes soft-degrade and PR badges read Claimed/Sensed.
-- ===========================================================================

create table if not exists "RecordAttestation" (
  "id"          text primary key default gen_random_uuid()::text,
  "ownerId"     text not null references "User"("id") on delete cascade,
  "witnessId"   text not null references "User"("id") on delete cascade,
  "sessionId"   text not null,
  "lift"        text not null,
  "e1rm"        double precision,
  "topLoad"     double precision,
  "status"      text not null default 'pending', -- pending | cosigned | declined
  "createdAt"   timestamp(3) not null default now(),
  "respondedAt" timestamp(3),
  unique ("sessionId", "lift", "witnessId")
);
create index if not exists "RecordAttestation_witnessId_status_idx" on "RecordAttestation" ("witnessId", "status");
create index if not exists "RecordAttestation_ownerId_createdAt_idx" on "RecordAttestation" ("ownerId", "createdAt");
create index if not exists "RecordAttestation_sessionId_idx" on "RecordAttestation" ("sessionId");

alter table "RecordAttestation" enable row level security;

drop policy if exists recordattestation_party_read on "RecordAttestation";
create policy recordattestation_party_read on "RecordAttestation" for select
  using ("ownerId" = public.app_user_id() or "witnessId" = public.app_user_id());

drop policy if exists recordattestation_owner_write on "RecordAttestation";
create policy recordattestation_owner_write on "RecordAttestation" for insert
  with check ("ownerId" = public.app_user_id());
drop policy if exists recordattestation_owner_delete on "RecordAttestation";
create policy recordattestation_owner_delete on "RecordAttestation" for delete
  using ("ownerId" = public.app_user_id() and "status" = 'pending');

drop policy if exists recordattestation_witness_update on "RecordAttestation";
create policy recordattestation_witness_update on "RecordAttestation" for update
  using ("witnessId" = public.app_user_id())
  with check ("witnessId" = public.app_user_id());


-- ===========================================================================
-- SECTION 5 / 6 — RE-APPLY THE ANON REVOKE (belt and braces)
--
-- Section 2 ends with a blanket revoke of PostgREST anon access to every table
-- in the public schema, plus an ALTER DEFAULT PRIVILEGES so tables created
-- later inherit no anon grant. Sections 3 and 4 create tables after that point.
--
-- HONESTY ABOUT WHY THIS IS HERE: it is NOT fixing a hole. Running this bundle
-- with this section deleted was tested against a real Postgres and the new
-- tables still ended up with zero anon grants — the default-privileges line
-- does the job on its own. It is kept because ALTER DEFAULT PRIVILEGES only
-- applies to objects created by the role that ran it, so if any of this is ever
-- replayed piecemeal under a different role the explicit revoke is the thing
-- that still holds. Re-running a revoke costs nothing.
--
-- Every client goes through /api (Prisma, privileged role); no client uses the
-- anon key for table data, only Storage. storage.objects RLS is unaffected.
-- ===========================================================================
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;


-- ===========================================================================
-- SECTION 6 / 6 — OPTIONAL, AND COMMENTED OUT ON PURPOSE
-- Source: sql-checkin-unfabricate.sql
--
-- This is the only statement in the file that modifies existing data, and it is
-- a HEURISTIC rather than a proof. Until the one-tap readiness face was fixed,
-- it wrote the picked level into all four check-in metrics, so three of them
-- were invented. This clears them — but a genuine check-in where the athlete
-- really did rate everything the same (a flat 3 day, or 5 across the board)
-- looks identical and would be cleared too. No column records which surface
-- wrote the row, so it cannot be made exact after the fact.
--
-- New rows are already correct, so the contamination ages out on its own:
-- ~4 weeks for the sleep default, ~8 weeks for the MRV estimator. DOING NOTHING
-- IS A LEGITIMATE CHOICE, which is why this ships commented out.
--
-- To use it: run the SELECT first to see the blast radius. If the count looks
-- like fabricated rows rather than real ones, uncomment the UPDATE and run it
-- SEPARATELY — not as part of this script.
-- ===========================================================================

-- select count(*) from "Checkin"
-- where "energy" is not null and "sleep" = "energy"
--   and "soreness" = "energy" and "mood" = "energy";

-- update "Checkin"
-- set "sleep" = null,
--     "soreness" = null,
--     "mood" = null
-- where "energy" is not null
--   and "sleep" = "energy"
--   and "soreness" = "energy"
--   and "mood" = "energy";
