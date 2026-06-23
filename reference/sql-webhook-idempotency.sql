-- Stripe webhook idempotency + out-of-order protection.
-- Run in the Supabase SQL Editor (the sandbox can't reach the DB directly).
-- Matches prisma/schema.prisma: model ProcessedWebhookEvent + User.subscriptionStatusAt

-- 1. Idempotency ledger: the provider event id is the PK, so a redelivered
--    Stripe event is processed at most once.
CREATE TABLE IF NOT EXISTS "ProcessedWebhookEvent" (
  "id"          TEXT PRIMARY KEY,
  "provider"    TEXT NOT NULL DEFAULT 'stripe',
  "type"        TEXT NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);

-- 2. Ordering guard: timestamp of the last applied subscription event, so a
--    delayed/reordered webhook can't roll entitlement back to a stale state.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "subscriptionStatusAt" TIMESTAMP(3);
