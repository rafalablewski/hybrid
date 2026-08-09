-- HYBRID — Social layer + Coach marketplace tables + RLS.
-- Run in the Supabase SQL Editor (one idempotent script).
-- PREREQUISITE: run reference/rls-policies.sql FIRST (defines public.app_user_id()).
--
-- WHY: adds the social graph (handles, follow/friends, feed reactions) and the
-- coach marketplace (public storefront, client-initiated program enrolment,
-- reviews). Mirrors the new models in prisma/schema.prisma. Until this runs the
-- /api/social/* and /api/coaches/* routes soft-degrade to empty and the rest of
-- the app is unaffected. Authorization is enforced in the API (privacy gate +
-- CoachLink); the RLS below is defense-in-depth.

-- ============================ Social identity ============================
create table if not exists "SocialProfile" (
  "userId"      text primary key references "User"("id") on delete cascade,
  "handle"      text not null unique,
  "displayName" text,
  "bio"         text,
  "avatarUrl"   text,
  "visibility"  text not null default 'public', -- public | followers | private
  "showcase"    jsonb not null default '{}'::jsonb,
  "createdAt"   timestamp(3) not null default now(),
  "updatedAt"   timestamp(3) not null default now()
);
create index if not exists "SocialProfile_handle_idx" on "SocialProfile" ("handle");

-- Public is the DEFAULT (Aug 2026): every finished workout publishes to the
-- feed automatically, and the athlete opts DOWN to followers-only or private.
-- Idempotent, so re-running this file applies it to a database created before
-- the flip. Existing rows are left as they are — a stored 'followers' may be a
-- choice the athlete made, and a privacy setting is never loosened by a script.
alter table "SocialProfile" alter column "visibility" set default 'public';

alter table "SocialProfile" enable row level security;

-- owner: full control of their own profile
drop policy if exists socialprofile_own on "SocialProfile";
create policy socialprofile_own on "SocialProfile" for all
  using ("userId" = public.app_user_id())
  with check ("userId" = public.app_user_id());

-- discovery: any signed-in user can READ a profile card (handle/name/bio). The
-- private RESULTS behind it are gated in the API by the visibility column +
-- follow relationship, not exposed by this row.
drop policy if exists socialprofile_read on "SocialProfile";
create policy socialprofile_read on "SocialProfile" for select using (true);

-- ============================ Follow graph ============================
create table if not exists "Follow" (
  "id"          text primary key default gen_random_uuid()::text,
  "followerId"  text not null references "User"("id") on delete cascade,
  "followeeId"  text not null references "User"("id") on delete cascade,
  "status"      text not null default 'active', -- active | pending
  "closeFriend" boolean not null default false,
  "createdAt"   timestamp(3) not null default now(),
  unique ("followerId", "followeeId")
);
create index if not exists "Follow_followerId_idx" on "Follow" ("followerId");
create index if not exists "Follow_followeeId_idx" on "Follow" ("followeeId");

alter table "Follow" enable row level security;

-- a user reads/writes follow edges they are a party to (either side)
drop policy if exists follow_party_read on "Follow";
create policy follow_party_read on "Follow" for select
  using ("followerId" = public.app_user_id() or "followeeId" = public.app_user_id());

-- the FOLLOWER creates/updates/deletes their own follow (close-friend toggle too)
drop policy if exists follow_follower_write on "Follow";
create policy follow_follower_write on "Follow" for all
  using ("followerId" = public.app_user_id())
  with check ("followerId" = public.app_user_id());

-- the FOLLOWEE may update a row addressed to them (approve/deny a pending follow)
drop policy if exists follow_followee_update on "Follow";
create policy follow_followee_update on "Follow" for update
  using ("followeeId" = public.app_user_id())
  with check ("followeeId" = public.app_user_id());

-- ============================ Feed reactions ============================
create table if not exists "Kudos" (
  "id"          text primary key default gen_random_uuid()::text,
  "userId"      text not null references "User"("id") on delete cascade,
  "ownerId"     text not null references "User"("id") on delete cascade,
  "subjectType" text not null, -- session | pr | recap | badge
  "subjectId"   text not null,
  "createdAt"   timestamp(3) not null default now(),
  unique ("userId", "subjectType", "subjectId")
);
create index if not exists "Kudos_owner_subject_idx" on "Kudos" ("ownerId", "subjectType", "subjectId");

alter table "Kudos" enable row level security;
-- the giver controls their own kudos; the subject owner can read kudos on their items
drop policy if exists kudos_giver on "Kudos";
create policy kudos_giver on "Kudos" for all
  using ("userId" = public.app_user_id())
  with check ("userId" = public.app_user_id());
drop policy if exists kudos_owner_read on "Kudos";
create policy kudos_owner_read on "Kudos" for select using ("ownerId" = public.app_user_id());

create table if not exists "Comment" (
  "id"          text primary key default gen_random_uuid()::text,
  "userId"      text not null references "User"("id") on delete cascade,
  "ownerId"     text not null references "User"("id") on delete cascade,
  "subjectType" text not null,
  "subjectId"   text not null,
  "body"        text not null,
  "createdAt"   timestamp(3) not null default now()
);
create index if not exists "Comment_owner_subject_idx" on "Comment" ("ownerId", "subjectType", "subjectId");
create index if not exists "Comment_userId_idx" on "Comment" ("userId");

alter table "Comment" enable row level security;
drop policy if exists comment_author on "Comment";
create policy comment_author on "Comment" for all
  using ("userId" = public.app_user_id())
  with check ("userId" = public.app_user_id());
drop policy if exists comment_owner_read on "Comment";
create policy comment_owner_read on "Comment" for select using ("ownerId" = public.app_user_id());

-- ============================ Feed posts ============================
create table if not exists "Post" (
  "id"        text primary key default gen_random_uuid()::text,
  "authorId"  text not null references "User"("id") on delete cascade,
  "kind"      text not null default 'status', -- status | pr | workout
  "text"      text,
  "data"      jsonb not null default '{}'::jsonb,
  "createdAt" timestamp(3) not null default now()
);
create index if not exists "Post_author_created_idx" on "Post" ("authorId", "createdAt");

alter table "Post" enable row level security;
-- author controls their own posts; followers' reads are served by the API
-- (which already enforces the follow/privacy/block gate), like sessions.
drop policy if exists post_own on "Post";
create policy post_own on "Post" for all
  using ("authorId" = public.app_user_id())
  with check ("authorId" = public.app_user_id());

-- ============================ Blocks (safety) ============================
create table if not exists "Block" (
  "id"        text primary key default gen_random_uuid()::text,
  "blockerId" text not null references "User"("id") on delete cascade,
  "blockedId" text not null references "User"("id") on delete cascade,
  "createdAt" timestamp(3) not null default now(),
  unique ("blockerId", "blockedId")
);
create index if not exists "Block_blockerId_idx" on "Block" ("blockerId");
create index if not exists "Block_blockedId_idx" on "Block" ("blockedId");

alter table "Block" enable row level security;
-- a user reads/writes only their own blocks (each party can see a block they're in)
drop policy if exists block_party_read on "Block";
create policy block_party_read on "Block" for select
  using ("blockerId" = public.app_user_id() or "blockedId" = public.app_user_id());
drop policy if exists block_owner_write on "Block";
create policy block_owner_write on "Block" for all
  using ("blockerId" = public.app_user_id())
  with check ("blockerId" = public.app_user_id());

-- ============================ Coach marketplace ============================
create table if not exists "CoachProfile" (
  "userId"           text primary key references "User"("id") on delete cascade,
  "headline"         text,
  "bio"              text,
  "specialties"      text[] not null default '{}',
  "sports"           text[] not null default '{}',
  "acceptingClients" boolean not null default true,
  "autoAccept"       boolean not null default false,
  "priceNote"        text,
  "visibility"       text not null default 'public', -- public | unlisted
  "createdAt"        timestamp(3) not null default now(),
  "updatedAt"        timestamp(3) not null default now()
);

alter table "CoachProfile" enable row level security;
drop policy if exists coachprofile_own on "CoachProfile";
create policy coachprofile_own on "CoachProfile" for all
  using ("userId" = public.app_user_id())
  with check ("userId" = public.app_user_id());
-- the directory: any signed-in user can read a coach storefront
drop policy if exists coachprofile_read on "CoachProfile";
create policy coachprofile_read on "CoachProfile" for select using (true);

-- CoachProgram marketplace columns (the base table is created by
-- reference/sql-coach-programs.sql). Idempotent ADDs so this is safe to re-run.
alter table "CoachProgram" add column if not exists "published"  boolean not null default false;
alter table "CoachProgram" add column if not exists "summary"    text;
alter table "CoachProgram" add column if not exists "level"      text;
alter table "CoachProgram" add column if not exists "visibility" text not null default 'public';
create index if not exists "CoachProgram_published_idx" on "CoachProgram" ("published");

-- published programs are readable by anyone (the storefront); the existing
-- coachprogram_own policy still governs writes + unpublished drafts.
drop policy if exists coachprogram_published_read on "CoachProgram";
create policy coachprogram_published_read on "CoachProgram" for select using ("published" = true);

create table if not exists "ProgramEnrollment" (
  "id"        text primary key default gen_random_uuid()::text,
  "programId" text not null references "CoachProgram"("id") on delete cascade,
  "coachId"   text not null references "User"("id") on delete cascade,
  "clientId"  text not null references "User"("id") on delete cascade,
  "status"    text not null default 'requested', -- requested | active | ended | declined
  "linkId"    text,
  "startedAt" timestamp(3),
  "createdAt" timestamp(3) not null default now(),
  unique ("programId", "clientId")
);
create index if not exists "ProgramEnrollment_coachId_idx" on "ProgramEnrollment" ("coachId");
create index if not exists "ProgramEnrollment_clientId_idx" on "ProgramEnrollment" ("clientId");

alter table "ProgramEnrollment" enable row level security;
-- both parties (coach + client) read; the client creates; the coach updates status
drop policy if exists enrollment_party_read on "ProgramEnrollment";
create policy enrollment_party_read on "ProgramEnrollment" for select
  using ("coachId" = public.app_user_id() or "clientId" = public.app_user_id());
drop policy if exists enrollment_client_write on "ProgramEnrollment";
create policy enrollment_client_write on "ProgramEnrollment" for all
  using ("clientId" = public.app_user_id())
  with check ("clientId" = public.app_user_id());
drop policy if exists enrollment_coach_update on "ProgramEnrollment";
create policy enrollment_coach_update on "ProgramEnrollment" for update
  using ("coachId" = public.app_user_id())
  with check ("coachId" = public.app_user_id());

create table if not exists "CoachReview" (
  "id"        text primary key default gen_random_uuid()::text,
  "coachId"   text not null references "User"("id") on delete cascade,
  "authorId"  text not null references "User"("id") on delete cascade,
  "rating"    integer not null,
  "body"      text,
  "createdAt" timestamp(3) not null default now(),
  unique ("coachId", "authorId")
);
create index if not exists "CoachReview_coachId_idx" on "CoachReview" ("coachId");

alter table "CoachReview" enable row level security;
-- the author controls their own review; reviews are public (readable by anyone)
drop policy if exists review_author on "CoachReview";
create policy review_author on "CoachReview" for all
  using ("authorId" = public.app_user_id())
  with check ("authorId" = public.app_user_id());
drop policy if exists review_read on "CoachReview";
create policy review_read on "CoachReview" for select using (true);
