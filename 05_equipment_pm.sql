-- ============================================
-- Thor — Equipment PM enhancements
-- Run in: Supabase Dashboard → SQL Editor → New query
-- Target: project ref trplphistdsfuecnnzdu (shared with crutkai-petty-cash)
-- Safe to re-run.
-- ============================================

-- 1) Commissioned date — separate from created_at. Records when the
--    physical equipment was first installed on the vessel (may pre-date
--    when we started tracking it in Thor).
alter table equipment add column if not exists commissioned_date date;

-- 2) Idempotency column for the "10% before PM due" warning so the daily
--    cron doesn't email the same warning every morning.
alter table maintenance_tasks
  add column if not exists last_due_soon_alerted_on date;

-- 3) Expand notifications.kind to include the new "due soon" warning.
alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in (
    'inventory_critical',
    'maintenance_due_soon',
    'maintenance_due',
    'maintenance_overdue'
  ));
