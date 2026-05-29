-- ============================================
-- Vessel Ops — inventory triggers (Build Step 3 prerequisite)
-- Run in: Supabase Dashboard → SQL Editor → New query
-- Target: project ref trplphistdsfuecnnzdu (SHARED with crutkai-petty-cash).
--
-- 01_vessel_ops_schema.sql centralized crossing detection inside the
-- inv_apply_quantity_change() RPC. That meant admin direct UPDATEs and
-- bulk-threshold edits could silently bypass alert detection. This
-- migration moves the logic to triggers on inventory_items so every code
-- path lands in the same place. Refactors the two callers (parts_consumed
-- trigger + the RPC) to plain UPDATEs and lets the triggers do the work.
-- Safe to re-run.
-- ============================================

-- 1) BEFORE INSERT OR UPDATE: keep alert_state derived from the row's
--    current quantity + critical_threshold. Fires on every direct edit,
--    bulk update, RPC, or trigger-driven decrement.
create or replace function inv_set_alert_state() returns trigger as $$
begin
  if new.critical_threshold is null then
    new.alert_state := 'above';
  elsif new.quantity <= new.critical_threshold then
    new.alert_state := 'at_or_below';
  else
    new.alert_state := 'above';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists inv_set_alert_state_t on inventory_items;
create trigger inv_set_alert_state_t
  before insert or update of quantity, critical_threshold on inventory_items
  for each row execute procedure inv_set_alert_state();

-- 2) AFTER UPDATE only: enqueue an alert when the row transitions from
--    'above' to 'at_or_below'. INSERTs are skipped (no prior state to
--    cross from); the dashboard's "Critical" filter already surfaces them.
create or replace function inv_detect_crossing() returns trigger as $$
begin
  if old.alert_state = 'above' and new.alert_state = 'at_or_below' then
    perform enqueue_inventory_alert(new.id, new.quantity);
  end if;
  return null;
end;
$$ language plpgsql security definer;

-- Only watch quantity changes. Setting / adjusting a threshold (especially
-- in bulk) is an explicit categorization, not a stock event — alerting on
-- it would spam the crew when admins backfill thresholds for 300 rows.
drop trigger if exists inv_detect_crossing_t on inventory_items;
create trigger inv_detect_crossing_t
  after update of quantity on inventory_items
  for each row execute procedure inv_detect_crossing();

-- 3) Simplify the parts_consumed trigger — just decrement quantity; let
--    the new triggers handle state + crossing.
create or replace function pc_after_insert() returns trigger as $$
declare
  v_current_qty int;
begin
  select quantity into v_current_qty
    from inventory_items
   where id = new.inventory_item_id
   for update;
  if not found then
    raise exception 'inventory item not found: %', new.inventory_item_id;
  end if;
  if v_current_qty < new.qty_used then
    raise exception 'insufficient stock: have %, asked for %', v_current_qty, new.qty_used;
  end if;
  update inventory_items
     set quantity = quantity - new.qty_used
   where id = new.inventory_item_id;
  return new;
end;
$$ language plpgsql security definer;

-- 4) inv_apply_quantity_change keeps the same signature for callers that
--    use it as an RPC, but its body is now a plain delta-apply UPDATE.
--    Triggers handle alert_state and crossing detection.
create or replace function inv_apply_quantity_change(
  p_item_id uuid,
  p_delta   int,
  p_actor   uuid
) returns void as $$
declare
  v_current_qty int;
begin
  select quantity into v_current_qty
    from inventory_items
   where id = p_item_id
   for update;
  if not found then
    raise exception 'inventory item not found: %', p_item_id;
  end if;
  if v_current_qty + p_delta < 0 then
    raise exception 'insufficient stock: have %, requested delta %', v_current_qty, p_delta;
  end if;
  update inventory_items
     set quantity = quantity + p_delta
   where id = p_item_id;
end;
$$ language plpgsql security definer;
