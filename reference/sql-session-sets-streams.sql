-- HYBRID — SessionSet + SessionStream + SessionLap.
-- Run in the Supabase SQL Editor. Mirrors prisma/schema.prisma (and
-- prisma/migrations/20260816120000_session_sets_streams), written idempotently
-- so it is safe to re-run, plus the RLS layer the Prisma migration doesn't cover.
--
-- WHY THESE THREE TABLES EXIST
--
--   SessionSet     A logged set lived only inside "Session"."blocks", a jsonb
--                  column. Postgres cannot index a value inside that document,
--                  so there was no per-set grain at all: every cross-athlete
--                  analytic loaded whole sessions into the API and walked them
--                  in TypeScript, under a row cap that silently truncates the
--                  answer. This is the fact table — one row per strength SET and
--                  one per timed effort — denormalised with the athlete, the
--                  date and the archive flag so an aggregate never has to join
--                  back to "Session". It is a PROJECTION of the document
--                  (@hybrid/core sessionSetFacts), rewritten on every session
--                  write and safe to drop and rebuild; the document remains the
--                  source of truth.
--
--   SessionStream  "Session"."device" carried a workout SUMMARY only — duration,
--   SessionLap     distance, kcal, avg/max HR. The heart-rate series, the GPS
--                  route, the laps and the splits never landed anywhere, and a
--                  recording not read at match time cannot be recovered later.
--                  A stream is ONE row per (session, kind) holding parallel
--                  offsets/values arrays — a row per sample would be millions
--                  per athlete-year and unaffordable to index at scale — with
--                  the aggregates lifted into their own columns. A LAP does get
--                  a row each: laps are tens per workout, and "my fastest 5 km"
--                  has to be an indexed lookup rather than a scan over every
--                  recording the athlete ever made.
--
-- All three cascade with their "Session" and their "User", so deleting a
-- workout (or an account) leaves nothing behind.
-- Relies on public.app_user_id() from rls-policies.sql.

-- ---------------------------------------------------------------------------
-- SessionSet — one performed effort per row
-- ---------------------------------------------------------------------------
create table if not exists "SessionSet" (
  "id"              text primary key default gen_random_uuid()::text,
  "sessionId"       text not null references "Session"("id") on delete cascade,
  "userId"          text not null references "User"("id") on delete cascade,
  "performedAt"     timestamp(3) not null,
  "archived"        boolean not null default false,
  "blockIndex"      integer not null,
  "setIndex"        integer not null,
  "kind"            text not null,
  "exercise"        text not null,
  "movement"        text,
  "muscles"         text[] not null default array[]::text[],
  "discipline"      text,
  "role"            text not null default 'working',
  "drop"            boolean not null default false,
  "reps"            integer,
  "loadKg"          double precision,
  "bodyweightKg"    double precision,
  "effectiveLoadKg" double precision,
  "volumeKg"        double precision,
  "e1rmKg"          double precision,
  "rpe"             double precision,
  "velocityMs"      double precision,
  "peakVelocityMs"  double precision,
  "romCm"           double precision,
  "restSec"         integer,
  "distanceKm"      double precision,
  "durationSec"     integer,
  "paceSecPerKm"    double precision,
  "elevationM"      double precision,
  "watts"           double precision,
  "zone"            integer,
  "rounds"          integer,
  "measured"        boolean not null default false,
  "createdAt"       timestamp(3) not null default now()
);

-- The natural key of the projection — what makes a rewrite idempotent.
create unique index if not exists "SessionSet_sessionId_blockIndex_setIndex_key"
  on "SessionSet" ("sessionId", "blockIndex", "setIndex");
-- An athlete's own history, by date.
create index if not exists "SessionSet_userId_performedAt_idx"
  on "SessionSet" ("userId", "performedAt");
-- One athlete's history of ONE lift (the progression / e1RM chart).
create index if not exists "SessionSet_userId_exercise_performedAt_idx"
  on "SessionSet" ("userId", "exercise", "performedAt");
-- CROSS-ATHLETE — the queries that were impossible before this table existed.
create index if not exists "SessionSet_exercise_performedAt_idx"
  on "SessionSet" ("exercise", "performedAt");
create index if not exists "SessionSet_movement_performedAt_idx"
  on "SessionSet" ("movement", "performedAt");
create index if not exists "SessionSet_discipline_performedAt_idx"
  on "SessionSet" ("discipline", "performedAt");
create index if not exists "SessionSet_performedAt_idx"
  on "SessionSet" ("performedAt");

-- ---------------------------------------------------------------------------
-- SessionStream — one recorded series per (session, kind)
-- ---------------------------------------------------------------------------
create table if not exists "SessionStream" (
  "id"          text primary key default gen_random_uuid()::text,
  "sessionId"   text not null references "Session"("id") on delete cascade,
  "userId"      text not null references "User"("id") on delete cascade,
  "performedAt" timestamp(3) not null,
  "archived"    boolean not null default false,
  "kind"        text not null, -- hr | power | cadence | speed | altitude | distance | route
  "unit"        text not null,
  "provider"    text not null default 'apple',
  "uuid"        text not null,
  "startedAt"   timestamp(3) not null,
  -- Seconds from "startedAt", strictly increasing; "values"[i] belongs to
  -- "offsets"[i]. "valuesB" is longitude, for the `route` kind only.
  "offsets"     integer[] not null,
  "values"      double precision[] not null,
  "valuesB"     double precision[] not null default array[]::double precision[],
  -- Lifted out of the arrays so the common questions are column reads.
  "sampleCount" integer not null,
  "durationSec" integer not null,
  "min"         double precision,
  "max"         double precision,
  "avg"         double precision,
  "createdAt"   timestamp(3) not null default now()
);

-- One series per kind per session — a re-import replaces rather than stacks.
create unique index if not exists "SessionStream_sessionId_kind_key"
  on "SessionStream" ("sessionId", "kind");
create index if not exists "SessionStream_userId_performedAt_idx"
  on "SessionStream" ("userId", "performedAt");
create index if not exists "SessionStream_kind_performedAt_idx"
  on "SessionStream" ("kind", "performedAt");

-- ---------------------------------------------------------------------------
-- SessionLap — laps, splits, multi-sport segments, and derived best efforts
-- ---------------------------------------------------------------------------
create table if not exists "SessionLap" (
  "id"             text primary key default gen_random_uuid()::text,
  "sessionId"      text not null references "Session"("id") on delete cascade,
  "userId"         text not null references "User"("id") on delete cascade,
  "performedAt"    timestamp(3) not null,
  "archived"       boolean not null default false,
  "kind"           text not null, -- lap | split | segment | best
  "index"          integer not null,
  "startOffsetSec" integer not null,
  "durationSec"    double precision not null,
  "distanceKm"     double precision,
  "avgHr"          integer,
  "maxHr"          integer,
  "avgWatts"       double precision,
  "elevationM"     double precision,
  "paceSecPerKm"   double precision,
  "createdAt"      timestamp(3) not null default now()
);

create unique index if not exists "SessionLap_sessionId_kind_index_key"
  on "SessionLap" ("sessionId", "kind", "index");
create index if not exists "SessionLap_userId_performedAt_idx"
  on "SessionLap" ("userId", "performedAt");
-- "The athlete's fastest 5 km ever", and "everybody's fastest 5 km" — the two
-- questions the record ladder could not ask while only summaries were stored.
create index if not exists "SessionLap_userId_kind_distanceKm_durationSec_idx"
  on "SessionLap" ("userId", "kind", "distanceKm", "durationSec");
create index if not exists "SessionLap_kind_distanceKm_durationSec_idx"
  on "SessionLap" ("kind", "distanceKm", "durationSec");

-- ---------------------------------------------------------------------------
-- RLS — owner-only, exactly like "Session" itself.
--
-- These rows are the athlete's training, re-shaped. They are strictly MORE
-- sensitive than the session document in one respect: a route stream is the
-- athlete's home address written down 3 000 times. No coach read, no public
-- read, no anon grant. Every legitimate reader (the API, the k-anonymous
-- efficacy index, the admin aggregates) goes through Prisma's privileged role,
-- which bypasses RLS — the policies below are the belt for PostgREST.
-- ---------------------------------------------------------------------------
alter table "SessionSet" enable row level security;
drop policy if exists sessionset_own on "SessionSet";
create policy sessionset_own on "SessionSet" for all
  using ("userId" = public.app_user_id())
  with check ("userId" = public.app_user_id());

alter table "SessionStream" enable row level security;
drop policy if exists sessionstream_own on "SessionStream";
create policy sessionstream_own on "SessionStream" for all
  using ("userId" = public.app_user_id())
  with check ("userId" = public.app_user_id());

alter table "SessionLap" enable row level security;
drop policy if exists sessionlap_own on "SessionLap";
create policy sessionlap_own on "SessionLap" for all
  using ("userId" = public.app_user_id())
  with check ("userId" = public.app_user_id());

revoke all on "SessionSet", "SessionStream", "SessionLap" from anon;
