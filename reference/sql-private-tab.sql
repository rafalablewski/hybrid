-- HYBRID — Profile "Private" tab tables (Body metrics · Journal · Hidden
-- highlights). Run in the Supabase SQL Editor.
--
-- PREREQUISITES (run first, once):
--   1) reference/rls-policies.sql   — defines public.app_user_id() (+ helpers).
--   2) reference/sql-progress-photos.sql — the private 'progress' Storage bucket
--      + owner-folder RLS for the Body-tab progress photos. (Photos are listed
--      straight from storage under progress/{auth.uid()}/…, so there is no photo
--      table here.)
-- Without app_user_id() the policy statements error and (in one transaction)
-- roll the tables back.
--
-- Everything here is OWNER-ONLY (private): no coach-read policy, unlike Checkin —
-- this is the "only you" surface. Add a public.is_active_coach() read policy
-- later if you want a coach to see body metrics.
--
-- Idempotent: safe to re-run. Mirror these as models in prisma/schema.prisma.

-- ────────────────────────────────────────────────────────────────────────────
-- 1) BodyMetric — dated body-composition + tape measurements (Body & progress).
--    Bodyweight is also captured via Checkin.bodyMassKg / signals; this table is
--    the net-new measurements store. All metric fields nullable (log what you
--    have). Units: kg / % / cm (converted for display client-side).
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists "BodyMetric" (
  "id"          text primary key default gen_random_uuid()::text,
  "userId"      text not null references "User"("id"),
  "measuredAt"  timestamp(3) not null default now(),
  "weightKg"    double precision,
  "bodyFatPct"  double precision,
  "neckCm"      double precision,
  "chestCm"     double precision,
  "waistCm"     double precision,
  "hipsCm"      double precision,
  "thighCm"     double precision,
  "armCm"       double precision,
  "calfCm"      double precision,
  "note"        text,
  "createdAt"   timestamp(3) not null default now()
);
create index if not exists "BodyMetric_userId_measuredAt_idx"
  on "BodyMetric" ("userId", "measuredAt");

alter table "BodyMetric" enable row level security;

drop policy if exists bodymetric_own on "BodyMetric";
create policy bodymetric_own on "BodyMetric" for all
  using ("userId" = public.app_user_id())
  with check ("userId" = public.app_user_id());

-- ────────────────────────────────────────────────────────────────────────────
-- 2) JournalEntry — private free-text notes/reflections (Journal). Strictly
--    owner-only; never surfaced on any follower-facing view.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists "JournalEntry" (
  "id"         text primary key default gen_random_uuid()::text,
  "userId"     text not null references "User"("id"),
  "body"       text not null,
  "createdAt"  timestamp(3) not null default now(),
  "updatedAt"  timestamp(3) not null default now()
);
create index if not exists "JournalEntry_userId_createdAt_idx"
  on "JournalEntry" ("userId", "createdAt");

alter table "JournalEntry" enable row level security;

drop policy if exists journal_own on "JournalEntry";
create policy journal_own on "JournalEntry" for all
  using ("userId" = public.app_user_id())
  with check ("userId" = public.app_user_id());

-- ────────────────────────────────────────────────────────────────────────────
-- 3) HiddenHighlight — the set of earned PRs/badges the owner has chosen to keep
--    OFF the public Overview grid. `key` is the highlight's stable id, e.g.
--    'pr:deadlift', 'badge:100-day-streak'. The public-profile renderer filters
--    these out (server-side / service-role when a FOLLOWER views the profile,
--    since the row itself is owner-only under RLS).
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists "HiddenHighlight" (
  "id"        text primary key default gen_random_uuid()::text,
  "userId"    text not null references "User"("id"),
  "key"       text not null,
  "createdAt" timestamp(3) not null default now(),
  unique ("userId", "key")
);
create index if not exists "HiddenHighlight_userId_idx"
  on "HiddenHighlight" ("userId");

alter table "HiddenHighlight" enable row level security;

drop policy if exists hidden_own on "HiddenHighlight";
create policy hidden_own on "HiddenHighlight" for all
  using ("userId" = public.app_user_id())
  with check ("userId" = public.app_user_id());

-- ────────────────────────────────────────────────────────────────────────────
-- 4) HighlightOrder — the owner's chosen ARRANGEMENT of the public Overview
--    tiles (Apple-style drag-to-reorder in edit mode). One row per user holding
--    the ordered list of tile keys (same stable ids as HiddenHighlight). The
--    grid reconciles this against the tiles that currently have data: known keys
--    render in this order; any newly-earned key not yet listed appends at the
--    end. Owner-only, like the rest of this surface.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists "HighlightOrder" (
  "id"        text primary key default gen_random_uuid()::text,
  "userId"    text not null unique references "User"("id"),
  "keys"      text[] not null default '{}',
  "updatedAt" timestamp(3) not null default now()
);

alter table "HighlightOrder" enable row level security;

drop policy if exists highlightorder_own on "HighlightOrder";
create policy highlightorder_own on "HighlightOrder" for all
  using ("userId" = public.app_user_id())
  with check ("userId" = public.app_user_id());
