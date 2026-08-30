-- ============================================
-- Runa — Phase 2 polish: defect photo gallery
-- Run in: Supabase Dashboard → SQL Editor → New query
-- Safe to re-run.
-- ============================================

-- Defects move from a single image_path to a gallery, matching equipment.
alter table defects
  add column if not exists image_paths text[] not null default '{}';

update defects
   set image_paths = array[image_path]
 where image_path is not null
   and array_length(image_paths, 1) is null;

-- image_path stays for backward compat — drop in a later migration once the
-- app code has fully switched.
