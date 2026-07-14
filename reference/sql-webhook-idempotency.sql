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

-- Server-only: enable RLS with NO policy so PostgREST (anon/authenticated) can
-- neither read nor write the ledger. The webhook handler writes it via Prisma
-- (the privileged role, which bypasses RLS). Without this, the anon key could
-- pre-seed an event id so a real Stripe event is skipped as "already processed"
-- (breaking entitlement provisioning) or delete rows to force double-processing.
ALTER TABLE "ProcessedWebhookEvent" ENABLE ROW LEVEL SECURITY;

-- 2. Ordering guard: timestamp of the last applied subscription event, so a
--    delayed/reordered webhook can't roll entitlement back to a stale state.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "subscriptionStatusAt" TIMESTAMP(3);
