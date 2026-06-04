-- HYBRID — Announcement table (the first admin-authored CMS content type).
-- Run in the Supabase SQL Editor. Mirrors prisma/schema.prisma model Announcement.
-- Mutations are server-only (the admin API is ADMIN-gated + audited); RLS here is
-- defense-in-depth: any signed-in user may read only PUBLISHED rows. No client
-- insert/update/delete policy exists, so writes are impossible except via the
-- server (service-role) connection.

create table if not exists "Announcement" (
  "id"          text primary key default gen_random_uuid()::text,
  "title"       text not null,
  "body"        text not null,
  "level"       text not null default 'info',     -- info | success | warning
  "audience"    text not null default 'all',      -- all | coaches | clients
  "status"      text not null default 'draft',    -- draft | published | archived
  "pinned"      boolean not null default false,
  "publishAt"   timestamp(3),
  "expiresAt"   timestamp(3),
  "authorId"    text not null,
  "authorEmail" text not null,
  "createdAt"   timestamp(3) not null default now(),
  "updatedAt"   timestamp(3) not null default now()
);
create index if not exists "Announcement_status_publishAt_idx"
  on "Announcement" ("status", "publishAt");

alter table "Announcement" enable row level security;

-- any signed-in user may read published announcements (audience filtering +
-- the publish/expiry window are applied in the API).
drop policy if exists announcement_read_published on "Announcement";
create policy announcement_read_published on "Announcement" for select
  to authenticated
  using ("status" = 'published');
