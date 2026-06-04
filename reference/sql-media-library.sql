-- HYBRID — Media library (CMS content #3): a PUBLIC Supabase Storage bucket for
-- shared assets (exercise demo clips, announcement imagery) + a catalog table.
-- Run in the Supabase SQL Editor. Mirrors prisma/schema.prisma model MediaAsset.
-- The bytes live in storage (admin-only writes); the table is the searchable
-- catalog + the stable public URL other content points at.

-- 0) is_admin(): true when the caller's User row has role ADMIN. Used to gate
--    admin-only Storage writes (the MediaAsset table itself is written by Prisma,
--    which bypasses RLS, and is ADMIN-gated + audited at the API layer).
create or replace function public.is_admin() returns boolean
language sql stable as $$
  select exists (
    select 1 from "User"
    where "authId" = auth.uid()::text and "role"::text = 'ADMIN'
  );
$$;

-- 1) the PUBLIC media bucket (assets are shared content meant to be embedded).
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

-- 2) storage policies: anyone may read; only admins may write/delete.
drop policy if exists "media public read" on storage.objects;
create policy "media public read" on storage.objects for select
  using (bucket_id = 'media');

drop policy if exists "media admin write" on storage.objects;
create policy "media admin write" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.is_admin());

drop policy if exists "media admin update" on storage.objects;
create policy "media admin update" on storage.objects for update to authenticated
  using (bucket_id = 'media' and public.is_admin());

drop policy if exists "media admin delete" on storage.objects;
create policy "media admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.is_admin());

-- 3) the catalog table.
create table if not exists "MediaAsset" (
  "id"          text primary key default gen_random_uuid()::text,
  "path"        text not null unique,
  "url"         text not null,
  "title"       text not null,
  "alt"         text,
  "kind"        text not null default 'image',   -- image | video | other
  "contentType" text,
  "sizeBytes"   integer,
  "width"       integer,
  "height"      integer,
  "tags"        text[] not null default '{}',
  "status"      text not null default 'published', -- draft | published | archived
  "authorId"    text,
  "authorEmail" text,
  "createdAt"   timestamp(3) not null default now(),
  "updatedAt"   timestamp(3) not null default now()
);
create index if not exists "MediaAsset_status_idx" on "MediaAsset" ("status");
create index if not exists "MediaAsset_kind_idx" on "MediaAsset" ("kind");

alter table "MediaAsset" enable row level security;

-- any signed-in user may read published assets (drafts/archived stay admin-only
-- via the server, which bypasses RLS through Prisma).
drop policy if exists media_asset_read_published on "MediaAsset";
create policy media_asset_read_published on "MediaAsset" for select
  to authenticated
  using ("status" = 'published');
