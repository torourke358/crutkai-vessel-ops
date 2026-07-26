-- ============================================
-- Thor — Dry-dock disassembly planner (photo → AI plan → yard tasks)
-- Run in: Supabase Dashboard → SQL Editor → New query
-- Target: project ref trplphistdsfuecnnzdu
-- Safe to re-run.
--
-- Craig photographs an area of the ship before a yard period (e.g. the engine
-- room). Claude vision looks at the photos and produces the fastest safe ORDER
-- of disassembly, flagging blockers — the canonical example being an AC unit
-- that must come out FIRST because the AC contractor has a ~2-week scheduling
-- lead time. Plans are drafted, edited, then converted into yard_tasks.
--
-- Adds: private storage bucket `disassembly-photos` (same per-user-folder RLS
-- pattern as equipment-photos), plus `disassembly_plans` and
-- `disassembly_steps` tables. Signed-in read, is_admin() write.
-- ============================================

-- 1) Storage bucket for area photos. Private; per-user-folder upload,
--    signed-in read, own-or-admin delete (pattern from 06_equipment_photos).
insert into storage.buckets (id, name, public)
values ('disassembly-photos', 'disassembly-photos', false)
on conflict (id) do nothing;

drop policy if exists "Disassembly photos: own folder upload" on storage.objects;
create policy "Disassembly photos: own folder upload" on storage.objects
  for insert with check (
    bucket_id = 'disassembly-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Disassembly photos: signed-in read" on storage.objects;
create policy "Disassembly photos: signed-in read" on storage.objects
  for select using (
    bucket_id = 'disassembly-photos'
    and auth.uid() is not null
  );

drop policy if exists "Disassembly photos: own delete or admin" on storage.objects;
create policy "Disassembly photos: own delete or admin" on storage.objects
  for delete using (
    bucket_id = 'disassembly-photos'
    and (auth.uid()::text = (storage.foldername(name))[1] or is_admin())
  );

-- 2) Plans. One row per photographed area / AI analysis.
create table if not exists disassembly_plans (
  id             uuid primary key default uuid_generate_v4(),
  created_by     uuid references auth.users(id),
  yard_period_id uuid references yard_periods(id) on delete set null,
  area_name      text not null,
  status         text not null default 'draft' check (status in ('draft', 'final', 'converted')),
  photo_paths    text[] not null default '{}',
  summary        text,
  model          text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);
create index if not exists idx_dplans_period on disassembly_plans(yard_period_id);

drop trigger if exists dplans_updated_at on disassembly_plans;
create trigger dplans_updated_at before update on disassembly_plans
  for each row execute procedure update_updated_at();

-- 3) Ordered steps. seq is the 1-based disassembly order; depends_on_seqs
--    references other steps' seq values within the same plan. is_blocking
--    marks steps that must be scheduled before yard work begins (external
--    contractor lead times, access blockers).
create table if not exists disassembly_steps (
  id                        uuid primary key default uuid_generate_v4(),
  plan_id                   uuid not null references disassembly_plans(id) on delete cascade,
  seq                       int not null,
  title                     text not null,
  description               text,
  equipment_label           text,
  depends_on_seqs           int[] not null default '{}',
  is_blocking               boolean not null default false,
  external_contractor       text,
  contractor_lead_time_days int,
  est_hours                 numeric,
  flag_reason               text
);
create index if not exists idx_dsteps_plan_seq on disassembly_steps(plan_id, seq);

-- 4) RLS: signed-in read, admin write — same posture as the yard tables.
alter table disassembly_plans enable row level security;
alter table disassembly_steps enable row level security;

drop policy if exists "Signed in reads disassembly_plans" on disassembly_plans;
create policy "Signed in reads disassembly_plans" on disassembly_plans
  for select using (auth.uid() is not null);
drop policy if exists "Admin writes disassembly_plans" on disassembly_plans;
create policy "Admin writes disassembly_plans" on disassembly_plans
  for all using (is_admin()) with check (is_admin());

drop policy if exists "Signed in reads disassembly_steps" on disassembly_steps;
create policy "Signed in reads disassembly_steps" on disassembly_steps
  for select using (auth.uid() is not null);
drop policy if exists "Admin writes disassembly_steps" on disassembly_steps;
create policy "Admin writes disassembly_steps" on disassembly_steps
  for all using (is_admin()) with check (is_admin());
