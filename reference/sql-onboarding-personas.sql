-- HYBRID — OnboardingQuestion.personas (which intake asks a question).
-- Run in the Supabase SQL Editor. Idempotent; mirrors prisma/schema.prisma.
--
-- The wizard FORKS on its first question — "just tracking" or "training for a
-- goal" — and everything after it belongs to one intake or both. A built-in's
-- scope is locked to the code default and this column is ignored for it; this
-- is what lets an ADMIN scope a custom question they add.
--
-- OPTIONAL. Both the read and the write soft-degrade without it: the questions
-- API falls back to a select that omits the column, and saving an edit retries
-- without it, so an un-migrated database keeps working and custom questions
-- simply read as "asked of both intakes" — which is what they were before.
alter table "OnboardingQuestion"
  add column if not exists "personas" text[] not null default '{}';

-- What the app will read back. Built-ins are expected to show '{}' here: their
-- scope lives in packages/core/src/onboarding.ts, deliberately.
select "key", "system", "personas"
from "OnboardingQuestion"
order by "order";
