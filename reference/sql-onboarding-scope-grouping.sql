-- HYBRID — OnboardingQuestion: which INTAKE asks a question, and which
-- SCREEN it shares.
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

-- WHICH SCREEN A QUESTION SHARES. Adjacent questions with the same groupKey are
-- asked together instead of one each — sex + birth + body mass are one screen,
-- "A little about you". NULL means "inherit the code default"; an EMPTY STRING
-- is an explicit ungrouping, which is how an admin takes a built-in off a
-- shared screen. The two cases cannot be collapsed, which is why this column is
-- nullable rather than defaulting to ''.
alter table "OnboardingQuestion" add column if not exists "groupKey" text;
alter table "OnboardingQuestion" add column if not exists "groupTitle" text;

-- What the app will read back. Built-ins are expected to show '{}' here: their
-- scope lives in packages/core/src/onboarding.ts, deliberately.
select "key", "system", "personas", "groupKey", "groupTitle"
from "OnboardingQuestion"
order by "order";
