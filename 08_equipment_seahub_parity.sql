-- ============================================
-- Thor — Equipment module: Seahub parity additions
-- Run in: Supabase Dashboard → SQL Editor → New query
-- Target: project ref trplphistdsfuecnnzdu
-- Safe to re-run.
-- ============================================

-- 1) Critical / regulatory flags. Engineering thinks in terms of "critical
--    or not" (Seahub's classification). ISM / ISPS surface separately for
--    survey + compliance use.
alter table equipment
  add column if not exists critical boolean not null default false,
  add column if not exists is_ism   boolean not null default false,
  add column if not exists is_isps  boolean not null default false;

create index if not exists idx_equipment_critical on equipment(critical) where critical;
create index if not exists idx_equipment_ism      on equipment(is_ism)   where is_ism;
create index if not exists idx_equipment_isps     on equipment(is_isps)  where is_isps;

-- 2) Multi-photo gallery. Migrate the existing single image_path into a
--    text[] of paths so old rows keep their hero photo.
alter table equipment
  add column if not exists image_paths text[] not null default '{}';

update equipment
   set image_paths = array[image_path]
 where image_path is not null
   and array_length(image_paths, 1) is null;

-- Old single column stays around (read-only fallback) until app code stops
-- referencing it. Drop in a later migration once we're confident.

-- 3) Document attachments per equipment (manuals, data sheets, drawings,
--    service reports, etc.). Storage path lives under equipment-documents
--    bucket using the same {user_id}/{uuid}.ext per-user-folder RLS.
create table if not exists equipment_documents (
  id            uuid primary key default uuid_generate_v4(),
  equipment_id  uuid not null references equipment(id) on delete cascade,
  kind          text not null check (kind in ('manual','spec','drawing','service_report','other')),
  file_name     text not null,
  file_path     text not null,
  file_size     int,
  mime_type     text,
  notes         text,
  uploaded_by   uuid references auth.users(id),
  uploaded_at   timestamptz not null default now()
);
create index if not exists idx_equipment_documents_eq on equipment_documents(equipment_id, uploaded_at desc);

alter table equipment_documents enable row level security;

drop policy if exists "Signed in reads equipment_documents" on equipment_documents;
create policy "Signed in reads equipment_documents" on equipment_documents
  for select using (auth.uid() is not null);

drop policy if exists "Admin writes equipment_documents" on equipment_documents;
create policy "Admin writes equipment_documents" on equipment_documents
  for insert with check (is_admin() or uploaded_by = auth.uid());

drop policy if exists "Admin updates equipment_documents" on equipment_documents;
create policy "Admin updates equipment_documents" on equipment_documents
  for update using (is_admin());

drop policy if exists "Admin deletes equipment_documents" on equipment_documents;
create policy "Admin deletes equipment_documents" on equipment_documents
  for delete using (is_admin() or uploaded_by = auth.uid());

-- 4) Storage bucket for the actual document binaries.
insert into storage.buckets (id, name, public)
values ('equipment-documents', 'equipment-documents', false)
on conflict (id) do nothing;

drop policy if exists "Equipment docs: own folder upload" on storage.objects;
create policy "Equipment docs: own folder upload" on storage.objects
  for insert with check (
    bucket_id = 'equipment-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Equipment docs: signed-in read" on storage.objects;
create policy "Equipment docs: signed-in read" on storage.objects
  for select using (
    bucket_id = 'equipment-documents'
    and auth.uid() is not null
  );

drop policy if exists "Equipment docs: own delete or admin" on storage.objects;
create policy "Equipment docs: own delete or admin" on storage.objects
  for delete using (
    bucket_id = 'equipment-documents'
    and (auth.uid()::text = (storage.foldername(name))[1] or is_admin())
  );
