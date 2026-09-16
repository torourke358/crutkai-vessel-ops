-- ============================================
-- Runa — Yard period: money (estimates, invoices, payments) + schedule (Gantt)
-- Run in: Supabase Dashboard → SQL Editor → New query
-- Target: project ref trplphistdsfuecnnzdu
-- Safe to re-run.
--
-- Craig asked for two things that turn out to be one thing: the money on a
-- refit (estimates, down payments, invoices photographed on deck, a running
-- balance) and a schedule (start/end per job, the room it happens in, a
-- Gantt, and an alert when two jobs clash).
--
-- A VENDOR'S ESTIMATE IS THE SPINE OF BOTH. The Roscioli 2012–13 job already
-- in this database is one record worth $723,247.34 covering 61 work orders,
-- 21 Dec → 28 Jun. That is simultaneously a pile of money and a stretch of
-- calendar. So `yard_estimates` is both the money container and the phase bar
-- on the timeline, and one photographed estimate produces both.
--
-- ⚠ THE TWO LEDGERS MUST NEVER MIX. This database is SHARED with
-- crutkai-petty-cash. Petty cash is the yearly operating budget; the yard is a
-- capital project on a 5–10 year cycle (Roscioli was ~25× all petty cash ever
-- recorded). Every table here is prefixed `yard_` so no yard row can ever be
-- confused with, or summed into, a petty cash total.
--
-- MONEY IS THREE THINGS, NOT ONE — commitment, bill, cash:
--   yard_estimates  what it should cost   (the quote)
--   yard_invoices   what the vendor billed
--   yard_payments   cash out; a DEPOSIT is a payment with no invoice yet
-- Merging them would double-count a deposit against the invoice it later
-- covers. Nothing is stored that can be derived:
--   committed = Σ estimates · billed = Σ invoices · paid = Σ payments
--   outstanding = billed − paid · still to come = committed − billed
--
-- CURRENCY is per estimate and totals are NEVER summed across currencies —
-- the same discipline as getMonthlyStatement() in the petty cash app. The
-- boat travels; a refit in Palma should not need a rebuild.
--
-- Adds: yard_vendors, yard_estimates, yard_invoices, yard_payments,
-- yard_conflict_rules; schedule columns on yard_tasks; a widened
-- notifications kind CHECK; and the private `yard-documents` bucket.
-- ============================================


-- ============================================
-- 1) Storage: private bucket for photographed estimates and invoices.
--    Same per-user-folder pattern as yard-task-documents (10_phase2_parity).
--    A separate bucket, not a reuse: these documents hang off an estimate or
--    an invoice, not off a task, and they get sent to the vision API.
-- ============================================
insert into storage.buckets (id, name, public)
values ('yard-documents', 'yard-documents', false)
on conflict (id) do nothing;

drop policy if exists "Yard money docs: own folder upload" on storage.objects;
create policy "Yard money docs: own folder upload" on storage.objects
  for insert with check (
    bucket_id = 'yard-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Yard money docs: signed-in read" on storage.objects;
create policy "Yard money docs: signed-in read" on storage.objects
  for select using (
    bucket_id = 'yard-documents'
    and auth.uid() is not null
  );

drop policy if exists "Yard money docs: own delete or admin" on storage.objects;
create policy "Yard money docs: own delete or admin" on storage.objects
  for delete using (
    bucket_id = 'yard-documents'
    and (auth.uid()::text = (storage.foldername(name))[1] or is_admin())
  );


-- ============================================
-- 2) Vendors. Runa has never had one — today a contractor is free text in
--    yard_tasks.resources (placeholder: "Vendor contacts, manuals, links…")
--    and in disassembly_steps.external_contractor, which the planner throws
--    away on conversion. Vessel-wide, not per-period: Roscioli comes back.
-- ============================================
create table if not exists yard_vendors (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null,
  trade      text,                       -- 'paint', 'machinery', 'canvas', 'electronics'
  contact    text,
  notes      text,
  active     boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_yard_vendors_name on yard_vendors (lower(name));
create index if not exists idx_yard_vendors_active on yard_vendors (active, name) where active;

drop trigger if exists yv_updated_at on yard_vendors;
create trigger yv_updated_at before update on yard_vendors
  for each row execute procedure update_updated_at();


-- ============================================
-- 3) Estimates — THE SPINE. Money container and timeline phase bar in one row.
-- ============================================
create table if not exists yard_estimates (
  id             uuid primary key default uuid_generate_v4(),
  yard_period_id uuid not null references yard_periods(id) on delete cascade,
  vendor_id      uuid references yard_vendors(id) on delete restrict,
  title          text not null,
  reference      text,                                   -- the vendor's own quote number
  amount         numeric(12, 2) check (amount is null or amount >= 0),
  currency       text not null default 'USD'
                   check (currency in ('USD', 'EUR', 'GBP', 'CAD', 'AUD')),
  start_date     date,                                   -- when they're on the boat
  end_date       date,
  status         text not null default 'draft'
                   check (status in ('draft', 'approved', 'in_progress', 'closed', 'declined')),
  document_path  text,                                   -- yard-documents bucket
  ai_extraction  jsonb,                                  -- full raw Claude parse, kept for audit
  ai_confidence  text check (ai_confidence is null or ai_confidence in ('high', 'medium', 'low')),
  notes          text,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint yard_estimates_dates_ordered
    check (start_date is null or end_date is null or end_date >= start_date)
);

create index if not exists idx_yard_est_period on yard_estimates (yard_period_id, start_date);
create index if not exists idx_yard_est_vendor on yard_estimates (vendor_id);

drop trigger if exists ye_updated_at on yard_estimates;
create trigger ye_updated_at before update on yard_estimates
  for each row execute procedure update_updated_at();


-- ============================================
-- 4) Invoices — what the vendor has actually billed.
--    Currency is inherited from the estimate, never re-stated, so a bill can
--    never drift into a different currency from the quote it belongs to.
-- ============================================
create table if not exists yard_invoices (
  id             uuid primary key default uuid_generate_v4(),
  yard_period_id uuid not null references yard_periods(id) on delete cascade,
  estimate_id    uuid references yard_estimates(id) on delete set null,
  reference      text,                                   -- invoice number
  amount         numeric(12, 2) not null check (amount >= 0),
  issued_date    date,
  document_path  text,
  ai_extraction  jsonb,
  ai_confidence  text check (ai_confidence is null or ai_confidence in ('high', 'medium', 'low')),
  notes          text,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_yard_inv_period on yard_invoices (yard_period_id, issued_date desc);
create index if not exists idx_yard_inv_estimate on yard_invoices (estimate_id);

drop trigger if exists yi_updated_at on yard_invoices;
create trigger yi_updated_at before update on yard_invoices
  for each row execute procedure update_updated_at();


-- ============================================
-- 5) Payments — cash out. A DEPOSIT is simply a payment with no invoice_id,
--    which is exactly Craig's case: "if I paid 80k already it shows the
--    deposits and the running balance."
-- ============================================
create table if not exists yard_payments (
  id             uuid primary key default uuid_generate_v4(),
  yard_period_id uuid not null references yard_periods(id) on delete cascade,
  estimate_id    uuid references yard_estimates(id) on delete set null,
  invoice_id     uuid references yard_invoices(id) on delete set null,
  kind           text not null default 'progress'
                   check (kind in ('deposit', 'progress', 'final', 'refund')),
  amount         numeric(12, 2) not null check (amount <> 0),  -- negative = refund
  paid_date      date,
  method         text,                                   -- 'wire', 'card', 'check'
  reference      text,
  notes          text,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_yard_pay_period on yard_payments (yard_period_id, paid_date desc);
create index if not exists idx_yard_pay_estimate on yard_payments (estimate_id);
create index if not exists idx_yard_pay_invoice on yard_payments (invoice_id);

drop trigger if exists yp_pay_updated_at on yard_payments;
create trigger yp_pay_updated_at before update on yard_payments
  for each row execute procedure update_updated_at();


-- ============================================
-- 6) Schedule columns on yard_tasks.
--
--    due_date is left exactly as it is — the board, the reports and the
--    reminder cron all read it, and nothing here may break what Craig uses.
--    start_date/end_date are the Gantt's own pair.
--
--    ⚠ zone_id RE-INTRODUCES A KEY THAT 13_round1_craig_feedback.sql REMOVED
--    from `equipment` (it dropped equipment.zone_id in favour of free-text
--    location_on_vessel). That was the right call for equipment; it is the
--    wrong one here, because "two machinery jobs can't both be in the engine
--    room" cannot be checked against free text. Flagged to Craig, not done
--    quietly. vessel_zones already holds the 15 rooms including engine_room.
--
--    depends_on_ids is a uuid[] rather than a join table, matching
--    disassembly_steps.depends_on_seqs — same shape, one less table, and the
--    planner's graph can now be carried across instead of flattened to prose.
-- ============================================
alter table yard_tasks
  add column if not exists start_date     date,
  add column if not exists end_date       date,
  add column if not exists zone_id        uuid references vessel_zones(id) on delete set null,
  add column if not exists trade          text,
  add column if not exists estimate_id    uuid references yard_estimates(id) on delete set null,
  add column if not exists depends_on_ids uuid[] not null default '{}';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'yard_tasks_schedule_ordered' and conrelid = 'yard_tasks'::regclass
  ) then
    alter table yard_tasks add constraint yard_tasks_schedule_ordered
      check (start_date is null or end_date is null or end_date >= start_date);
  end if;
end $$;

create index if not exists idx_yt_schedule on yard_tasks (yard_period_id, start_date)
  where start_date is not null;
create index if not exists idx_yt_zone on yard_tasks (zone_id) where zone_id is not null;
create index if not exists idx_yt_estimate on yard_tasks (estimate_id) where estimate_id is not null;


-- ============================================
-- 7) Clash rules. Editable, so the list gets smarter without a deploy.
--    Checked in the browser on every drag: instant, free, deterministic.
--    Claude is the second pass and proposes rows here for Craig to accept.
--
--    kind='same_zone'  — two jobs of trade_a in the same room can't overlap.
--                        trade_a null = ANY two jobs in that room.
--    kind='trade_pair' — trade_a and trade_b can't run at the same time,
--                        optionally only within zone_id.
-- ============================================
create table if not exists yard_conflict_rules (
  id         uuid primary key default uuid_generate_v4(),
  kind       text not null check (kind in ('same_zone', 'trade_pair')),
  trade_a    text,
  trade_b    text,
  zone_id    uuid references vessel_zones(id) on delete cascade,  -- null = every room
  severity   text not null default 'warn' check (severity in ('warn', 'block')),
  reason     text not null,
  active     boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint yard_conflict_rules_pair_needs_both
    check (kind <> 'trade_pair' or (trade_a is not null and trade_b is not null))
);

create index if not exists idx_yard_rules_active on yard_conflict_rules (active) where active;

-- Craig's own two examples are the first two rules.
insert into yard_conflict_rules (kind, trade_a, trade_b, severity, reason)
select v.kind, v.trade_a, v.trade_b, v.severity, v.reason
from (values
  ('same_zone',  'machinery', null,       'warn',
   'Only one machinery job in a room at a time — they need the same floor space and the same hands.'),
  ('trade_pair', 'spraying',  'sanding',  'warn',
   'Don''t spray while anyone is sanding — the dust lands in the wet paint.'),
  ('trade_pair', 'hot work',  'spraying', 'block',
   'No hot work while spraying. Solvent vapour and sparks.'),
  ('trade_pair', 'hot work',  'varnish',  'block',
   'No hot work near fresh varnish. Solvent vapour and sparks.'),
  ('trade_pair', 'spraying',  'varnish',  'warn',
   'Spraying near fresh varnish contaminates the finish.')
) as v(kind, trade_a, trade_b, severity, reason)
where not exists (
  select 1 from yard_conflict_rules r
  where r.kind = v.kind
    and r.trade_a is not distinct from v.trade_a
    and r.trade_b is not distinct from v.trade_b
    and r.zone_id is null
);


-- ============================================
-- 8) Notifications: widen the kind CHECK so a clash can be sent.
--    This is the one place this migration touches a table shared with the
--    petty cash app. It only WIDENS the allowed set — no existing row can
--    become invalid, and petty cash never writes to `notifications`.
-- ============================================
alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in (
    'inventory_critical',
    'maintenance_due_soon',
    'maintenance_due',
    'maintenance_overdue',
    'yard_conflict'
  ));


-- ============================================
-- 9) RLS — signed-in read, admin write. Same posture as every other yard
--    table (01_vessel_ops_schema). Money is additionally admin-gated in the
--    app layer; RLS here is the second line, never the only one.
-- ============================================
alter table yard_vendors        enable row level security;
alter table yard_estimates      enable row level security;
alter table yard_invoices       enable row level security;
alter table yard_payments       enable row level security;
alter table yard_conflict_rules enable row level security;

drop policy if exists "Signed in reads yard_vendors" on yard_vendors;
create policy "Signed in reads yard_vendors" on yard_vendors
  for select using (auth.uid() is not null);
drop policy if exists "Admin writes yard_vendors" on yard_vendors;
create policy "Admin writes yard_vendors" on yard_vendors
  for all using (is_admin()) with check (is_admin());

drop policy if exists "Signed in reads yard_estimates" on yard_estimates;
create policy "Signed in reads yard_estimates" on yard_estimates
  for select using (auth.uid() is not null);
drop policy if exists "Admin writes yard_estimates" on yard_estimates;
create policy "Admin writes yard_estimates" on yard_estimates
  for all using (is_admin()) with check (is_admin());

drop policy if exists "Signed in reads yard_invoices" on yard_invoices;
create policy "Signed in reads yard_invoices" on yard_invoices
  for select using (auth.uid() is not null);
drop policy if exists "Admin writes yard_invoices" on yard_invoices;
create policy "Admin writes yard_invoices" on yard_invoices
  for all using (is_admin()) with check (is_admin());

drop policy if exists "Signed in reads yard_payments" on yard_payments;
create policy "Signed in reads yard_payments" on yard_payments
  for select using (auth.uid() is not null);
drop policy if exists "Admin writes yard_payments" on yard_payments;
create policy "Admin writes yard_payments" on yard_payments
  for all using (is_admin()) with check (is_admin());

drop policy if exists "Signed in reads yard_conflict_rules" on yard_conflict_rules;
create policy "Signed in reads yard_conflict_rules" on yard_conflict_rules
  for select using (auth.uid() is not null);
drop policy if exists "Admin writes yard_conflict_rules" on yard_conflict_rules;
create policy "Admin writes yard_conflict_rules" on yard_conflict_rules
  for all using (is_admin()) with check (is_admin());
