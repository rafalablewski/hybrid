-- =============================================================================
-- HYBRID — enterprise audit migrations (combined)
-- Run this ENTIRE file once in the Supabase SQL Editor. Every statement is
-- idempotent (IF NOT EXISTS), so re-running is safe.
--
-- NOTE ON INDEXES: the indexes below use a plain CREATE INDEX (not CONCURRENTLY)
-- so the whole script runs inside the SQL Editor's single transaction. Plain
-- CREATE INDEX takes a brief write lock while it builds — fine at current scale.
-- If a table is ever large enough that the lock matters, build that ONE index
-- with CONCURRENTLY instead, run on its own (CONCURRENTLY can't run in a
-- transaction block — that's the "cannot run inside a transaction block" error).
-- =============================================================================


-- 1. PERFORMANCE INDEXES -------------------------------------------------------
--    Hot query patterns that were unindexed outside userId.

-- Session: history/engine reads filter by user and sort by startedAt; admin
-- views sort globally by startedAt.
CREATE INDEX IF NOT EXISTS "Session_userId_startedAt_idx"
  ON "Session" ("userId", "startedAt");
CREATE INDEX IF NOT EXISTS "Session_userId_archivedAt_startedAt_idx"
  ON "Session" ("userId", "archivedAt", "startedAt");
CREATE INDEX IF NOT EXISTS "Session_startedAt_idx"
  ON "Session" ("startedAt");

-- Biometric: read "where userId order by date desc".
CREATE INDEX IF NOT EXISTS "Biometric_userId_date_idx"
  ON "Biometric" ("userId", "date");

-- Checkin: read "where userId order by weekOf desc".
CREATE INDEX IF NOT EXISTS "Checkin_userId_weekOf_idx"
  ON "Checkin" ("userId", "weekOf");

-- AgentRun: global admin views sort by recency without an agentId filter.
CREATE INDEX IF NOT EXISTS "AgentRun_createdAt_idx"
  ON "AgentRun" ("createdAt");

-- User: admin lists order/filter by recency.
CREATE INDEX IF NOT EXISTS "User_createdAt_idx"
  ON "User" ("createdAt");


-- 2. STRIPE WEBHOOK — idempotency + out-of-order protection --------------------
--    Matches prisma/schema.prisma: model ProcessedWebhookEvent + User.subscriptionStatusAt

-- Idempotency ledger: the provider event id is the PK, so a redelivered Stripe
-- event is processed at most once.
CREATE TABLE IF NOT EXISTS "ProcessedWebhookEvent" (
  "id"          TEXT PRIMARY KEY,
  "provider"    TEXT NOT NULL DEFAULT 'stripe',
  "type"        TEXT NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);

-- Ordering guard: timestamp of the last applied subscription event, so a
-- delayed/reordered webhook can't roll entitlement back to a stale state.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "subscriptionStatusAt" TIMESTAMP(3);


-- 3. APPLE IAP — replay protection ---------------------------------------------
--    Binds an Apple originalTransactionId to exactly one account so a (valid)
--    StoreKit transaction can't be replayed / shared across accounts.
--    Matches prisma/schema.prisma: User.appleOriginalTransactionId String? @unique
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "appleOriginalTransactionId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "User_appleOriginalTransactionId_key"
  ON "User" ("appleOriginalTransactionId");


-- =============================================================================
-- OPTIONAL (run separately, only if you want it) — trigram index so admin user
-- search (email/name ILIKE '%q%') stops table-scanning. CONCURRENTLY here means
-- these MUST be run one at a time, NOT as part of the transaction above.
-- =============================================================================
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS "User_email_trgm_idx"
--   ON "User" USING gin ("email" gin_trgm_ops);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS "User_name_trgm_idx"
--   ON "User" USING gin ("name" gin_trgm_ops);
