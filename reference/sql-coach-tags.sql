-- HYBRID — coach roster tags (manual segmentation labels).
-- Run in the Supabase SQL Editor. Mirrors prisma/schema.prisma (CoachLink.tags).
-- Existing CoachLink RLS already governs row access; this just adds a column.

alter table "CoachLink"
  add column if not exists "tags" text[] not null default '{}';
