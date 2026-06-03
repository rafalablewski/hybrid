-- HYBRID — progress photos (private Supabase Storage bucket + owner-folder RLS).
-- Run in the Supabase SQL Editor. No app table: photos are listed straight from
-- storage under progress/{auth.uid()}/…, so each user only ever sees their own.

-- 1) the private bucket
insert into storage.buckets (id, name, public)
values ('progress', 'progress', false)
on conflict (id) do nothing;

-- 2) owner-folder policies on storage.objects. The first path segment must equal
--    the caller's auth uid, so a user can only read/write/delete their own files.
drop policy if exists "progress own read" on storage.objects;
create policy "progress own read" on storage.objects for select to authenticated
  using (bucket_id = 'progress' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "progress own write" on storage.objects;
create policy "progress own write" on storage.objects for insert to authenticated
  with check (bucket_id = 'progress' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "progress own delete" on storage.objects;
create policy "progress own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'progress' and (storage.foldername(name))[1] = auth.uid()::text);
