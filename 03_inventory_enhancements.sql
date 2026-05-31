-- ============================================
-- Thor — Inventory enhancements: multi-component (up to 8) + location photo
-- Run in: Supabase Dashboard → SQL Editor → New query
-- Target: project ref trplphistdsfuecnnzdu (shared with crutkai-petty-cash)
-- Safe to re-run.
-- ============================================

-- 1) Multi-component support: replace the single related_component_id FK
--    with a uuid[] array, capped at 8 entries by a CHECK constraint.
alter table inventory_items
  add column if not exists component_ids uuid[] not null default '{}';

-- Migrate existing single-component rows into the new array (idempotent —
-- only fills rows that haven't been migrated yet).
update inventory_items
   set component_ids = array[related_component_id]
 where related_component_id is not null
   and (component_ids is null or array_length(component_ids, 1) is null);

alter table inventory_items
  drop constraint if exists inventory_items_component_count;
alter table inventory_items
  add constraint inventory_items_component_count
  check (array_length(component_ids, 1) is null or array_length(component_ids, 1) <= 8);

-- GIN index for fast `component_ids @> ARRAY[...]::uuid[]` lookups.
create index if not exists idx_inventory_component_ids
  on inventory_items using gin (component_ids);

-- Drop the now-superseded single-component column. CASCADE removes the
-- old single-component index if it existed.
alter table inventory_items
  drop column if exists related_component_id cascade;

-- 2) Location photo column. Nullable — old rows have no photo yet.
alter table inventory_items
  add column if not exists location_photo_path text;

-- 3) Storage bucket for inventory location photos. Same per-user-folder
--    RLS pattern as petty cash's `receipts` bucket.
insert into storage.buckets (id, name, public)
values ('inventory-photos', 'inventory-photos', false)
on conflict (id) do nothing;

drop policy if exists "Inventory photos: own folder upload" on storage.objects;
create policy "Inventory photos: own folder upload" on storage.objects
  for insert with check (
    bucket_id = 'inventory-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Inventory photos: signed-in read" on storage.objects;
create policy "Inventory photos: signed-in read" on storage.objects
  for select using (
    bucket_id = 'inventory-photos'
    and auth.uid() is not null
  );

drop policy if exists "Inventory photos: own delete or admin" on storage.objects;
create policy "Inventory photos: own delete or admin" on storage.objects
  for delete using (
    bucket_id = 'inventory-photos'
    and (auth.uid()::text = (storage.foldername(name))[1] or is_admin())
  );
