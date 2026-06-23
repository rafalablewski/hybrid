-- Resumable campaign fan-out. Run in the Supabase SQL Editor (the sandbox can't
-- reach the DB directly). Matches prisma/schema.prisma EmailCampaign additions.
--
-- sendCursor  : last recipient userId processed (id-ordered) so a large send
--               continues across cron ticks instead of timing out in one request.
-- lockedUntil : short lease while a worker processes a batch, so overlapping
--               crons can't double-send a recipient.

ALTER TABLE "EmailCampaign"
  ADD COLUMN IF NOT EXISTS "sendCursor" TEXT,
  ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP(3);
