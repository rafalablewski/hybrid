-- Per-user feature grants: admin-granted extra feature access (nav ids) beyond
-- a user's persona — e.g. give a retail/casual user the Analytics or Velocity
-- screen. Layered into /api/flags per request (each granted id becomes
-- visible-from-casual for that one user). Managed in Admin → Users → a user.
--
-- Run in the Supabase SQL editor. Idempotent.

alter table "User"
  add column if not exists "featureGrants" text[] not null default '{}';
