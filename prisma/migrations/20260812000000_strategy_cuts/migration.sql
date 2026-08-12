-- 2026-08 strategy cuts — drop the tables behind the killed surfaces.
--
-- Talent Graph (TalentProfile), Org Graph / Team OS (Organization, Team,
-- Membership, OrgInvite), Video intelligence (VideoAnalysis), Competition
-- intelligence (Event) and the email MARKETING platform (EmailCampaign,
-- EmailSequence, EmailSequenceStep, EmailEnrollment, EmailSuppression).
--
-- EmailMessage SURVIVES — it is the transactional deliverability ledger and
-- account verification + coach invites still send through it. Only its
-- campaign/sequence linkage goes, and `kind` now defaults to 'transactional'.
--
-- Tactical, Force plate, Longevity and the Financials console had no tables of
-- their own; the code went, there is nothing to drop here.
--
-- The reasoning for each cut lives in packages/core/src/capabilities.ts
-- (status: "retired") and audit/08-strength-platform-strategy-2026-07.md §3.6.
--
-- NOTE for production, whose migration bookkeeping is not yet reconciled (see
-- prisma/MIGRATIONS.md): run reference/sql-strategy-cuts-2026-08.sql in the
-- Supabase SQL Editor instead of applying this migration.

-- DropForeignKey
ALTER TABLE "Team" DROP CONSTRAINT "Team_orgId_fkey";

-- DropForeignKey
ALTER TABLE "Team" DROP CONSTRAINT "Team_parentId_fkey";

-- DropForeignKey
ALTER TABLE "Membership" DROP CONSTRAINT "Membership_orgId_fkey";

-- DropForeignKey
ALTER TABLE "Membership" DROP CONSTRAINT "Membership_userId_fkey";

-- DropForeignKey
ALTER TABLE "VideoAnalysis" DROP CONSTRAINT "VideoAnalysis_userId_fkey";

-- DropForeignKey
ALTER TABLE "Event" DROP CONSTRAINT "Event_userId_fkey";

-- DropForeignKey
ALTER TABLE "TalentProfile" DROP CONSTRAINT "TalentProfile_userId_fkey";

-- DropForeignKey
ALTER TABLE "EmailSequenceStep" DROP CONSTRAINT "EmailSequenceStep_sequenceId_fkey";

-- DropForeignKey
ALTER TABLE "EmailEnrollment" DROP CONSTRAINT "EmailEnrollment_sequenceId_fkey";

-- DropForeignKey
ALTER TABLE "EmailMessage" DROP CONSTRAINT "EmailMessage_campaignId_fkey";

-- AlterTable
ALTER TABLE "EmailMessage" DROP COLUMN "campaignId",
DROP COLUMN "sequenceId",
ALTER COLUMN "kind" SET DEFAULT 'transactional';

-- DropTable
DROP TABLE "Organization";

-- DropTable
DROP TABLE "Team";

-- DropTable
DROP TABLE "Membership";

-- DropTable
DROP TABLE "VideoAnalysis";

-- DropTable
DROP TABLE "Event";

-- DropTable
DROP TABLE "TalentProfile";

-- DropTable
DROP TABLE "OrgInvite";

-- DropTable
DROP TABLE "EmailCampaign";

-- DropTable
DROP TABLE "EmailSequence";

-- DropTable
DROP TABLE "EmailSequenceStep";

-- DropTable
DROP TABLE "EmailEnrollment";

-- DropTable
DROP TABLE "EmailSuppression";

