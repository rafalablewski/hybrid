-- HYBRID — SavedPost: the feed bookmark, on the server.
-- Run in the Supabase SQL Editor. Mirrors prisma/schema.prisma model SavedPost.
-- Idempotent — safe to re-run.
--
-- WHAT THIS IS FOR. Saving a feed post already works: the bookmark fills, the
-- Saved screen resolves what you saved back into cards, and the whole thing is
-- stored ON THE DEVICE (localStorage / AsyncStorage). This table is the one
-- missing piece — it makes the shelf follow the athlete, so a post saved on the
-- phone is there on the laptop.
--
-- THE SHAPE IS THE FEED'S OWN ANCHOR. A saved row is a (subjectType, subjectId)
-- pair, exactly like Kudos and Comment — "post:abc", "session:s1", "pr:s1". It
-- deliberately does NOT reference Session or Post with a foreign key:
--   • a "pr" row's subjectId is the SESSION the PR was set in, so one id column
--     would need two different FK targets, and
--   • the feed's subjects are derived, not a single table.
-- The read path re-checks existence and visibility on every load anyway
-- (/api/social/saved), so a dangling row is already handled: it comes back as
-- `gone` and the client drops it. Adding a FK would buy nothing and would make
-- the "pr" case impossible to express.
--
-- NO OWNER COLUMN, unlike Kudos. Kudos carries ownerId so the person who
-- RECEIVED it can read their own kudos. A save is private: nobody is notified,
-- nobody can count yours, and the author has no claim on the row. Storing the
-- author id would create a reason to expose it later, so it is not stored.
--
-- ORDER IS SAVE ORDER. `savedAt` is what the Saved screen sorts by, newest
-- first — what the athlete remembers is when they saved a thing, not when it
-- was posted.
--
-- SAFE BEFORE THE CODE SHIPS, AND SAFE AFTER. The sync routes soft-degrade on a
-- missing table (P2021/P2010, the same pattern as the rest of the social API),
-- so the app keeps working on device-only storage until this runs. Running it
-- early is equally safe: an empty table reads as "nothing saved yet on the
-- server", and the first sync from a device merges its local list up.

create table if not exists "SavedPost" (
  "id"          text primary key default gen_random_uuid()::text,
  "userId"      text not null references "User"("id") on delete cascade,
  "subjectType" text not null,               -- session | pr | post
  "subjectId"   text not null,
  "savedAt"     timestamp(3) not null default now(),
  -- Saving twice is saving once. This is what makes the merge a plain union:
  -- a device can push its whole list on every sync without deduping first.
  unique ("userId", "subjectType", "subjectId")
);

-- The only read the app performs: "my shelf, newest save first."
create index if not exists "SavedPost_user_savedAt_idx" on "SavedPost" ("userId", "savedAt" desc);

-- ---------------------------------------------------------------------------
-- RLS. Simpler than Kudos/Comment because a save has exactly one party: the
-- person who saved it. No owner-read policy, no public read, no exceptions.
-- (public.app_user_id() is defined by sql-all.sql PART 3 — run that first if
-- this errors with "function does not exist".)
-- ---------------------------------------------------------------------------
alter table "SavedPost" enable row level security;

drop policy if exists savedpost_owner on "SavedPost";
create policy savedpost_owner on "SavedPost" for all
  using ("userId" = public.app_user_id())
  with check ("userId" = public.app_user_id());

-- Defense in depth, matching sql-pending.sql SECTION 5: every client reaches
-- this table through /api (Prisma, privileged role) — never with the anon key.
revoke all on table "SavedPost" from anon;
