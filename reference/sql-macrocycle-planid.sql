-- HYBRID — Macrocycle.planId (the enrolled NAMED plan that drives "Your plan
-- today"). Run in the Supabase SQL Editor. Mirrors prisma/schema.prisma.
-- Idempotent; nullable so existing goal-only enrollments are unaffected.
alter table "Macrocycle" add column if not exists "planId" text;
