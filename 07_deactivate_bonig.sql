-- ============================================
-- Runa — Deactivate "Bonig" component (assumed Seahub OCR typo)
-- Run in: Supabase Dashboard → SQL Editor → New query
-- Safe to re-run.
-- ============================================
-- Deactivate rather than delete so existing inventory rows that already
-- reference the row in their component_ids array stay valid. New picker
-- queries filter active = true, so Bonig disappears from selection UIs.

update components
   set active = false
 where lower(name) = 'bonig';
