-- ============================================
-- Vessel Ops — initial schema (Build Step 2 of 12)
-- Run in: Supabase Dashboard → SQL Editor → New query
-- Target: project ref trplphistdsfuecnnzdu (SHARED with crutkai-petty-cash).
--
-- Safe to re-run end-to-end — every CREATE uses IF NOT EXISTS or replaces.
-- Pre-existing petty-cash objects (user_profiles, is_admin(), audit_log,
-- handle_new_user(), update_updated_at()) are NOT recreated.
-- ============================================

-- Required extensions (uuid-ossp is already enabled by petty cash; pg_trgm
-- is added for past-cost search and inventory name search).
create extension if not exists "uuid-ossp";
create extension if not exists pg_trgm;

-- ============================================
-- 0. App-wide configurable settings
-- ============================================
-- NOTE: app_settings already exists from petty cash (06_settings.sql) with
-- `value text`. Don't redefine the table or its RLS — petty cash owns those.
-- Just add the vessel-ops keys (with text values, matching the existing
-- column type).

create table if not exists app_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz default now()
);

insert into app_settings (key, value) values
  ('vessel_timezone',     'America/New_York'),
  ('vessel_email_from',   'onboarding@resend.dev'),  -- swap before go-live
  ('vessel_email_from_name', 'Anne-Marie Ops')
on conflict (key) do nothing;


-- ============================================
-- 1. Components lookup (Seahub "System" + part categories)
-- ============================================
create table if not exists components (
  id            uuid primary key default uuid_generate_v4(),
  code          text unique not null,
  name          text not null,
  display_order int default 0,
  active        boolean default true,
  created_at    timestamptz default now()
);

-- Seed values confirmed from Seahub PDF exports 2026-05-28.
-- Inventory uses: Hose, AC, AV, Lights, Electric, Pumps, Safety, Fenders, Bonig
-- Maintenance uses: Propulsion (more will surface during the bulk import).
-- "Bonig" is flagged for captain review.
insert into components (code, name, display_order) values
  ('hose',       'Hose',       10),
  ('ac',         'AC',         20),
  ('av',         'AV',         30),
  ('lights',     'Lights',     40),
  ('electric',   'Electric',   50),
  ('pumps',      'Pumps',      60),
  ('safety',     'Safety',     70),
  ('fenders',    'Fenders',    80),
  ('bonig',      'Bonig',      90),
  ('propulsion', 'Propulsion', 100)
on conflict (code) do nothing;

alter table components enable row level security;
drop policy if exists "Anyone reads components" on components;
create policy "Anyone reads components" on components for select using (true);
drop policy if exists "Admin manages components" on components;
create policy "Admin manages components" on components for all using (is_admin());


-- ============================================
-- 2. Inventory items
-- ============================================
create table if not exists inventory_items (
  id                   uuid primary key default uuid_generate_v4(),
  part_name            text not null,
  part_number          text,
  make                 text,
  quantity             int not null default 0 check (quantity >= 0),
  unit                 text not null default 'Units',
  location             text,
  related_component_id uuid references components(id) on delete set null,
  critical_threshold   int check (critical_threshold is null or critical_threshold >= 0),
  notes                text,
  -- Crossing detection: 'above' = qty > threshold (or threshold null).
  -- 'at_or_below' = qty <= threshold and threshold not null. Updated by the
  -- inv_apply_quantity_change function below.
  alert_state          text not null default 'above'
                       check (alert_state in ('above', 'at_or_below')),
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

create index if not exists idx_inventory_component on inventory_items(related_component_id);
create index if not exists idx_inventory_location  on inventory_items(location);
create index if not exists idx_inventory_part_trgm on inventory_items using gin (part_name gin_trgm_ops);
create index if not exists idx_inventory_alert     on inventory_items(alert_state) where alert_state = 'at_or_below';

drop trigger if exists inv_updated_at on inventory_items;
create trigger inv_updated_at before update on inventory_items
  for each row execute procedure update_updated_at();

alter table inventory_items enable row level security;
drop policy if exists "Signed in reads inventory" on inventory_items;
create policy "Signed in reads inventory" on inventory_items for select using (auth.uid() is not null);
drop policy if exists "Admin writes inventory" on inventory_items;
create policy "Admin writes inventory" on inventory_items for insert with check (is_admin());
drop policy if exists "Admin updates inventory" on inventory_items;
create policy "Admin updates inventory" on inventory_items for update using (is_admin());
drop policy if exists "Admin deletes inventory" on inventory_items;
create policy "Admin deletes inventory" on inventory_items for delete using (is_admin());
-- Crew can decrement quantity ONLY via parts_consumed (which uses a
-- security-definer function — see section 6).


-- ============================================
-- 3. Equipment registry
-- ============================================
create table if not exists equipment (
  id                  uuid primary key default uuid_generate_v4(),
  name                text not null,                      -- "Gearbox (Port)"
  make                text,
  model               text,
  serial              text,
  location_on_vessel  text,
  current_hours       int check (current_hours is null or current_hours >= 0),
  -- The "System" column on Seahub maintenance tasks (e.g. "Propulsion").
  component_id        uuid references components(id) on delete set null,
  notes               text,
  active              boolean default true,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create index if not exists idx_equipment_active    on equipment(active);
create index if not exists idx_equipment_component on equipment(component_id);

drop trigger if exists eq_updated_at on equipment;
create trigger eq_updated_at before update on equipment
  for each row execute procedure update_updated_at();

create table if not exists equipment_hour_readings (
  id            uuid primary key default uuid_generate_v4(),
  equipment_id  uuid not null references equipment(id) on delete cascade,
  hours         int not null check (hours >= 0),
  recorded_by   uuid references auth.users(id),
  recorded_at   timestamptz default now(),
  source        text not null default 'manual'
                check (source in ('manual', 'maintenance_completion'))
);
create index if not exists idx_hour_readings_eq on equipment_hour_readings(equipment_id, recorded_at desc);

-- Trigger: every update to equipment.current_hours logs a row.
create or replace function log_equipment_hours() returns trigger as $$
begin
  if new.current_hours is distinct from old.current_hours
     and new.current_hours is not null then
    insert into equipment_hour_readings (equipment_id, hours, recorded_by, source)
    values (new.id, new.current_hours, auth.uid(), 'manual');
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists eq_hours_log on equipment;
create trigger eq_hours_log
  after update of current_hours on equipment
  for each row execute procedure log_equipment_hours();

alter table equipment enable row level security;
drop policy if exists "Signed in reads equipment" on equipment;
create policy "Signed in reads equipment" on equipment for select using (auth.uid() is not null);
drop policy if exists "Admin writes equipment" on equipment;
create policy "Admin writes equipment" on equipment for insert with check (is_admin());
-- API route enforces field-level guard: crew may only PATCH current_hours.
drop policy if exists "Signed in updates equipment" on equipment;
create policy "Signed in updates equipment" on equipment for update using (auth.uid() is not null);
drop policy if exists "Admin deletes equipment" on equipment;
create policy "Admin deletes equipment" on equipment for delete using (is_admin());

alter table equipment_hour_readings enable row level security;
drop policy if exists "Signed in reads readings" on equipment_hour_readings;
create policy "Signed in reads readings" on equipment_hour_readings for select using (auth.uid() is not null);
drop policy if exists "Own readings insert" on equipment_hour_readings;
create policy "Own readings insert" on equipment_hour_readings
  for insert with check (recorded_by = auth.uid() or recorded_by is null);
drop policy if exists "Admin deletes readings" on equipment_hour_readings;
create policy "Admin deletes readings" on equipment_hour_readings for delete using (is_admin());


-- ============================================
-- 4. Maintenance tasks + history
-- ============================================
create table if not exists maintenance_tasks (
  id                  uuid primary key default uuid_generate_v4(),
  equipment_id        uuid not null references equipment(id) on delete cascade,
  title               text not null,                            -- "5 Yearly Service"
  description         text,
  priority            text check (priority in ('low', 'moderate', 'high', 'critical')),
  due_type            text not null check (due_type in ('calendar', 'hours')),
  interval_days       int check (interval_days is null or interval_days > 0),
  interval_hours      int check (interval_hours is null or interval_hours > 0),
  last_done_date      date,
  hours_at_last_done  int check (hours_at_last_done is null or hours_at_last_done >= 0),
  assigned_to         uuid references auth.users(id),
  active              boolean default true,
  -- Idempotency for daily cron alerts (prevents re-firing the same day).
  last_due_alerted_on     date,
  last_overdue_alerted_on date,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  constraint due_fields_match_type check (
    (due_type = 'calendar' and interval_days is not null and interval_hours is null) or
    (due_type = 'hours'    and interval_hours is not null and interval_days is null)
  )
);

create index if not exists idx_maint_equipment on maintenance_tasks(equipment_id);
create index if not exists idx_maint_due_type  on maintenance_tasks(due_type) where active;
create index if not exists idx_maint_active    on maintenance_tasks(active);

drop trigger if exists maint_updated_at on maintenance_tasks;
create trigger maint_updated_at before update on maintenance_tasks
  for each row execute procedure update_updated_at();

create table if not exists maintenance_history (
  id                  uuid primary key default uuid_generate_v4(),
  task_id             uuid not null references maintenance_tasks(id) on delete cascade,
  equipment_id        uuid not null references equipment(id),
  completed_at        timestamptz not null default now(),
  completed_by        uuid references auth.users(id),
  hours_at_completion int check (hours_at_completion is null or hours_at_completion >= 0),
  comments            text
);
create index if not exists idx_maint_history_task on maintenance_history(task_id, completed_at desc);
create index if not exists idx_maint_history_eq   on maintenance_history(equipment_id, completed_at desc);

alter table maintenance_tasks enable row level security;
drop policy if exists "Signed in reads tasks" on maintenance_tasks;
create policy "Signed in reads tasks" on maintenance_tasks for select using (auth.uid() is not null);
drop policy if exists "Admin writes tasks" on maintenance_tasks;
create policy "Admin writes tasks" on maintenance_tasks for insert with check (is_admin());
drop policy if exists "Admin updates tasks" on maintenance_tasks;
create policy "Admin updates tasks" on maintenance_tasks for update using (is_admin());
drop policy if exists "Admin deletes tasks" on maintenance_tasks;
create policy "Admin deletes tasks" on maintenance_tasks for delete using (is_admin());
-- Crew sign-off flows through a security-definer function (see complete_maintenance_task below).

alter table maintenance_history enable row level security;
drop policy if exists "Signed in reads history" on maintenance_history;
create policy "Signed in reads history" on maintenance_history for select using (auth.uid() is not null);
drop policy if exists "Signed in inserts history" on maintenance_history;
create policy "Signed in inserts history" on maintenance_history
  for insert with check (completed_by = auth.uid());
drop policy if exists "Admin deletes history" on maintenance_history;
create policy "Admin deletes history" on maintenance_history for delete using (is_admin());


-- ============================================
-- 5. Yard periods + quadrants + tasks
-- ============================================
create table if not exists yard_periods (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null,
  start_date date not null,
  end_date   date,
  status     text not null default 'planned' check (status in ('planned', 'active', 'closed')),
  notes      text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_yard_status on yard_periods(status);

drop trigger if exists yp_updated_at on yard_periods;
create trigger yp_updated_at before update on yard_periods
  for each row execute procedure update_updated_at();

create table if not exists yard_quadrants (
  id             uuid primary key default uuid_generate_v4(),
  yard_period_id uuid not null references yard_periods(id) on delete cascade,
  name           text not null,
  color          text not null default '#94a3b8',
  display_order  int default 0,
  created_at     timestamptz default now()
);
create index if not exists idx_quad_period on yard_quadrants(yard_period_id, display_order);

create table if not exists yard_tasks (
  id             uuid primary key default uuid_generate_v4(),
  yard_period_id uuid not null references yard_periods(id) on delete cascade,
  quadrant_id    uuid not null references yard_quadrants(id) on delete restrict,
  title          text not null,
  description    text,
  owner_id       uuid references auth.users(id),
  progress_pct   int not null default 0 check (progress_pct between 0 and 100),
  effort         text check (effort in ('S', 'M', 'L')),
  due_date       date,
  status         text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  actual_cost    numeric(10, 2) check (actual_cost is null or actual_cost >= 0),
  completed_at   timestamptz,
  completed_by   uuid references auth.users(id),
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);
create index if not exists idx_yt_period_status on yard_tasks(yard_period_id, status);
create index if not exists idx_yt_quadrant      on yard_tasks(quadrant_id);
create index if not exists idx_yt_title_trgm    on yard_tasks using gin (title gin_trgm_ops);

drop trigger if exists yt_updated_at on yard_tasks;
create trigger yt_updated_at before update on yard_tasks
  for each row execute procedure update_updated_at();

alter table yard_periods   enable row level security;
alter table yard_quadrants enable row level security;
alter table yard_tasks     enable row level security;

drop policy if exists "Signed in reads yard_periods" on yard_periods;
create policy "Signed in reads yard_periods" on yard_periods for select using (auth.uid() is not null);
drop policy if exists "Signed in reads yard_quadrants" on yard_quadrants;
create policy "Signed in reads yard_quadrants" on yard_quadrants for select using (auth.uid() is not null);
drop policy if exists "Signed in reads yard_tasks" on yard_tasks;
create policy "Signed in reads yard_tasks" on yard_tasks for select using (auth.uid() is not null);

drop policy if exists "Admin writes yard_periods" on yard_periods;
create policy "Admin writes yard_periods" on yard_periods for all using (is_admin()) with check (is_admin());
drop policy if exists "Admin writes yard_quadrants" on yard_quadrants;
create policy "Admin writes yard_quadrants" on yard_quadrants for all using (is_admin()) with check (is_admin());

drop policy if exists "Admin writes yard_tasks" on yard_tasks;
create policy "Admin writes yard_tasks" on yard_tasks for insert with check (is_admin());
drop policy if exists "Admin or owner updates yard_tasks" on yard_tasks;
create policy "Admin or owner updates yard_tasks" on yard_tasks for update
  using (is_admin() or owner_id = auth.uid());
drop policy if exists "Admin deletes yard_tasks" on yard_tasks;
create policy "Admin deletes yard_tasks" on yard_tasks for delete using (is_admin());


-- ============================================
-- 6. Cross-module: parts consumed + alert engine
-- ============================================
create table if not exists parts_consumed (
  id                uuid primary key default uuid_generate_v4(),
  source_type       text not null check (source_type in ('maintenance', 'yard')),
  source_id         uuid not null,
  inventory_item_id uuid not null references inventory_items(id) on delete restrict,
  qty_used          int not null check (qty_used > 0),
  recorded_at       timestamptz not null default now(),
  recorded_by       uuid references auth.users(id)
);
create index if not exists idx_pc_source    on parts_consumed(source_type, source_id);
create index if not exists idx_pc_inventory on parts_consumed(inventory_item_id, recorded_at desc);

alter table parts_consumed enable row level security;
drop policy if exists "Signed in reads parts_consumed" on parts_consumed;
create policy "Signed in reads parts_consumed" on parts_consumed for select using (auth.uid() is not null);
drop policy if exists "Signed in inserts parts_consumed" on parts_consumed;
create policy "Signed in inserts parts_consumed" on parts_consumed
  for insert with check (recorded_by = auth.uid());
drop policy if exists "Admin updates parts_consumed" on parts_consumed;
create policy "Admin updates parts_consumed" on parts_consumed for update using (is_admin());
drop policy if exists "Admin deletes parts_consumed" on parts_consumed;
create policy "Admin deletes parts_consumed" on parts_consumed for delete using (is_admin());


-- ============================================
-- 7. Notifications + per-user settings
-- ============================================
create table if not exists notifications (
  id              uuid primary key default uuid_generate_v4(),
  kind            text not null check (kind in (
    'inventory_critical', 'maintenance_due', 'maintenance_overdue'
  )),
  channel         text not null check (channel in ('in_app', 'email')),
  recipient_id    uuid not null references auth.users(id) on delete cascade,
  recipient_email text,
  subject         text not null,
  body            text not null,
  related_type    text,
  related_id      uuid,
  status          text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  error           text,
  read_at         timestamptz,
  created_at      timestamptz default now(),
  sent_at         timestamptz
);
create index if not exists idx_notif_recipient_unread
  on notifications(recipient_id, channel) where read_at is null and channel = 'in_app';
create index if not exists idx_notif_pending
  on notifications(channel, status, created_at) where status = 'pending';
create index if not exists idx_notif_related on notifications(related_type, related_id);

alter table notifications enable row level security;
drop policy if exists "Own in-app reads" on notifications;
create policy "Own in-app reads" on notifications for select
  using (recipient_id = auth.uid() and channel = 'in_app');
drop policy if exists "Mark own read" on notifications;
create policy "Mark own read" on notifications for update
  using (recipient_id = auth.uid() and channel = 'in_app')
  with check (recipient_id = auth.uid());
drop policy if exists "Admin reads all" on notifications;
create policy "Admin reads all" on notifications for select using (is_admin());

create table if not exists notification_settings (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  inventory_in_app   boolean not null default true,
  inventory_email    boolean not null default false,
  maintenance_in_app boolean not null default false,
  maintenance_email  boolean not null default false,
  updated_at         timestamptz default now()
);
alter table notification_settings enable row level security;
drop policy if exists "Read own settings" on notification_settings;
create policy "Read own settings" on notification_settings for select using (user_id = auth.uid() or is_admin());
drop policy if exists "Update own settings" on notification_settings;
create policy "Update own settings" on notification_settings for update using (user_id = auth.uid());
drop policy if exists "Insert own settings" on notification_settings;
create policy "Insert own settings" on notification_settings for insert
  with check (user_id = auth.uid() or is_admin());


-- ============================================
-- 8. Helper functions — quantity change + crossing detection
-- ============================================

-- Enqueue both in_app + email rows for an inventory critical alert. One row
-- per opted-in user per channel.
create or replace function enqueue_inventory_alert(p_item_id uuid, p_new_qty int) returns void as $$
declare
  v_item    inventory_items%rowtype;
  v_subject text;
  v_body    text;
  v_user    record;
begin
  select * into v_item from inventory_items where id = p_item_id;
  if not found then return; end if;

  v_subject := format('Stock alert: %s', v_item.part_name);
  v_body := format(
    '%s (P/N %s) is at %s %s — threshold %s. Location: %s.',
    v_item.part_name,
    coalesce(v_item.part_number, '—'),
    p_new_qty,
    v_item.unit,
    coalesce(v_item.critical_threshold::text, '—'),
    coalesce(v_item.location, '—')
  );

  for v_user in
    select up.id, up.full_name, au.email,
           coalesce(ns.inventory_in_app, true)  as in_app_on,
           coalesce(ns.inventory_email, false)  as email_on
      from user_profiles up
      join auth.users au on au.id = up.id
      left join notification_settings ns on ns.user_id = up.id
     where up.active
  loop
    if v_user.in_app_on then
      insert into notifications (kind, channel, recipient_id, recipient_email, subject, body, related_type, related_id)
      values ('inventory_critical', 'in_app', v_user.id, v_user.email, v_subject, v_body, 'inventory_items', p_item_id);
    end if;
    if v_user.email_on and v_user.email is not null then
      insert into notifications (kind, channel, recipient_id, recipient_email, subject, body, related_type, related_id)
      values ('inventory_critical', 'email', v_user.id, v_user.email, v_subject, v_body, 'inventory_items', p_item_id);
    end if;
  end loop;
end;
$$ language plpgsql security definer;

-- Single funnel for every inventory.quantity change. Locks the row, computes
-- the new alert_state, and fires the alert ONLY on the above→at_or_below
-- crossing. Re-arming (going back above) is implicit — state flips, no alert.
create or replace function inv_apply_quantity_change(
  p_item_id uuid,
  p_delta   int,
  p_actor   uuid
) returns void as $$
declare
  v_before    inventory_items%rowtype;
  v_new_qty   int;
  v_new_state text;
begin
  select * into v_before from inventory_items where id = p_item_id for update;
  if not found then
    raise exception 'inventory item not found: %', p_item_id;
  end if;

  v_new_qty := v_before.quantity + p_delta;
  if v_new_qty < 0 then
    raise exception 'insufficient stock for %: have %, asked for %',
      v_before.part_name, v_before.quantity, -p_delta;
  end if;

  if v_before.critical_threshold is null then
    v_new_state := 'above';
  elsif v_new_qty <= v_before.critical_threshold then
    v_new_state := 'at_or_below';
  else
    v_new_state := 'above';
  end if;

  update inventory_items
     set quantity    = v_new_qty,
         alert_state = v_new_state,
         updated_at  = now()
   where id = p_item_id;

  if v_before.alert_state = 'above' and v_new_state = 'at_or_below' then
    perform enqueue_inventory_alert(p_item_id, v_new_qty);
  end if;
end;
$$ language plpgsql security definer;

-- AFTER INSERT on parts_consumed → decrement + crossing check.
create or replace function pc_after_insert() returns trigger as $$
begin
  perform inv_apply_quantity_change(new.inventory_item_id, -new.qty_used, new.recorded_by);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists pc_after_insert_t on parts_consumed;
create trigger pc_after_insert_t after insert on parts_consumed
  for each row execute procedure pc_after_insert();


-- Maintenance sign-off: atomic state advance + optional parts_consumed +
-- optional equipment hours bump. Called as RPC from the API route. The
-- function bypasses the admin-only UPDATE policy on maintenance_tasks for the
-- sign-off date/hours fields only.
create or replace function complete_maintenance_task(
  p_task_id             uuid,
  p_completed_by        uuid,
  p_hours_at_completion int,
  p_comments            text,
  p_parts               jsonb  -- [{"inventory_item_id": uuid, "qty_used": int}]
) returns uuid as $$
declare
  v_task     maintenance_tasks%rowtype;
  v_history_id uuid;
  v_part     jsonb;
begin
  select * into v_task from maintenance_tasks where id = p_task_id;
  if not found then
    raise exception 'maintenance task not found: %', p_task_id;
  end if;
  if not v_task.active then
    raise exception 'cannot complete an inactive task';
  end if;

  insert into maintenance_history
    (task_id, equipment_id, completed_at, completed_by, hours_at_completion, comments)
  values
    (p_task_id, v_task.equipment_id, now(), p_completed_by, p_hours_at_completion, p_comments)
  returning id into v_history_id;

  -- Advance the task's "last done" pointer based on its due type.
  if v_task.due_type = 'calendar' then
    update maintenance_tasks
       set last_done_date = current_date,
           last_due_alerted_on = null,
           last_overdue_alerted_on = null,
           updated_at = now()
     where id = p_task_id;
  else
    update maintenance_tasks
       set hours_at_last_done = coalesce(p_hours_at_completion, hours_at_last_done),
           last_due_alerted_on = null,
           last_overdue_alerted_on = null,
           updated_at = now()
     where id = p_task_id;
    -- Bump equipment.current_hours too (and the hour-readings log via trigger).
    if p_hours_at_completion is not null then
      update equipment
         set current_hours = greatest(coalesce(current_hours, 0), p_hours_at_completion)
       where id = v_task.equipment_id;
    end if;
  end if;

  -- Consume parts, if any. parts_consumed trigger handles the qty decrement.
  if p_parts is not null and jsonb_array_length(p_parts) > 0 then
    for v_part in select * from jsonb_array_elements(p_parts) loop
      insert into parts_consumed
        (source_type, source_id, inventory_item_id, qty_used, recorded_by)
      values
        ('maintenance',
         v_history_id,
         (v_part->>'inventory_item_id')::uuid,
         (v_part->>'qty_used')::int,
         p_completed_by);
    end loop;
  end if;

  return v_history_id;
end;
$$ language plpgsql security definer;


-- ============================================
-- 9. Backfill notification_settings for existing users
-- ============================================
-- Default each user to in_app=on for inventory, all email off. Admins still
-- see everything via the policy regardless of these toggles.
insert into notification_settings (user_id, inventory_in_app, inventory_email, maintenance_in_app, maintenance_email)
select id, true, false, false, false from auth.users
on conflict (user_id) do nothing;


-- ============================================
-- DONE
-- ============================================
-- Next steps:
-- 1. Run a probe (scripts/probe-schema.mjs once added) to verify RLS as crew
--    vs admin. Crew should be able to SELECT all inventory_items but UPDATE
--    none directly; admin should have full CRUD.
-- 2. Confirm enqueue_inventory_alert fires when you manually update
--    inventory_items.quantity from 5 to 1 with critical_threshold=4.
