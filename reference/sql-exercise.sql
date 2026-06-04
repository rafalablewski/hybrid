-- HYBRID — Exercise table (the admin-managed exercise library, CMS content #2).
-- Run in the Supabase SQL Editor. Mirrors prisma/schema.prisma model Exercise.
-- A superset of the core Movement shape: engine-critical fields + authored
-- content. The 9 built-in movements stay in code; this table holds CUSTOM
-- exercises + overrides. Mutations are server-only (the admin API is ADMIN-gated
-- + audited); RLS here is defense-in-depth: any signed-in user reads only
-- PUBLISHED rows.

create table if not exists "Exercise" (
  "id"          text primary key default gen_random_uuid()::text,
  "slug"        text not null unique,
  "name"        text not null unique,
  "pattern"     text not null,
  "muscles"     text[] not null default '{}',
  "baseLoad"    double precision,
  "system"      text,
  "kind"        text not null default 'strength',
  "category"    text,
  "equipment"   text[] not null default '{}',
  "aliases"     text[] not null default '{}',
  "description" text,
  "cues"        text[] not null default '{}',
  "videoUrl"    text,
  "thumbUrl"    text,
  "status"      text not null default 'published',  -- draft | published | archived
  "source"      text not null default 'custom',      -- builtin | custom
  "authorId"    text,
  "authorEmail" text,
  "createdAt"   timestamp(3) not null default now(),
  "updatedAt"   timestamp(3) not null default now()
);
create index if not exists "Exercise_status_idx" on "Exercise" ("status");

alter table "Exercise" enable row level security;

-- any signed-in user may read published exercises (the merge over the built-ins
-- happens in the app; drafts/archived stay admin-only via the server).
drop policy if exists exercise_read_published on "Exercise";
create policy exercise_read_published on "Exercise" for select
  to authenticated
  using ("status" = 'published');
