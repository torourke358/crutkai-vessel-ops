-- ============================================
-- Thor — add per-item Cost fields to Equipment and Maintenance tasks.
-- Run in: Supabase Dashboard → SQL Editor → New query
-- Target: project ref trplphistdsfuecnnzdu
-- Safe to re-run.
--
-- Inventory items already carry a cost via `inventory_items.unit_price`, and
-- yard tasks via `yard_tasks.actual_cost`. This adds the matching field to the
-- two entities that lacked one: equipment and maintenance_tasks. Both are
-- nullable USD amounts (numeric(12,2)) — no backfill, existing rows stay NULL.
--
-- RUN ORDER: run this BEFORE exercising the equipment or maintenance-task
-- create/edit forms on the new code. Reads are safe either way (a missing
-- column just reads as undefined), but the write paths now send `cost`, so the
-- column must exist or the insert/update fails with "column does not exist".
-- ============================================

alter table equipment
  add column if not exists cost numeric(12,2);

comment on column equipment.cost is 'Purchase / replacement cost in USD (nullable).';

alter table maintenance_tasks
  add column if not exists cost numeric(12,2);

comment on column maintenance_tasks.cost is 'Estimated cost of the task in USD (nullable).';
