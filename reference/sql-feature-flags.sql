-- HYBRID — Feature-flag overrides (CMS content #5: runtime config).
-- Run in the Supabase SQL Editor. Mirrors prisma/schema.prisma model FeatureFlag.
-- A SPARSE layer over the FEATURE_FLAGS registry in @hybrid/core — one row per
-- flag an admin toggled/scoped/configured. Mutations are server-only (the admin
-- API is ADMIN-gated + audited); RLS lets any signed-in user read every flag
-- (they drive the UI for everyone).

create table if not exists "FeatureFlag" (
  "id"             text primary key default gen_random_uuid()::text,
  "key"            text not null unique,
  "enabled"        boolean not null default true,
  "audience"       text not null default 'all',  -- all | coaches | clients | admins
  "value"          jsonb,
  "updatedById"    text,
  "updatedByEmail" text,
  "createdAt"      timestamp(3) not null default now(),
  "updatedAt"      timestamp(3) not null default now()
);
create index if not exists "FeatureFlag_enabled_idx" on "FeatureFlag" ("enabled");

alter table "FeatureFlag" enable row level security;

-- any signed-in user may read flags (they gate everyone's UI).
drop policy if exists feature_flag_read on "FeatureFlag";
create policy feature_flag_read on "FeatureFlag" for select
  to authenticated
  using (true);
