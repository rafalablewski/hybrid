-- HYBRID — FeatureGrant table: admin-granted per-user feature access (nav ids)
-- beyond a user's persona. Kept OFF the User model so the hot-path user lookup
-- never depends on it (every read is soft-guarded in code). Safe to apply at any
-- time, in any order relative to the code deploy.
-- PREREQUISITE for the RLS policy: reference/rls-policies.sql (defines app_user_id()).

create table if not exists "FeatureGrant" (
  "userId"    text primary key references "User"("id") on delete cascade,
  "navIds"    text[] not null default '{}',
  "updatedAt" timestamp(3) not null default now()
);

alter table "FeatureGrant" enable row level security;

-- a user may read their own grants; writes are server-only (admin endpoints run
-- on a privileged connection that bypasses RLS).
drop policy if exists featuregrant_own_select on "FeatureGrant";
create policy featuregrant_own_select on "FeatureGrant" for select
  using ("userId" = public.app_user_id());
