-- Inspector signatures
--
-- Each inspector draws a signature on their phone the first time they sign in
-- to a build where this is supported. The PNG is stored in the existing
-- `inspection-files` bucket under `signatures/{user_id}.png`. The users row
-- stores a pointer to that path so the app and server both know whether
-- capture has happened.
--
-- The actual image is fetched server-side (with the service-role key) during
-- report generation and embedded in the Inspector Declaration block of every
-- DOCX, PDF and HTML report.

alter table public.users
  add column if not exists signature_path text;

-- Storage RLS: inspectors can read/write only their own signature file.
-- The bucket itself is the existing `inspection-files`; we just add policies
-- for the new `signatures/` prefix. The service-role key bypasses these.

drop policy if exists "signatures_select_own"  on storage.objects;
drop policy if exists "signatures_insert_own"  on storage.objects;
drop policy if exists "signatures_update_own"  on storage.objects;

create policy "signatures_select_own"
  on storage.objects for select
  using (
    bucket_id = 'inspection-files'
    and (storage.foldername(name))[1] = 'signatures'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "signatures_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'inspection-files'
    and (storage.foldername(name))[1] = 'signatures'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "signatures_update_own"
  on storage.objects for update
  using (
    bucket_id = 'inspection-files'
    and (storage.foldername(name))[1] = 'signatures'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
