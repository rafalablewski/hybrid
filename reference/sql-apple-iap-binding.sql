-- Apple IAP replay protection.
-- Binds an Apple originalTransactionId to exactly one account so a (valid)
-- StoreKit transaction can't be replayed / shared across multiple accounts.
-- Run in the Supabase SQL Editor (the sandbox can't reach the DB directly).
--
-- Matches prisma/schema.prisma: User.appleOriginalTransactionId String? @unique

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "appleOriginalTransactionId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "User_appleOriginalTransactionId_key"
  ON "User" ("appleOriginalTransactionId");
