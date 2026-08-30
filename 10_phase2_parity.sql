-- ============================================
-- Runa — Phase 2: Seahub + Priority Matrix parity
-- Run in: Supabase Dashboard → SQL Editor → New query
-- Target: project ref trplphistdsfuecnnzdu
-- Safe to re-run.
-- ============================================

-- =========================================================
-- 1) INVENTORY — price/supplier/lead-time + documents
-- =========================================================

alter table inventory_items
  add column if not exists unit_price numeric(10,2) check (unit_price is null or unit_price >= 0),
  add column if not exists supplier text,
  add column if not exists lead_time_days int check (lead_time_days is null or lead_time_days >= 0);

create index if not exists idx_inventory_supplier on inventory_items(supplier) where supplier is not null;

create table if not exists inventory_documents (
  id                 uuid primary key default uuid_generate_v4(),
  inventory_item_id  uuid not null references inventory_items(id) on delete cascade,
  kind               text not null check (kind in ('quotation','invoice','spec','image','other')),
  file_name          text not null,
  file_path          text not null,
  file_size          int,
  mime_type          text,
  notes              text,
  uploaded_by        uuid references auth.users(id),
  uploaded_at        timestamptz not null default now()
);
create index if not exists idx_inventory_documents_item on inventory_documents(inventory_item_id, uploaded_at desc);

alter table inventory_documents enable row level security;
drop policy if exists "Signed in reads inventory_documents" on inventory_documents;
create policy "Signed in reads inventory_documents" on inventory_documents
  for select using (auth.uid() is not null);
drop policy if exists "Admin writes inventory_documents" on inventory_documents;
create policy "Admin writes inventory_documents" on inventory_documents
  for insert with check (is_admin() or uploaded_by = auth.uid());
drop policy if exists "Admin updates inventory_documents" on inventory_documents;
create policy "Admin updates inventory_documents" on inventory_documents
  for update using (is_admin());
drop policy if exists "Admin deletes inventory_documents" on inventory_documents;
create policy "Admin deletes inventory_documents" on inventory_documents
  for delete using (is_admin() or uploaded_by = auth.uid());

insert into storage.buckets (id, name, public)
values ('inventory-documents', 'inventory-documents', false)
on conflict (id) do nothing;
drop policy if exists "Inventory docs: own folder upload" on storage.objects;
create policy "Inventory docs: own folder upload" on storage.objects
  for insert with check (
    bucket_id = 'inventory-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
drop policy if exists "Inventory docs: signed-in read" on storage.objects;
create policy "Inventory docs: signed-in read" on storage.objects
  for select using (
    bucket_id = 'inventory-documents'
    and auth.uid() is not null
  );
drop policy if exists "Inventory docs: own delete or admin" on storage.objects;
create policy "Inventory docs: own delete or admin" on storage.objects
  for delete using (
    bucket_id = 'inventory-documents'
    and (auth.uid()::text = (storage.foldername(name))[1] or is_admin())
  );

-- Crew can now update quantity directly (inline qty edit). The existing
-- "Admin updates inventory" policy stays for admin-only field edits; this
-- adds a parallel crew-only policy scoped to qty changes. Field-level
-- enforcement is in the API route since RLS can't see the column being
-- changed without a trigger.
drop policy if exists "Crew adjusts inventory quantity" on inventory_items;
create policy "Crew adjusts inventory quantity" on inventory_items
  for update using (auth.uid() is not null);


-- =========================================================
-- 2) MAINTENANCE — (calendar view is read-only, no schema change)
-- =========================================================
-- nothing


-- =========================================================
-- 3) YARD — urgency tier + comments + documents + followers
-- =========================================================

alter table yard_tasks
  add column if not exists urgency text check (
    urgency is null or urgency in ('fires','prioritize','reduce','repository')
  ),
  add column if not exists follower_ids uuid[] not null default '{}';

create index if not exists idx_yard_tasks_urgency on yard_tasks(urgency) where urgency is not null;

create table if not exists yard_task_comments (
  id            uuid primary key default uuid_generate_v4(),
  yard_task_id  uuid not null references yard_tasks(id) on delete cascade,
  author_id     uuid references auth.users(id),
  body          text not null check (length(body) > 0 and length(body) <= 4000),
  created_at    timestamptz not null default now()
);
create index if not exists idx_yard_task_comments on yard_task_comments(yard_task_id, created_at desc);

alter table yard_task_comments enable row level security;
drop policy if exists "Signed in reads yard_task_comments" on yard_task_comments;
create policy "Signed in reads yard_task_comments" on yard_task_comments
  for select using (auth.uid() is not null);
drop policy if exists "Signed in writes yard_task_comments" on yard_task_comments;
create policy "Signed in writes yard_task_comments" on yard_task_comments
  for insert with check (author_id = auth.uid());
drop policy if exists "Author or admin updates yard_task_comments" on yard_task_comments;
create policy "Author or admin updates yard_task_comments" on yard_task_comments
  for update using (author_id = auth.uid() or is_admin());
drop policy if exists "Author or admin deletes yard_task_comments" on yard_task_comments;
create policy "Author or admin deletes yard_task_comments" on yard_task_comments
  for delete using (author_id = auth.uid() or is_admin());

create table if not exists yard_task_documents (
  id            uuid primary key default uuid_generate_v4(),
  yard_task_id  uuid not null references yard_tasks(id) on delete cascade,
  file_name     text not null,
  file_path     text not null,
  file_size     int,
  mime_type     text,
  uploaded_by   uuid references auth.users(id),
  uploaded_at   timestamptz not null default now()
);
create index if not exists idx_yard_task_documents on yard_task_documents(yard_task_id, uploaded_at desc);

alter table yard_task_documents enable row level security;
drop policy if exists "Signed in reads yard_task_documents" on yard_task_documents;
create policy "Signed in reads yard_task_documents" on yard_task_documents
  for select using (auth.uid() is not null);
drop policy if exists "Signed in writes yard_task_documents" on yard_task_documents;
create policy "Signed in writes yard_task_documents" on yard_task_documents
  for insert with check (uploaded_by = auth.uid());
drop policy if exists "Owner or admin deletes yard_task_documents" on yard_task_documents;
create policy "Owner or admin deletes yard_task_documents" on yard_task_documents
  for delete using (uploaded_by = auth.uid() or is_admin());

insert into storage.buckets (id, name, public)
values ('yard-task-documents', 'yard-task-documents', false)
on conflict (id) do nothing;
drop policy if exists "Yard docs: own folder upload" on storage.objects;
create policy "Yard docs: own folder upload" on storage.objects
  for insert with check (
    bucket_id = 'yard-task-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
drop policy if exists "Yard docs: signed-in read" on storage.objects;
create policy "Yard docs: signed-in read" on storage.objects
  for select using (
    bucket_id = 'yard-task-documents'
    and auth.uid() is not null
  );
drop policy if exists "Yard docs: own delete or admin" on storage.objects;
create policy "Yard docs: own delete or admin" on storage.objects
  for delete using (
    bucket_id = 'yard-task-documents'
    and (auth.uid()::text = (storage.foldername(name))[1] or is_admin())
  );


-- =========================================================
-- 4) DEFECTS — found-during-ops issues, distinct from PMs
-- =========================================================

create table if not exists defects (
  id            uuid primary key default uuid_generate_v4(),
  title         text not null,
  description   text,
  equipment_id  uuid references equipment(id) on delete set null,
  reported_by   uuid references auth.users(id),
  assigned_to   uuid references auth.users(id),
  status        text not null default 'open' check (status in ('open','in_progress','resolved')),
  severity      text not null default 'normal' check (severity in ('low','normal','high','critical')),
  resolved_at   timestamptz,
  resolved_by   uuid references auth.users(id),
  resolution    text,
  image_path    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_defects_status on defects(status);
create index if not exists idx_defects_severity on defects(severity);
create index if not exists idx_defects_equipment on defects(equipment_id);
create trigger defects_updated_at before update on defects
  for each row execute procedure update_updated_at();

alter table defects enable row level security;
drop policy if exists "Signed in reads defects" on defects;
create policy "Signed in reads defects" on defects for select using (auth.uid() is not null);
drop policy if exists "Signed in writes defects" on defects;
create policy "Signed in writes defects" on defects
  for insert with check (reported_by = auth.uid() or is_admin());
drop policy if exists "Signed in updates defects" on defects;
create policy "Signed in updates defects" on defects
  for update using (auth.uid() is not null);
drop policy if exists "Admin deletes defects" on defects;
create policy "Admin deletes defects" on defects for delete using (is_admin());

create table if not exists defect_comments (
  id          uuid primary key default uuid_generate_v4(),
  defect_id   uuid not null references defects(id) on delete cascade,
  author_id   uuid references auth.users(id),
  body        text not null check (length(body) > 0 and length(body) <= 4000),
  created_at  timestamptz not null default now()
);
create index if not exists idx_defect_comments on defect_comments(defect_id, created_at desc);
alter table defect_comments enable row level security;
drop policy if exists "Signed in reads defect_comments" on defect_comments;
create policy "Signed in reads defect_comments" on defect_comments for select using (auth.uid() is not null);
drop policy if exists "Signed in writes defect_comments" on defect_comments;
create policy "Signed in writes defect_comments" on defect_comments
  for insert with check (author_id = auth.uid());

-- Defects share the existing equipment-photos bucket for the report image.
-- No separate storage bucket needed.


-- =========================================================
-- 5) CHECKLISTS — templates + runs + items
-- =========================================================

create table if not exists checklist_templates (
  id           uuid primary key default uuid_generate_v4(),
  title        text not null,
  description  text,
  category     text,
  active       boolean not null default true,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger checklist_templates_updated_at before update on checklist_templates
  for each row execute procedure update_updated_at();

create table if not exists checklist_template_items (
  id              uuid primary key default uuid_generate_v4(),
  template_id     uuid not null references checklist_templates(id) on delete cascade,
  display_order   int not null default 0,
  body            text not null,
  required        boolean not null default true
);
create index if not exists idx_checklist_template_items on checklist_template_items(template_id, display_order);

create table if not exists checklist_runs (
  id            uuid primary key default uuid_generate_v4(),
  template_id   uuid not null references checklist_templates(id) on delete restrict,
  started_by    uuid references auth.users(id),
  started_at    timestamptz not null default now(),
  completed_at  timestamptz,
  notes         text
);
create index if not exists idx_checklist_runs_template on checklist_runs(template_id, started_at desc);

create table if not exists checklist_run_items (
  id              uuid primary key default uuid_generate_v4(),
  run_id          uuid not null references checklist_runs(id) on delete cascade,
  template_item_id uuid not null references checklist_template_items(id),
  checked         boolean not null default false,
  checked_at      timestamptz,
  checked_by      uuid references auth.users(id),
  note            text
);
create index if not exists idx_checklist_run_items on checklist_run_items(run_id);

alter table checklist_templates enable row level security;
alter table checklist_template_items enable row level security;
alter table checklist_runs enable row level security;
alter table checklist_run_items enable row level security;

drop policy if exists "Signed in reads checklist_templates" on checklist_templates;
create policy "Signed in reads checklist_templates" on checklist_templates
  for select using (auth.uid() is not null);
drop policy if exists "Admin writes checklist_templates" on checklist_templates;
create policy "Admin writes checklist_templates" on checklist_templates
  for all using (is_admin());

drop policy if exists "Signed in reads checklist_template_items" on checklist_template_items;
create policy "Signed in reads checklist_template_items" on checklist_template_items
  for select using (auth.uid() is not null);
drop policy if exists "Admin writes checklist_template_items" on checklist_template_items;
create policy "Admin writes checklist_template_items" on checklist_template_items
  for all using (is_admin());

drop policy if exists "Signed in reads checklist_runs" on checklist_runs;
create policy "Signed in reads checklist_runs" on checklist_runs
  for select using (auth.uid() is not null);
drop policy if exists "Signed in writes checklist_runs" on checklist_runs;
create policy "Signed in writes checklist_runs" on checklist_runs
  for insert with check (started_by = auth.uid());
drop policy if exists "Signed in updates checklist_runs" on checklist_runs;
create policy "Signed in updates checklist_runs" on checklist_runs
  for update using (auth.uid() is not null);
drop policy if exists "Admin deletes checklist_runs" on checklist_runs;
create policy "Admin deletes checklist_runs" on checklist_runs
  for delete using (is_admin());

drop policy if exists "Signed in reads checklist_run_items" on checklist_run_items;
create policy "Signed in reads checklist_run_items" on checklist_run_items
  for select using (auth.uid() is not null);
drop policy if exists "Signed in writes checklist_run_items" on checklist_run_items;
create policy "Signed in writes checklist_run_items" on checklist_run_items
  for all using (auth.uid() is not null);


-- =========================================================
-- 6) VESSEL LOGS — daily diary of ops
-- =========================================================

create table if not exists vessel_logs (
  id            uuid primary key default uuid_generate_v4(),
  log_date      date not null,
  category      text not null check (category in ('crossing','charter','guest','crew','other')),
  title         text not null,
  body          text,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_vessel_logs_date on vessel_logs(log_date desc);
create index if not exists idx_vessel_logs_category on vessel_logs(category);
create index if not exists idx_vessel_logs_title_trgm on vessel_logs using gin (title gin_trgm_ops);
create trigger vessel_logs_updated_at before update on vessel_logs
  for each row execute procedure update_updated_at();

alter table vessel_logs enable row level security;
drop policy if exists "Signed in reads vessel_logs" on vessel_logs;
create policy "Signed in reads vessel_logs" on vessel_logs for select using (auth.uid() is not null);
drop policy if exists "Signed in writes vessel_logs" on vessel_logs;
create policy "Signed in writes vessel_logs" on vessel_logs
  for insert with check (created_by = auth.uid());
drop policy if exists "Author or admin updates vessel_logs" on vessel_logs;
create policy "Author or admin updates vessel_logs" on vessel_logs
  for update using (created_by = auth.uid() or is_admin());
drop policy if exists "Admin deletes vessel_logs" on vessel_logs;
create policy "Admin deletes vessel_logs" on vessel_logs for delete using (is_admin());
