-- HYBRID — AdminAudit.actorId nullable + ON DELETE SET NULL, so the audit trail
-- OUTLIVES a deleted actor (account deletion must not be blocked by, or destroy,
-- the audit history — actorEmail keeps each row human-readable). Run in the
-- Supabase SQL Editor. Mirrors prisma/schema.prisma. Idempotent.
alter table "AdminAudit" alter column "actorId" drop not null;
alter table "AdminAudit" drop constraint if exists "AdminAudit_actorId_fkey";
alter table "AdminAudit"
  add constraint "AdminAudit_actorId_fkey"
  foreign key ("actorId") references "User"("id") on delete set null;
