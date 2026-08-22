-- HYBRID — DeclaredEvent table (the athlete's own races, meets and tests).
-- Run in the Supabase SQL Editor. Mirrors prisma/schema.prisma model
-- DeclaredEvent. Idempotent.
--
-- WHY IT CANNOT BE DERIVED: the day band protects the day before something that
-- matters. Half of that the app can work out on its own — weeklyFixture() finds
-- a kind landing on the same weekday in at least 3 of the last 6 weeks, which is
-- exactly what a Thursday five-a-side is. The other half is not derivable by
-- anything: a half marathon in six weeks leaves no trace in the log until the
-- day it happens. This table is where the athlete says so.
--
-- `date` is the client's LOCAL date key (yyyy-mm-dd) stored verbatim — the
-- server never reasons about the athlete's timezone. `kind` is a core
-- TrainingKind; `label` is the athlete's own name for the event, already
-- trimmed by sanitizeDeclaredEvents() before it arrives.

create table if not exists "DeclaredEvent" (
  "id"        text primary key default gen_random_uuid()::text,
  "userId"    text not null references "User"("id") on delete cascade,
  "date"      text not null,             -- local date key yyyy-mm-dd
  "kind"      text not null,             -- core TrainingKind
  "label"     text,
  "createdAt" timestamp(3) not null default now(),
  "updatedAt" timestamp(3) not null default now()
);

create index if not exists "DeclaredEvent_userId_date_idx"
  on "DeclaredEvent" ("userId", "date");

-- Owner-only access (same pattern as PlanDayOverride): a user reads/writes only
-- their own rows. The server's service-role Prisma connection bypasses RLS.
alter table "DeclaredEvent" enable row level security;
drop policy if exists declaredevent_own on "DeclaredEvent";
create policy declaredevent_own on "DeclaredEvent" for all
  using ("userId" = public.app_user_id())
  with check ("userId" = public.app_user_id());

-- Section 5's blanket revoke ran BEFORE this table existed, so the explicit
-- revoke is repeated here rather than assumed. (The default-privileges line in
-- section 5 covers it, but only for objects created by the role that ran it.)
revoke all on "DeclaredEvent" from anon;
