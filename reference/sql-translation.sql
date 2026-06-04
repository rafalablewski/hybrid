-- HYBRID — Translation overrides (CMS content #4: the localization manager).
-- Run in the Supabase SQL Editor. Mirrors prisma/schema.prisma model Translation.
-- A SPARSE layer over the shipped strings in @hybrid/core — one row per (lang,key)
-- an admin edited/added. Mutations are server-only (the admin API is ADMIN-gated
-- + audited); RLS lets any signed-in user read every override (UI copy isn't
-- secret — it's rendered to everyone).

create table if not exists "Translation" (
  "id"             text primary key default gen_random_uuid()::text,
  "lang"           text not null,
  "key"            text not null,
  "value"          text not null,
  "updatedById"    text,
  "updatedByEmail" text,
  "createdAt"      timestamp(3) not null default now(),
  "updatedAt"      timestamp(3) not null default now(),
  unique ("lang", "key")
);
create index if not exists "Translation_lang_idx" on "Translation" ("lang");

alter table "Translation" enable row level security;

-- any signed-in user may read overrides (they drive the UI for everyone).
drop policy if exists translation_read on "Translation";
create policy translation_read on "Translation" for select
  to authenticated
  using (true);
