-- ============================================
-- Runa — Equipment photo upload
-- Run in: Supabase Dashboard → SQL Editor → New query
-- Target: project ref trplphistdsfuecnnzdu (shared with crutkai-petty-cash)
-- Safe to re-run.
-- ============================================

-- 1) Photo column on equipment. Nullable — old rows have no photo yet.
alter table equipment
  add column if not exists image_path text;

-- 2) Storage bucket for equipment photos. Same per-user-folder RLS pattern
--    as inventory-photos / petty cash receipts.
insert into storage.buckets (id, name, public)
values ('equipment-photos', 'equipment-photos', false)
on conflict (id) do nothing;

drop policy if exists "Equipment photos: own folder upload" on storage.objects;
create policy "Equipment photos: own folder upload" on storage.objects
  for insert with check (
    bucket_id = 'equipment-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Equipment photos: signed-in read" on storage.objects;
create policy "Equipment photos: signed-in read" on storage.objects
  for select using (
    bucket_id = 'equipment-photos'
    and auth.uid() is not null
  );

drop policy if exists "Equipment photos: own delete or admin" on storage.objects;
create policy "Equipment photos: own delete or admin" on storage.objects
  for delete using (
    bucket_id = 'equipment-photos'
    and (auth.uid()::text = (storage.foldername(name))[1] or is_admin())
  );
