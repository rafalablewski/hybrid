-- ===========================================================================
-- HYBRID — 2026-08 strategy cuts: DROP the tables behind the killed surfaces.
--
-- TWO PATHS, pick the one that matches the database:
--   • A FRESH environment (staging, preview, DR rebuild) gets this from the
--     Prisma migration 20260812000000_strategy_cuts — nothing to do here.
--   • PRODUCTION's migration bookkeeping is not yet reconciled (see
--     prisma/MIGRATIONS.md), so run THIS in the Supabase SQL Editor instead.
--
-- Run it AFTER deploying the matching code change (the app no longer reads or
-- writes any of these tables, so the order is safe either way, but dropping
-- first would 500 an old build still in the wild).
--
-- What went, and why (audit/08-strength-platform-strategy-2026-07.md §3.5):
--   • Tactical / SOF vertical          — no tables of its own (it was computed
--                                        from Signal + the Twin); nothing here.
--   • Talent Graph                     — TalentProfile
--   • Org Graph / Team Operating System— Organization, Team, Membership, OrgInvite
--   • Force plate CSV ingest           — no tables of its own (it wrote Signal
--                                        rows); the parser went, the signals stay.
--   • Video intelligence               — VideoAnalysis
--   • Competition intel + peaking      — Event
--   • Email marketing automation       — EmailCampaign, EmailSequence,
--                                        EmailSequenceStep, EmailEnrollment,
--                                        EmailSuppression
--   • Longevity / performance medicine — no tables of its own (it computed from
--                                        Signal rows); nothing here.
--   • Financials & unit economics      — no tables of its own (a pure model over
--                                        hard-coded assumptions); nothing here.
--
-- KEPT: EmailMessage (the transactional deliverability ledger — account
-- verification + coach invites still send). Its campaignId/sequenceId columns
-- are dropped below since the tables they pointed at are gone.
--
-- DESTRUCTIVE. Back up first (Supabase → Database → Backups) if any of these
-- tables hold rows you want. `DROP ... CASCADE` also removes the dependent FK
-- constraints, indexes and RLS policies.
--
-- Idempotent: re-running is a no-op.
-- ===========================================================================

begin;

-- --- Talent Graph ----------------------------------------------------------
drop table if exists "TalentProfile" cascade;

-- --- Org Graph / Team Operating System -------------------------------------
-- Order: children first, though CASCADE handles it either way.
drop table if exists "OrgInvite"    cascade;
drop table if exists "Membership"   cascade;
drop table if exists "Team"         cascade;
drop table if exists "Organization" cascade;

-- --- Video intelligence ----------------------------------------------------
drop table if exists "VideoAnalysis" cascade;

-- --- Competition intelligence + peaking optimizer --------------------------
drop table if exists "Event" cascade;

-- --- Email marketing automation --------------------------------------------
drop table if exists "EmailEnrollment"   cascade;
drop table if exists "EmailSequenceStep" cascade;
drop table if exists "EmailSequence"     cascade;
drop table if exists "EmailCampaign"     cascade;
drop table if exists "EmailSuppression"  cascade;

-- The transactional ledger survives; its campaign/sequence linkage does not.
alter table if exists "EmailMessage"
  drop column if exists "campaignId",
  drop column if exists "sequenceId";

-- Any surviving marketing rows in the ledger are relabelled so `kind` stays a
-- closed set (transactional | verification).
update "EmailMessage" set "kind" = 'transactional'
  where "kind" in ('campaign', 'sequence');

commit;

-- ---------------------------------------------------------------------------
-- Optional cleanup — open moderation reports that pointed at a talent profile
-- can never be resolved now that the target is gone. Close them.
-- ---------------------------------------------------------------------------
update "Report"
   set "status" = 'dismissed',
       "resolution" = 'Talent Graph removed (2026-08 strategy cuts)',
       "resolvedAt" = now()
 where "targetType" = 'talentProfile'
   and "status" = 'open';
